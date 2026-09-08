import { describe, expect, it } from "vitest";
import { nextBackoffDelayMs } from "./backoff.js";

const noJitter = () => 0.5; // (0.5 * 2 - 1) === 0

describe("nextBackoffDelayMs", () => {
  it("starts at the initial delay on the first attempt", () => {
    expect(nextBackoffDelayMs(0, {}, noJitter)).toBe(500);
  });

  it("doubles per attempt with the default factor", () => {
    expect(nextBackoffDelayMs(1, {}, noJitter)).toBe(1000);
    expect(nextBackoffDelayMs(2, {}, noJitter)).toBe(2000);
    expect(nextBackoffDelayMs(3, {}, noJitter)).toBe(4000);
  });

  it("caps at maxDelayMs no matter how large the attempt count", () => {
    expect(nextBackoffDelayMs(20, {}, noJitter)).toBe(30_000);
  });

  it("never returns a negative delay even at the extremes of jitter", () => {
    const alwaysMin = () => 0; // (0 * 2 - 1) === -1 -> full negative jitter
    expect(nextBackoffDelayMs(0, {}, alwaysMin)).toBeGreaterThanOrEqual(0);
  });

  it("keeps jitter within the configured ratio of the base delay", () => {
    const alwaysMax = () => 1; // (1 * 2 - 1) === 1 -> full positive jitter
    const delay = nextBackoffDelayMs(0, { jitterRatio: 0.2 }, alwaysMax);
    expect(delay).toBe(600); // 500 + 20%
  });

  it("respects custom options", () => {
    expect(nextBackoffDelayMs(0, { initialDelayMs: 100, factor: 3, maxDelayMs: 1000 }, noJitter)).toBe(100);
    expect(nextBackoffDelayMs(1, { initialDelayMs: 100, factor: 3, maxDelayMs: 1000 }, noJitter)).toBe(300);
    expect(nextBackoffDelayMs(5, { initialDelayMs: 100, factor: 3, maxDelayMs: 1000 }, noJitter)).toBe(1000);
  });
});
