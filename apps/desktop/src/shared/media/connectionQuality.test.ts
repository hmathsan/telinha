import { describe, expect, it } from "vitest";
import { isConnectionDegraded } from "./connectionQuality.js";

describe("isConnectionDegraded", () => {
  const notLimited = { qualityLimitationReason: null };

  it("is not degraded when connected and unrestricted", () => {
    expect(isConnectionDegraded({ iceConnectionState: "connected", ...notLimited })).toBe(false);
    expect(isConnectionDegraded({ iceConnectionState: "completed", ...notLimited })).toBe(false);
  });

  const brokenStates = ["checking", "disconnected", "failed"];
  for (const state of brokenStates) {
    it(`is degraded while ICE is ${state}`, () => {
      expect(isConnectionDegraded({ iceConnectionState: state, ...notLimited })).toBe(true);
    });
  }

  it("is degraded when the encoder is bandwidth-limited even while connected", () => {
    expect(isConnectionDegraded({ iceConnectionState: "connected", qualityLimitationReason: "bandwidth" })).toBe(true);
  });

  it("is not degraded when limited by cpu, not bandwidth", () => {
    expect(isConnectionDegraded({ iceConnectionState: "connected", qualityLimitationReason: "cpu" })).toBe(false);
  });
});
