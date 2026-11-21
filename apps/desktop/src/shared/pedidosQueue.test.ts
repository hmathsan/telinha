import { describe, expect, it } from "vitest";
import type { EntryRequestEntry } from "./clientSessaoState.js";
import { MAX_CARDS_ATRAS, pedidosNovos, selectPilhaDePedidos } from "./pedidosQueue.js";

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

describe("pedidosNovos", () => {
  it("returns nothing for an empty list", () => {
    expect(pedidosNovos(new Set(), [])).toEqual([]);
  });

  it("returns a new entry request", () => {
    const [p0] = pedidos(1);
    expect(pedidosNovos(new Set(), [p0!])).toEqual([p0]);
  });

  it("does not return an already announced request, even if it disappeared and reappeared (Retomada)", () => {
    const [p0, p1] = pedidos(2);
    const anunciados = new Set<string>([p0!.participanteId]);
    // Sumiu e voltou (ex.: Anfitrião recebeu a lista de novo na Retomada).
    expect(pedidosNovos(anunciados, [])).toEqual([]);
    expect(pedidosNovos(anunciados, [p0!])).toEqual([]);
    expect(pedidosNovos(anunciados, [p0!, p1!])).toEqual([p1]);
  });

  it("returns multiple new requests in arrival order", () => {
    const [p0, p1, p2] = pedidos(3);
    const anunciados = new Set<string>([p0!.participanteId]);
    expect(pedidosNovos(anunciados, [p0!, p1!, p2!])).toEqual([p1, p2]);
  });
});
