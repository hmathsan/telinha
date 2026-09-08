import { describe, expect, it } from "vitest";
import { selectPalco } from "./palcoSelection.js";

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
