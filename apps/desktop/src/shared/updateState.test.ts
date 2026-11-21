import { describe, expect, it } from "vitest";
import {
  normalizeDownloadPercent,
  shouldShowUpdateBanner,
  type UpdateDismissal,
  type UpdateStatus,
} from "./updateState.js";

describe("shouldShowUpdateBanner", () => {
  it("nunca mostra faixa em idle", () => {
    const idle: UpdateStatus = { kind: "idle" };
    expect(shouldShowUpdateBanner(idle, null)).toBe(false);
    expect(shouldShowUpdateBanner(idle, { kind: "downloading", version: "1.1.0" })).toBe(false);
    expect(shouldShowUpdateBanner(idle, { kind: "ready", version: "1.1.0" })).toBe(false);
  });

  it("mostra faixa em downloading quando não foi dispensada", () => {
    expect(shouldShowUpdateBanner({ kind: "downloading", version: "1.1.0", percent: null }, null)).toBe(true);
    expect(shouldShowUpdateBanner({ kind: "downloading", version: "1.1.0", percent: 42 }, null)).toBe(true);
  });

  it("dispensar em downloading esconde o progresso daquela versão", () => {
    const dismissed: UpdateDismissal = { kind: "downloading", version: "1.1.0" };
    expect(shouldShowUpdateBanner({ kind: "downloading", version: "1.1.0", percent: 10 }, dismissed)).toBe(false);
    expect(shouldShowUpdateBanner({ kind: "downloading", version: "1.1.0", percent: 85 }, dismissed)).toBe(false);
  });

  it("downloading de uma versão diferente volta a mostrar mesmo com a anterior dispensada", () => {
    const dismissed: UpdateDismissal = { kind: "downloading", version: "1.1.0" };
    expect(shouldShowUpdateBanner({ kind: "downloading", version: "1.2.0", percent: 5 }, dismissed)).toBe(true);
  });

  it("transição de downloading para ready da mesma versão volta a mostrar a faixa", () => {
    const dismissed: UpdateDismissal = { kind: "downloading", version: "1.1.0" };
    expect(shouldShowUpdateBanner({ kind: "ready", version: "1.1.0" }, dismissed)).toBe(true);
  });

  it("dispensar em ready esconde aquela versão, mas uma versão posterior volta a mostrar", () => {
    const dismissed: UpdateDismissal = { kind: "ready", version: "1.1.0" };
    expect(shouldShowUpdateBanner({ kind: "ready", version: "1.1.0" }, dismissed)).toBe(false);
    expect(shouldShowUpdateBanner({ kind: "ready", version: "1.2.0" }, dismissed)).toBe(true);
  });
});

describe("normalizeDownloadPercent", () => {
  it("arredonda decimais para inteiro", () => {
    expect(normalizeDownloadPercent(0)).toBe(0);
    expect(normalizeDownloadPercent(42.4)).toBe(42);
    expect(normalizeDownloadPercent(42.5)).toBe(43);
    expect(normalizeDownloadPercent(99.6)).toBe(100);
    expect(normalizeDownloadPercent(100)).toBe(100);
  });

  it("limita o valor ao intervalo 0..100", () => {
    expect(normalizeDownloadPercent(-10)).toBe(0);
    expect(normalizeDownloadPercent(-0.2)).toBe(0);
    expect(normalizeDownloadPercent(100.4)).toBe(100);
    expect(normalizeDownloadPercent(250)).toBe(100);
  });

  it("devolve null para NaN, infinitos e não-números", () => {
    expect(normalizeDownloadPercent(Number.NaN)).toBeNull();
    expect(normalizeDownloadPercent(Number.POSITIVE_INFINITY)).toBeNull();
    expect(normalizeDownloadPercent(Number.NEGATIVE_INFINITY)).toBeNull();
    expect(normalizeDownloadPercent(null)).toBeNull();
    expect(normalizeDownloadPercent(undefined)).toBeNull();
    expect(normalizeDownloadPercent("42")).toBeNull();
    expect(normalizeDownloadPercent({})).toBeNull();
  });
});
