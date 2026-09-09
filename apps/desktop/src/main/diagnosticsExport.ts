import { writeFile } from "node:fs/promises";
import { type BrowserWindow, dialog } from "electron";
import { log } from "./log.js";
import type { DiagnosticsExportRequest, DiagnosticsExportResult } from "../shared/ipc.js";

/**
 * O botão "exportar diagnóstico" gera um arquivo com o histórico da conexão para o amigo mandar
 * no Discord (spec 0003, "Diagnóstico"). Sem telemetria remota — o arquivo só existe localmente.
 */
export async function exportDiagnostics(
  parent: BrowserWindow,
  request: DiagnosticsExportRequest,
): Promise<DiagnosticsExportResult> {
  const { canceled, filePath } = await dialog.showSaveDialog(parent, {
    title: "Exportar diagnóstico",
    defaultPath: request.suggestedFileName,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (canceled || !filePath) {
    return { savedPath: null, error: null };
  }
  // Sem este try, uma falha de gravação (disco cheio, pasta protegida) virava uma rejection
  // flutuante: o botão simplesmente não fazia nada, e ninguém ficava sabendo por quê.
  try {
    await writeFile(filePath, request.content, "utf-8");
  } catch (error) {
    log.error("diagnostics-export-failed", error);
    return { savedPath: null, error: error instanceof Error ? error.message : String(error) };
  }
  log.info("diagnostics-exported", { filePath });
  return { savedPath: filePath, error: null };
}
