import { describe, expect, it } from "vitest";
import { SOM_SILENT_LEVEL, SOM_SILENT_LOG_MS, SomSilenceTracker } from "./somSilence.js";

describe("SomSilenceTracker", () => {
  it("não diz nada enquanto há som", () => {
    const tracker = new SomSilenceTracker();
    expect(tracker.observe(0.2, 0)).toBeNull();
    expect(tracker.observe(0.3, SOM_SILENT_LOG_MS * 2)).toBeNull();
  });

  it("não diz nada antes de o silêncio completar o prazo", () => {
    const tracker = new SomSilenceTracker();
    expect(tracker.observe(0, 0)).toBeNull();
    expect(tracker.observe(0, SOM_SILENT_LOG_MS - 1)).toBeNull();
  });

  it("anuncia o silêncio uma única vez, ao completar o prazo", () => {
    const tracker = new SomSilenceTracker();
    tracker.observe(0, 1000);
    expect(tracker.observe(0, 1000 + SOM_SILENT_LOG_MS)).toBe("went-silent");
    expect(tracker.silentForMs(1000 + SOM_SILENT_LOG_MS)).toBe(SOM_SILENT_LOG_MS);
    expect(tracker.observe(0, 1000 + SOM_SILENT_LOG_MS * 3)).toBeNull();
  });

  it("anuncia a volta do som só depois de ter anunciado o silêncio", () => {
    const tracker = new SomSilenceTracker();
    tracker.observe(0, 0);
    tracker.observe(0, SOM_SILENT_LOG_MS);
    expect(tracker.observe(0.5, SOM_SILENT_LOG_MS + 2000)).toBe("sound-returned");
    expect(tracker.observe(0.5, SOM_SILENT_LOG_MS + 4000)).toBeNull();
    expect(tracker.silentForMs(SOM_SILENT_LOG_MS + 4000)).toBe(0);
  });

  it("som no meio zera o relógio do silêncio, sem anunciar volta", () => {
    const tracker = new SomSilenceTracker();
    tracker.observe(0, 0);
    expect(tracker.observe(0.5, SOM_SILENT_LOG_MS - 1000)).toBeNull();
    expect(tracker.observe(0, SOM_SILENT_LOG_MS)).toBeNull();
    expect(tracker.observe(0, SOM_SILENT_LOG_MS * 2 - 1001)).toBeNull();
    expect(tracker.observe(0, SOM_SILENT_LOG_MS * 2)).toBe("went-silent");
  });

  it("null não conta nem zera", () => {
    const tracker = new SomSilenceTracker();
    tracker.observe(0, 0);
    expect(tracker.observe(null, SOM_SILENT_LOG_MS)).toBeNull();
    expect(tracker.observe(0, SOM_SILENT_LOG_MS + 1)).toBe("went-silent");
    expect(tracker.observe(null, SOM_SILENT_LOG_MS + 2)).toBeNull();
    expect(tracker.observe(0.5, SOM_SILENT_LOG_MS + 3)).toBe("sound-returned");
  });

  it("só nulls nunca viram silêncio", () => {
    const tracker = new SomSilenceTracker();
    expect(tracker.observe(null, 0)).toBeNull();
    expect(tracker.observe(null, SOM_SILENT_LOG_MS * 5)).toBeNull();
  });

  it("o limiar é SOM_SILENT_LEVEL: abaixo é silêncio, igual já é som", () => {
    const tracker = new SomSilenceTracker();
    tracker.observe(SOM_SILENT_LEVEL / 2, 0);
    expect(tracker.observe(SOM_SILENT_LEVEL / 2, SOM_SILENT_LOG_MS)).toBe("went-silent");
    expect(tracker.observe(SOM_SILENT_LEVEL, SOM_SILENT_LOG_MS + 1)).toBe("sound-returned");
  });

  it("reset esquece o silêncio em curso e o já anunciado", () => {
    const tracker = new SomSilenceTracker();
    tracker.observe(0, 0);
    tracker.observe(0, SOM_SILENT_LOG_MS);
    tracker.reset();
    expect(tracker.observe(0.5, SOM_SILENT_LOG_MS + 1)).toBeNull();
    tracker.observe(0, SOM_SILENT_LOG_MS + 2);
    expect(tracker.observe(0, SOM_SILENT_LOG_MS * 2)).toBeNull();
  });
});
