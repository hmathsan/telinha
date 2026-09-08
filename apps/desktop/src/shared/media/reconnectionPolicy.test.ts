import { describe, expect, it } from "vitest";
import { decideIceRecoveryAction, type IceConnectionState } from "./reconnectionPolicy.js";

describe("decideIceRecoveryAction", () => {
  it("waits on disconnected, since it resolves on its own most of the time", () => {
    expect(decideIceRecoveryAction("disconnected")).toBe("wait");
  });

  it("restarts ICE on failed", () => {
    expect(decideIceRecoveryAction("failed")).toBe("restart-ice");
  });

  const noActionStates: IceConnectionState[] = ["new", "checking", "connected", "completed", "closed"];
  for (const state of noActionStates) {
    it(`takes no action on ${state}`, () => {
      expect(decideIceRecoveryAction(state)).toBe("none");
    });
  }
});
