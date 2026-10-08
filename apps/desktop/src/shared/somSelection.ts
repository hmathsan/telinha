import type { ModoPalco } from "./palcoSelection.js";

/**
 * Quem se ouve, fora do React (spec 0009, "Reprodução no Espectador"). Por padrão o Palco decide
 * (CONTEXT.md, "Palco"); a escolha manual de quem assiste vence (spec 0010, "Quem se ouve").
 */

export interface SomAudivelInput {
  readonly modo: ModoPalco;
  readonly stagedId: string | null;
  readonly cellIds: readonly string[];
  readonly myId: string | null;
  /** id → true (ouvir) ou false (silenciar). Ausente = segue o Palco. */
  readonly escolhas: ReadonlyMap<string, boolean>;
}

/** O conjunto da 0009, com cada escolha manual por cima. O próprio Participante nunca entra. */
export function selectSomAudivel(input: SomAudivelInput): ReadonlySet<string> {
  const candidatos = input.modo === "grade" ? input.cellIds : input.stagedId !== null ? [input.stagedId] : [];
  const audivel = new Set(candidatos);
  for (const [id, ouvir] of input.escolhas) {
    if (ouvir) audivel.add(id);
    else audivel.delete(id);
  }
  // A stream local também tem áudio: tocá-la faria quem transmite ouvir o próprio jogo em dobro.
  if (input.myId !== null) audivel.delete(input.myId);
  return audivel;
}

/** Clique no mudo de uma Fonte: grava o oposto do que ela está agora. */
export function toggleSomEscolha(
  escolhas: ReadonlyMap<string, boolean>,
  id: string,
  audivelAgora: boolean,
): ReadonlyMap<string, boolean> {
  return new Map(escolhas).set(id, !audivelAgora);
}

/** Descarta escolhas e volumes de quem não transmite mais. */
export function pruneSomPorTransmissor<T>(
  porId: ReadonlyMap<string, T>,
  transmissorIds: readonly string[],
): ReadonlyMap<string, T> {
  const next = new Map([...porId].filter(([id]) => transmissorIds.includes(id)));
  // Mesma referência quando nada saiu: o estado do React não muda à toa.
  return next.size === porId.size ? porId : next;
}
