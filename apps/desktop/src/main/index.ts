import { release } from "node:os";
import { app, BrowserWindow, clipboard, ipcMain, session, type DesktopCapturerSource, type Streams } from "electron";
import type { AppToSignalerMessage } from "@scrn-broadcast/protocol";
import { enableWindowsGraphicsCapture } from "./wgcFlags.js";
import { disableOwnAudioMixBack } from "./somFlags.js";
import { applyHardwareAccelOverrides } from "./debugSwitches.js";
import { processIdOfWindow } from "./windowProcess.js";
import { createMainWindow } from "./mainWindow.js";
import { applyDevToolsPolicy } from "./devTools.js";
import { openFontePicker } from "./sourcePicker.js";
import { SignalingClient } from "./signalingClient.js";
import { exportDiagnostics } from "./diagnosticsExport.js";
import { startAutoUpdater } from "./autoUpdater.js";
import { initLogging, log, logFromRenderer, openLogsFolder, watchWindow } from "./log.js";
import {
  IPC_CHANNELS,
  type ConnectAction,
  type DiagnosticsExportRequest,
  type LogEntry,
  type SomCaptureReport,
} from "../shared/ipc.js";
import { somForced } from "../shared/hardening.js";
import { decideSomCapture, hwndFromSourceId, windowsBuildFrom } from "../shared/media/somCapture.js";

// Primeiro de tudo: qualquer coisa que quebre daqui para baixo precisa cair no arquivo.
initLogging();

// Precisa rodar antes de app.whenReady() (spec 0003, "A captura de janela precisa de WGC").
enableWindowsGraphicsCapture();
// Idem (spec 0009, invariante do Som, ponto 4).
disableOwnAudioMixBack();
applyHardwareAccelOverrides();

const SIGNALER_URL = import.meta.env.MAIN_VITE_SIGNALER_URL ?? "ws://localhost:8787";

/** Quanto tempo o reenvio sem Som fica armado (spec 0009, "IPC novo"). */
const RETRY_WITHOUT_SOM_WINDOW_MS = 10_000;

let mainWindow: BrowserWindow | null = null;
let signalingClient: SignalingClient | null = null;

/** A última escolha do seletor com áudio pedido, e quando foi feita. */
let lastSomCapture: { readonly report: SomCaptureReport; readonly source: DesktopCapturerSource; readonly at: number } | null =
  null;
/** O reenvio só com vídeo, armado por `retryCaptureWithoutSom`. Uso único. */
let retryWithoutSom: { readonly report: SomCaptureReport; readonly source: DesktopCapturerSource; readonly expiresAt: number } | null =
  null;

/** Decide o Som da Fonte escolhida e monta a resposta do handler. */
function streamsWithSom(source: DesktopCapturerSource): Streams {
  const fonteKind = source.id.startsWith("screen") ? "screen" : "window";
  const hwnd = fonteKind === "window" ? hwndFromSourceId(source.id) : null;
  const pid = hwnd !== null ? processIdOfWindow(hwnd) : null;
  const windowsBuild = windowsBuildFrom(release());
  const forced = somForced(process.env);
  const somRequested = true;

  const decision = decideSomCapture({ fonteKind, somRequested, windowsBuild, pid, ownPid: process.pid, forced });
  log.info("som-capture-requested", {
    fonteKind,
    windowName: source.name,
    pid,
    windowsBuild,
    forced,
    somRequested,
    ...(decision.audio !== null ? { mode: decision.mode } : { reason: decision.reason }),
  });
  lastSomCapture = { report: { fonteKind, decision }, source, at: Date.now() };

  if (decision.audio === null) return { video: source };
  // O único cast do Som, e o valor não documentado da ADR 0011: o Electron tipa `audio` como
  // "loopback" | "loopbackWithMute", mas repassa a string ao Chromium sem validar, e é assim que
  // `applicationLoopback:<pid>` e `loopbackWithoutChrome` chegam ao serviço de áudio.
  return { video: source, audio: decision.audio as "loopback" };
}

