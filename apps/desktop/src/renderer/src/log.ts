import type { LogEntry } from "../../shared/ipc.js";

/**
 * O renderer não escreve em disco: manda a linha ao processo principal, que é o dono do arquivo
 * (`main/log.ts`). Mesmo caminho de todo o resto que precisa do Node.
 */
export function logToMain(level: LogEntry["level"], message: string, data?: unknown): void {
  window.scrnBroadcast.log({ level, message, data });
}

/**
 * Erros que escapam de todo o resto — inclusive de fora da árvore do React, onde o Error Boundary
 * não alcança (handlers de evento assíncronos, promessas do WebRTC).
 */
export function installGlobalErrorLogging(): void {
  window.addEventListener("error", (event) => {
    logToMain("error", "window-error", {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      stack: event.error instanceof Error ? event.error.stack : undefined,
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason: unknown = event.reason;
    logToMain("error", "unhandled-rejection", {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}
