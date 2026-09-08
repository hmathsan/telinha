import { app, BrowserWindow, ipcMain, session } from "electron";
import type { AppToSignalerMessage } from "@pvt-broadcast/protocol";
import { enableWindowsGraphicsCapture } from "./wgcFlags.js";
import { applyDebugEncoderOverrides } from "./debugSwitches.js";
import { createMainWindow } from "./mainWindow.js";
import { openFontePicker } from "./sourcePicker.js";
import { SignalingClient } from "./signalingClient.js";
import { exportDiagnostics } from "./diagnosticsExport.js";
import { startAutoUpdater } from "./autoUpdater.js";
import { IPC_CHANNELS, type ConnectAction, type DiagnosticsExportRequest } from "../shared/ipc.js";

// Precisa rodar antes de app.whenReady() (spec 0003, "A captura de janela precisa de WGC").
enableWindowsGraphicsCapture();
applyDebugEncoderOverrides();

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
        .catch(() => callback({}));
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
    if (!mainWindow) return { savedPath: null };
    return exportDiagnostics(mainWindow, request);
  });
}

function registerSignalerUrlIpc(): void {
  ipcMain.handle(IPC_CHANNELS.signalerUrl, () => SIGNALER_URL);
}

app.whenReady().then(() => {
  registerDisplayMediaHandler();
  registerSessaoIpc();
  registerDiagnosticsIpc();
  registerSignalerUrlIpc();
  startAutoUpdater();
  mainWindow = createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  signalingClient?.leave();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
