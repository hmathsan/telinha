import { app, BrowserWindow, clipboard, ipcMain, session } from "electron";
import type { AppToSignalerMessage } from "@scrn-broadcast/protocol";
import { enableWindowsGraphicsCapture } from "./wgcFlags.js";
import { applyHardwareAccelOverrides } from "./debugSwitches.js";
import { createMainWindow } from "./mainWindow.js";
import { applyDevToolsPolicy } from "./devTools.js";
import { openFontePicker } from "./sourcePicker.js";
import { SignalingClient } from "./signalingClient.js";
import { exportDiagnostics } from "./diagnosticsExport.js";
import { startAutoUpdater } from "./autoUpdater.js";
import { initLogging, log, logFromRenderer, openLogsFolder, watchWindow } from "./log.js";
import { IPC_CHANNELS, type ConnectAction, type DiagnosticsExportRequest, type LogEntry } from "../shared/ipc.js";

// Primeiro de tudo: qualquer coisa que quebre daqui para baixo precisa cair no arquivo.
initLogging();

// Precisa rodar antes de app.whenReady() (spec 0003, "A captura de janela precisa de WGC").
enableWindowsGraphicsCapture();
applyHardwareAccelOverrides();

const SIGNALER_URL = import.meta.env.MAIN_VITE_SIGNALER_URL ?? "ws://localhost:8787";

let mainWindow: BrowserWindow | null = null;
let signalingClient: SignalingClient | null = null;

function registerDisplayMediaHandler(): void {
  // Substitui o seletor da Microsoft pela grade própria (spec 0003, "Captura").
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      if (!mainWindow) {
        callback({});
        return;
      }
      openFontePicker(mainWindow)
        .then((source) => {
          callback(source ? { video: source } : {});
        })
        .catch((error: unknown) => {
          log.error("fonte-picker-failed", error);
          callback({});
        });
    },
    { useSystemPicker: false },
  );
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
