import { describe, expect, it } from "vitest";
import { selectPalco, selectPalcoClick, selectPalcoLayout, type PalcoLayoutInput } from "./palcoSelection.js";

function layoutInput(overrides: Partial<PalcoLayoutInput> = {}): PalcoLayoutInput {
  return {
    transmissorIds: [],
    streamIds: new Set(),
    promotedId: null,
    modoPreferido: "foco",
    ...overrides,
  };
}

describe("selectPalco", () => {
  it("returns null when nobody is transmitting", () => {
    expect(selectPalco([], null)).toBeNull();
  });

  it("defaults to the first Transmissor when nothing was promoted", () => {
    expect(selectPalco(["a", "b"], null)).toBe("a");
  });

  it("keeps the promoted Transmissor on the Palco when they're still transmitting", () => {
    expect(selectPalco(["a", "b"], "b")).toBe("b");
  });

  it("falls back to the first Transmissor once the promoted one stops transmitting", () => {
    expect(selectPalco(["a", "c"], "b")).toBe("a");
  });
});

describe("selectPalcoLayout", () => {
  it("reports the empty Palco when nobody is transmitting", () => {
    const layout = selectPalcoLayout(layoutInput());
    expect(layout.vazio).toBe(true);
    expect(layout.stagedId).toBeNull();
    expect(layout.alternadorVisivel).toBe(false);
  });

  it("hides the Foco/Grade alternador with a single Transmissor", () => {
    const layout = selectPalcoLayout(layoutInput({ transmissorIds: ["a"], streamIds: new Set(["a"]) }));
    expect(layout.alternadorVisivel).toBe(false);
    expect(layout.modo).toBe("foco");
    expect(layout.stagedId).toBe("a");
    expect(layout.thumbnailIds).toEqual([]);
  });

  it("shows the alternador from two Transmissores on", () => {
    const layout = selectPalcoLayout(layoutInput({ transmissorIds: ["a", "b"], streamIds: new Set(["a", "b"]) }));
    expect(layout.alternadorVisivel).toBe(true);
    expect(layout.thumbnailIds).toEqual(["b"]);
  });

  it("puts every Transmissor in a cell in Grade, in roster order", () => {
    const layout = selectPalcoLayout(
      layoutInput({ transmissorIds: ["a", "b"], streamIds: new Set(["b", "a"]), modoPreferido: "grade" }),
    );
    expect(layout.modo).toBe("grade");
    expect(layout.cellIds).toEqual(["a", "b"]);
    expect(layout.thumbnailIds).toEqual([]);
  });

  // O caso que ninguém reproduz à mão: sem isto, a Grade fica com uma célula só e a saída do
  // outro Transmissor deixa uma tela preta no lugar dele (spec 0008, "Pronto quando").
  it("falls back to Foco when a Transmissor leaves while the Grade is open, with nobody staged missing", () => {
    const grade = selectPalcoLayout(
      layoutInput({ transmissorIds: ["a", "b"], streamIds: new Set(["a", "b"]), modoPreferido: "grade" }),
    );
    expect(grade.modo).toBe("grade");

    const afterLeaving = selectPalcoLayout(
      layoutInput({ transmissorIds: ["b"], streamIds: new Set(["b"]), modoPreferido: "grade" }),
    );
    expect(afterLeaving.modo).toBe("foco");
    expect(afterLeaving.alternadorVisivel).toBe(false);
    expect(afterLeaving.stagedId).toBe("b");
    expect(afterLeaving.cellIds).toEqual([]);
    expect(afterLeaving.thumbnailIds).toEqual([]);
  });

  it("returns to Grade when a second Transmissor comes back, because the preference was kept", () => {
    const layout = selectPalcoLayout(
      layoutInput({ transmissorIds: ["b", "c"], streamIds: new Set(["b", "c"]), modoPreferido: "grade" }),
    );
    expect(layout.modo).toBe("grade");
  });

  it("ignores Transmissores whose stream has not arrived yet", () => {
    const layout = selectPalcoLayout(layoutInput({ transmissorIds: ["a", "b"], streamIds: new Set(["b"]) }));
    expect(layout.stagedId).toBe("b");
    expect(layout.alternadorVisivel).toBe(false);
  });

  it("keeps a promoted Transmissor on the Palco when switching back from Grade to Foco", () => {
    const layout = selectPalcoLayout(
      layoutInput({ transmissorIds: ["a", "b"], streamIds: new Set(["a", "b"]), promotedId: "b" }),
    );
    expect(layout.stagedId).toBe("b");
    expect(layout.thumbnailIds).toEqual(["a"]);
  });
});

describe("selectPalcoClick", () => {
  it("promotes the clicked cell and leaves the Grade for Foco", () => {
    expect(selectPalcoClick({ modo: "grade", alternadorVisivel: true, clickedId: "b", stagedId: "a" })).toEqual({
      modoPreferido: "foco",
      promotedId: "b",
    });
  });

  it("swaps who is on the Palco when a thumbnail is clicked, staying in Foco", () => {
    expect(selectPalcoClick({ modo: "foco", alternadorVisivel: true, clickedId: "b", stagedId: "a" })).toEqual({
      modoPreferido: "foco",
      promotedId: "b",
    });
  });

  it("goes to the Grade when the Fonte already on the Palco is clicked", () => {
    expect(selectPalcoClick({ modo: "foco", alternadorVisivel: true, clickedId: "a", stagedId: "a" })).toEqual({
      modoPreferido: "grade",
      promotedId: "a",
    });
  });

  // Mesma razão pela qual o alternador não aparece: não há escolha de layout a fazer.
  it("does nothing when the only Transmissor's Fonte is clicked", () => {
    expect(selectPalcoClick({ modo: "foco", alternadorVisivel: false, clickedId: "a", stagedId: "a" })).toEqual({
      modoPreferido: "foco",
      promotedId: "a",
    });
  });
});
