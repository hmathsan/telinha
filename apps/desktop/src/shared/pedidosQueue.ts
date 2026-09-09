import type { EntryRequestEntry } from "./clientSessaoState.js";

/**
 * A fila de pedidos de entrada, fora do React (AGENTS.md: "a lógica de Sessão fica fora do React",
 * mesmo motivo de `palcoSelection.ts`). Quantos cards se desenham, em que ordem e o que o contador
 * diz são decisões testáveis sem montar componente.
 *
 * A ordem é a de chegada: quem pediu primeiro é respondido primeiro. `entry-request` acrescenta ao
 * fim da lista no reducer, então o primeiro elemento é o mais antigo.
 */

/** Quantos cards ficam desenhados atrás do ativo. Mais que isso vira sujeira, não informação. */
export const MAX_CARDS_ATRAS = 2;

export interface PilhaDePedidos {
  /** O pedido que os botões Aprovar/Recusar respondem. `null` quando não há pedido nenhum. */
  readonly ativo: EntryRequestEntry | null;
  /** Os que ficam desenhados atrás, do mais próximo ao mais distante. Puramente decorativos. */
  readonly atras: readonly EntryRequestEntry[];
  /** Quantos pedidos ainda esperam depois do ativo — o `+N` do contador. */
  readonly restantes: number;
  readonly total: number;
}

export function selectPilhaDePedidos(pedidos: readonly EntryRequestEntry[]): PilhaDePedidos {
  const [ativo, ...resto] = pedidos;
  return {
    ativo: ativo ?? null,
    atras: resto.slice(0, MAX_CARDS_ATRAS),
    restantes: resto.length,
    total: pedidos.length,
  };
}
