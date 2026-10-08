import { describe, expect, it } from "vitest";
import { selectPalcoClick, selectPalcoLayout } from "./palcoSelection.js";
import { pruneSomPorTransmissor, selectSomAudivel, toggleSomEscolha } from "./somSelection.js";

/** Os casos passam pelo layout de verdade, para a regra do Som não divergir da do Palco. */
function audivel(options: {
  transmissorIds: readonly string[];
  promotedId?: string | null;
  modoPreferido?: "foco" | "grade";
  myId?: string | null;
  escolhas?: ReadonlyMap<string, boolean>;
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
      escolhas: options.escolhas ?? new Map(),
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
    expect(selectSomAudivel({ modo: "foco", stagedId: null, cellIds: [], myId: "eu", escolhas: new Map() }).size).toBe(0);
    expect(audivel({ transmissorIds: [] })).toEqual([]);
  });

  it("sem identidade ainda, ninguém é excluído por engano", () => {
    expect(selectSomAudivel({ modo: "foco", stagedId: "a", cellIds: [], myId: null, escolhas: new Map() })).toEqual(new Set(["a"]));
  });
});

describe("escolhas manuais (spec 0010)", () => {
  const ab = ["x", "y"];

  it("X silenciado no Palco continua mudo depois de promover Y e voltar a X", () => {
    let escolhas = toggleSomEscolha(new Map(), "x", true);
    expect(audivel({ transmissorIds: ab, escolhas })).toEqual([]);
    expect(audivel({ transmissorIds: ab, promotedId: "y", escolhas })).toEqual(["y"]);
    expect(audivel({ transmissorIds: ab, promotedId: "x", escolhas })).toEqual([]);
    escolhas = toggleSomEscolha(escolhas, "x", false);
    expect(audivel({ transmissorIds: ab, promotedId: "x", escolhas })).toEqual(["x"]);
  });

  it("no Foco, ligar a miniatura Y toca X e Y juntos", () => {
    const escolhas = toggleSomEscolha(new Map(), "y", false);
    expect(audivel({ transmissorIds: ab, escolhas })).toEqual(["x", "y"]);
  });

  it("volume não é escolha: X com volume baixo silencia quando Y é promovido", () => {
    const volumes = new Map([["x", 0.2]]);
    // O volume vive num mapa à parte e não entra na regra; as escolhas continuam vazias.
    expect(volumes.get("x")).toBe(0.2);
    expect(audivel({ transmissorIds: ab, promotedId: "y" })).toEqual(["y"]);
  });

  it("o próprio Participante nunca entra, mesmo com escolha true", () => {
    expect(audivel({ transmissorIds: ["eu", "y"], promotedId: "y", escolhas: new Map([["eu", true]]) })).toEqual(["y"]);
  });

  it("na Grade com uma escolha false, todos menos aquele se ouvem", () => {
    expect(audivel({ transmissorIds: ab, modoPreferido: "grade", escolhas: new Map([["x", false]]) })).toEqual(["y"]);
  });

  it("pruneSomPorTransmissor remove quem saiu e mantém quem ficou", () => {
    const porId = new Map([
      ["x", false],
      ["y", true],
    ]);
    expect([...pruneSomPorTransmissor(porId, ["y"])]).toEqual([["y", true]]);
    expect(pruneSomPorTransmissor(porId, ["x", "y"])).toBe(porId);
  });
});
