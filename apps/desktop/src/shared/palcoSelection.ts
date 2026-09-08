/**
 * Quem ocupa o Palco nesta janela: o primeiro Transmissor por padrão, ou quem foi promovido por
 * clique numa miniatura — enquanto essa pessoa ainda estiver transmitindo (spec 0004, "Palco").
 * Puramente local: não é o roster autoritativo (isso vive no sinalizador), só a escolha de exibição
 * de quem está vendo.
 */
export function selectPalco(transmissorIds: readonly string[], promotedId: string | null): string | null {
  if (promotedId !== null && transmissorIds.includes(promotedId)) return promotedId;
  return transmissorIds[0] ?? null;
}
