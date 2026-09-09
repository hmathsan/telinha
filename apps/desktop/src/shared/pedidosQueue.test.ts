import { describe, expect, it } from "vitest";
import type { EntryRequestEntry } from "./clientSessaoState.js";
import { MAX_CARDS_ATRAS, selectPilhaDePedidos } from "./pedidosQueue.js";

function pedidos(n: number): EntryRequestEntry[] {
  return Array.from({ length: n }, (_, i) => ({ participanteId: `p${i}`, name: `Pessoa ${i}` }));
}

describe("selectPilhaDePedidos", () => {
  it("has nothing to show with an empty queue", () => {
    const pilha = selectPilhaDePedidos([]);
    expect(pilha.ativo).toBeNull();
    expect(pilha.atras).toEqual([]);
    expect(pilha.restantes).toBe(0);
    expect(pilha.total).toBe(0);
  });

  it("answers the oldest request first: whoever asked first is answered first", () => {
    const pilha = selectPilhaDePedidos(pedidos(3));
    expect(pilha.ativo?.participanteId).toBe("p0");
  });

  it("draws no card behind and counts nothing with a single request", () => {
    const pilha = selectPilhaDePedidos(pedidos(1));
    expect(pilha.atras).toEqual([]);
    expect(pilha.restantes).toBe(0);
  });

  it("counts everyone still waiting, even beyond the cards it draws", () => {
    const pilha = selectPilhaDePedidos(pedidos(6));
    expect(pilha.atras).toHaveLength(MAX_CARDS_ATRAS);
    expect(pilha.restantes).toBe(5);
    expect(pilha.total).toBe(6);
  });

  it("keeps the drawn cards in queue order, nearest first", () => {
    const pilha = selectPilhaDePedidos(pedidos(4));
    expect(pilha.atras.map((p) => p.participanteId)).toEqual(["p1", "p2"]);
  });
});
