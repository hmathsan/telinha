import { describe, expect, it } from "vitest";
import { rotularFontes } from "./fonteLabels.js";

describe("rotularFontes", () => {
  it("numbers monitors in the order the system hands them over", () => {
    const rotuladas = rotularFontes([
      { kind: "screen", name: "Screen 1" },
      { kind: "screen", name: "Entire screen" },
    ]);
    expect(rotuladas.map((f) => f.name)).toEqual(["Monitor 1", "Monitor 2"]);
  });

  it("leaves window names alone — that's what the person recognizes", () => {
    const rotuladas = rotularFontes([{ kind: "window", name: "Discord" }]);
    expect(rotuladas[0]?.name).toBe("Discord");
  });

  it("counts only monitors, so an interleaved window does not shift the numbering", () => {
    const rotuladas = rotularFontes([
      { kind: "screen", name: "Screen 1" },
      { kind: "window", name: "Visual Studio Code" },
      { kind: "screen", name: "Screen 2" },
    ]);
    expect(rotuladas.map((f) => f.name)).toEqual(["Monitor 1", "Visual Studio Code", "Monitor 2"]);
  });

  it("keeps the other fields of each Fonte untouched", () => {
    const rotuladas = rotularFontes([{ kind: "screen", name: "Screen 1", id: "screen:0:0" }]);
    expect(rotuladas[0]).toEqual({ kind: "screen", name: "Monitor 1", id: "screen:0:0" });
  });
});
