/**
 * Estado puro da notificação de atualização (spec 0014). Vive fora do React para que as regras
 * de visibilidade e dispensa se testem sem montar interface nem empacotar o app.
 */

export type UpdateStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "downloading"; readonly version: string; readonly percent: number | null }
  | { readonly kind: "ready"; readonly version: string };

export interface UpdateDismissal {
  readonly kind: "downloading" | "ready";
  readonly version: string;
}

/**
 * Decide se a faixa de atualização deve aparecer. Dispensar durante o download esconde só o
 * progresso daquela versão — quando o download termina (`ready`), a faixa volta para que a pessoa
 * saiba que já pode reiniciar. Dispensar em `ready` esconde aquela versão nesta execução; uma
 * versão mais nova volta a aparecer.
 */
export function shouldShowUpdateBanner(
  status: UpdateStatus,
  dismissed: UpdateDismissal | null,
): boolean {
  if (status.kind === "idle") {
    return false;
  }
  if (!dismissed) {
    return true;
  }
  return !(dismissed.kind === status.kind && dismissed.version === status.version);
}

/** Normaliza o percentual do `electron-updater` (0–100 inteiro, ou `null` se inválido). */
export function normalizeDownloadPercent(percent: unknown): number | null {
  if (typeof percent !== "number" || !Number.isFinite(percent)) {
    return null;
  }
  const rounded = Math.round(percent);
  return Math.min(100, Math.max(0, rounded === 0 ? 0 : rounded));
}
