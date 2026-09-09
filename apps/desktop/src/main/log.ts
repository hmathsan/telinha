import { join } from "node:path";
import { app, type BrowserWindow, shell } from "electron";
import log from "electron-log/main";
import { PROTOCOL_VERSION } from "@scrn-broadcast/protocol";
import type { LogEntry } from "../shared/ipc.js";

/**
 * Log local em arquivo. Não é telemetria: nada sai da máquina, exatamente como o diagnóstico
 * exportado (spec 0003, "Diagnóstico"). Existe porque uma transmissão terminou sozinha num teste
 * com várias pessoas e não havia como saber por quê — o app engolia o erro do WebSocket, o do
 * SDP e o do encoder sem deixar rastro nenhum.
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function logsDirectory(): string {
  return join(app.getPath("userData"), "logs");
}

export function initLogging(): void {
  log.initialize();
  log.transports.file.level = "info";
  log.transports.file.maxSize = MAX_FILE_BYTES;
  log.transports.file.resolvePathFn = () => join(logsDirectory(), "main.log");
  log.transports.console.level = app.isPackaged ? false : "debug";

  // Sem diálogo: um erro não tratado já é ruim o bastante sem uma janela modal por cima da
  // transmissão. O arquivo é o destino, e a linha que interessa é o stack.
  log.errorHandler.startCatching({ showDialog: false });

  log.info("boot", {
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    protocolVersion: PROTOCOL_VERSION,
    platform: `${process.platform} ${process.arch}`,
  });

  app.on("render-process-gone", (_event, _contents, details) => {
    log.error("render-process-gone", details);
  });
  app.on("child-process-gone", (_event, details) => {
    log.error("child-process-gone", details);
  });
}

/** Os eventos de janela que hoje somem: `loadURL`/`loadFile` falham com `void` em `mainWindow.ts`. */
export function watchWindow(window: BrowserWindow): void {
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    log.error("did-fail-load", { errorCode, errorDescription, validatedURL });
  });
  window.webContents.on("unresponsive", () => log.warn("window-unresponsive"));
  window.webContents.on("responsive", () => log.info("window-responsive"));
}

export function openLogsFolder(): Promise<string> {
  return shell.openPath(logsDirectory());
}

export function logFromRenderer(entry: LogEntry): void {
  const line = `[renderer] ${entry.message}`;
  if (entry.level === "error") log.error(line, entry.data ?? "");
  else if (entry.level === "warn") log.warn(line, entry.data ?? "");
  else log.info(line, entry.data ?? "");
}

export { log };
