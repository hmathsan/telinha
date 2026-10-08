import { describe, expect, it } from "vitest";
import { selectPalcoClick, selectPalcoLayout } from "./palcoSelection.js";
import { selectSomAudivel } from "./somSelection.js";

/** Os casos passam pelo layout de verdade, para a regra do Som não divergir da do Palco. */
function audivel(options: {
  transmissorIds: readonly string[];
  promotedId?: string | null;
  modoPreferido?: "foco" | "grade";
  myId?: string | null;
}): string[] {
  const layout = selectPalcoLayout({
    transmissorIds: options.transmissorIds,
    streamIds: new Set(options.transmissorIds),
    promotedId: options.promotedId ?? null,
    modoPreferido: options.modoPreferido ?? "foco",
  });
  return [
    ...selectSomAudivel({
      modo: layout.modo,
      stagedId: layout.stagedId,
      cellIds: layout.cellIds,
      myId: options.myId ?? "eu",
    }),
  ].sort();
}

describe("selectSomAudivel", () => {
  it("no Foco com dois Transmissores, ouve só o Palco", () => {
    expect(audivel({ transmissorIds: ["a", "b"] })).toEqual(["a"]);
  });

  it("promover a miniatura troca quem se ouve", () => {
    const layout = selectPalcoLayout({
      transmissorIds: ["a", "b"],
      streamIds: new Set(["a", "b"]),
      promotedId: null,
      modoPreferido: "foco",
    });
    const click = selectPalcoClick({
      modo: layout.modo,
      alternadorVisivel: layout.alternadorVisivel,
      clickedId: "b",
      stagedId: layout.stagedId,
    });
    expect(audivel({ transmissorIds: ["a", "b"], promotedId: click.promotedId, modoPreferido: click.modoPreferido })).toEqual(
      ["b"],
    );
  });

  it("na Grade, ouve os dois", () => {
    expect(audivel({ transmissorIds: ["a", "b"], modoPreferido: "grade" })).toEqual(["a", "b"]);
  });

  it("o próprio Transmissor nunca entra no Palco do Foco", () => {
    expect(audivel({ transmissorIds: ["eu", "b"], myId: "eu" })).toEqual([]);
    expect(audivel({ transmissorIds: ["eu"], myId: "eu" })).toEqual([]);
  });

  it("o próprio Transmissor nunca entra na Grade", () => {
    expect(audivel({ transmissorIds: ["eu", "b"], modoPreferido: "grade", myId: "eu" })).toEqual(["b"]);
  });

  it("Palco vazio devolve conjunto vazio", () => {
    expect(selectSomAudivel({ modo: "foco", stagedId: null, cellIds: [], myId: "eu" }).size).toBe(0);
    expect(audivel({ transmissorIds: [] })).toEqual([]);
  });

  it("sem identidade ainda, ninguém é excluído por engano", () => {
    expect(selectSomAudivel({ modo: "foco", stagedId: "a", cellIds: [], myId: null })).toEqual(new Set(["a"]));
  });
});