function registerDisplayMediaHandler(): void {
  // Substitui o seletor da Microsoft pela grade própria (spec 0003, "Captura").
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      if (!mainWindow) {
        callback({});
        return;
      }

      // A captura com Som foi recusada: a mesma Fonte volta só com vídeo, sem reabrir o seletor.
      const retry = retryWithoutSom;
      retryWithoutSom = null;
      if (retry && Date.now() <= retry.expiresAt) {
        log.info("som-capture-retry-without-som", {
          fonteKind: retry.report.fonteKind,
          mode: retry.report.decision.audio !== null ? retry.report.decision.mode : null,
        });
        callback({ video: retry.source });
        return;
      }

      // Uma escolha nova apaga a anterior: cancelar este seletor não pode armar um reenvio da Fonte velha.
      lastSomCapture = null;
      openFontePicker(mainWindow)
        .then((source) => {
          if (!source) {
            callback({});
            return;
          }
          callback(request.audioRequested ? streamsWithSom(source) : { video: source });
        })
        .catch((error: unknown) => {
          log.error("fonte-picker-failed", error);
          callback({});
        });
    },
    { useSystemPicker: false },
  );
}

function registerSomIpc(): void {
  ipcMain.handle(IPC_CHANNELS.somLastCapture, (): SomCaptureReport | null => lastSomCapture?.report ?? null);
  ipcMain.handle(IPC_CHANNELS.somRetryWithoutSom, (): boolean => {
    const last = lastSomCapture;
    const now = Date.now();
    // A frescura protege do caso em que `getDisplayMedia` rejeita antes de chegar ao handler: sem
    // ela, uma escolha antiga voltaria sem seletor.
    if (!last || last.report.decision.audio === null || now - last.at > RETRY_WITHOUT_SOM_WINDOW_MS) return false;
    retryWithoutSom = { report: last.report, source: last.source, expiresAt: now + RETRY_WITHOUT_SOM_WINDOW_MS };
    return true;
  });
}

function registerSessaoIpc(): void {
  signalingClient = new SignalingClient(SIGNALER_URL, {
    onMessage: (message) => {
      mainWindow?.webContents.send(IPC_CHANNELS.sessaoMessage, message);
    },
    onConnectionState: (state) => {
      mainWindow?.webContents.send(IPC_CHANNELS.sessaoConnectionState, state);
    },
  });

  ipcMain.on(IPC_CHANNELS.sessaoConnect, (_event, action: ConnectAction) => {
    signalingClient?.connect(action);
  });
  ipcMain.on(IPC_CHANNELS.sessaoSend, (_event, message: AppToSignalerMessage) => {
    signalingClient?.send(message);
  });
  ipcMain.on(IPC_CHANNELS.sessaoLeave, () => {
    signalingClient?.leave();
  });
}

function registerDiagnosticsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.diagnosticsExport, async (_event, request: DiagnosticsExportRequest) => {
    if (!mainWindow) return { savedPath: null, error: null };
    return exportDiagnostics(mainWindow, request);
  });
}

function registerLogIpc(): void {
  ipcMain.on(IPC_CHANNELS.logsOpenFolder, () => {
    void openLogsFolder().then((error) => {
      if (error) log.error("open-logs-folder-failed", error);
    });
  });
  ipcMain.on(IPC_CHANNELS.logWrite, (_event, entry: LogEntry) => logFromRenderer(entry));
}

function registerSignalerUrlIpc(): void {
  ipcMain.handle(IPC_CHANNELS.signalerUrl, () => SIGNALER_URL);
}

// O botão de copiar o Código de Sessão (spec 0008, "Barra superior"). Fica aqui porque o módulo
// `clipboard` do Electron não existe no renderer, e `navigator.clipboard` depende de permissão.
function registerClipboardIpc(): void {
  ipcMain.on(IPC_CHANNELS.clipboardWrite, (_event, text: string) => {
    clipboard.writeText(text);
  });
}

app.whenReady().then(() => {
  registerDisplayMediaHandler();
  registerSomIpc();
  registerSessaoIpc();
  registerDiagnosticsIpc();
  registerSignalerUrlIpc();
  registerClipboardIpc();
  registerLogIpc();
  startAutoUpdater();
  mainWindow = createMainWindow();
  applyDevToolsPolicy(mainWindow);
  watchWindow(mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      applyDevToolsPolicy(mainWindow);
      watchWindow(mainWindow);
    }
  });
});

app.on("window-all-closed", () => {
  signalingClient?.leave();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
