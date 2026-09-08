import { writeFile } from "node:fs/promises";
import { type BrowserWindow, dialog } from "electron";
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
    return { savedPath: null };
  }
  await writeFile(filePath, request.content, "utf-8");
  return { savedPath: filePath };
}
