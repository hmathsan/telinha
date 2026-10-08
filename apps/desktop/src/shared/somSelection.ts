import type { ModoPalco } from "./palcoSelection.js";

/**
 * Quem se ouve, fora do React (spec 0009, "Reprodução no Espectador"). Por padrão o Palco decide
 * (CONTEXT.md, "Palco"); a 0010 acrescenta aqui as escolhas manuais de quem assiste.
 */

export interface SomAudivelInput {
  readonly modo: ModoPalco;
  readonly stagedId: string | null;
  readonly cellIds: readonly string[];
  readonly myId: string | null;
}

/** Foco: só quem está no Palco. Grade: todas as células. Nunca o próprio Participante. */
export function selectSomAudivel(input: SomAudivelInput): ReadonlySet<string> {
  const candidatos = input.modo === "grade" ? input.cellIds : input.stagedId !== null ? [input.stagedId] : [];
  // A stream local também tem áudio: tocá-la faria quem transmite ouvir o próprio jogo em dobro.
  return new Set(candidatos.filter((id) => id !== input.myId));
}
