import { describe, expect, it } from "vitest";
import {
  DISCONNECTED_GRACE_MS,
  MAX_RESTART_ATTEMPTS,
  STALLED_MEDIA_MS,
  decideIceRecoveryAction,
  isMediaStalled,
  type IceConnectionState,
} from "./reconnectionPolicy.js";

describe("decideIceRecoveryAction", () => {
  const noActionStates: IceConnectionState[] = ["new", "checking", "connected", "completed", "closed"];
  for (const state of noActionStates) {
    it(`takes no action on ${state}`, () => {
      expect(decideIceRecoveryAction({ state, msUnhealthy: 60_000, restartAttempts: 0 })).toBe("none");
    });
  }

  it("waits while disconnected is still inside the grace period", () => {
    expect(
      decideIceRecoveryAction({ state: "disconnected", msUnhealthy: 0, restartAttempts: 0 }),
    ).toBe("wait");
    expect(
      decideIceRecoveryAction({
        state: "disconnected",
        msUnhealthy: DISCONNECTED_GRACE_MS - 1,
        restartAttempts: 0,
      }),
    ).toBe("wait");
  });

  it("escalates disconnected once the grace period is over — it does not resolve on its own", () => {
    expect(
      decideIceRecoveryAction({
        state: "disconnected",
        msUnhealthy: DISCONNECTED_GRACE_MS,
        restartAttempts: 0,
      }),
    ).toBe("restart-ice");
  });

  it("restarts ICE on failed without waiting", () => {
    expect(decideIceRecoveryAction({ state: "failed", msUnhealthy: 0, restartAttempts: 0 })).toBe(
      "restart-ice",
    );
  });

  it("recreates the connection once the restart attempts run out", () => {
    for (const state of ["disconnected", "failed"] as const) {
      expect(
        decideIceRecoveryAction({
          state,
          msUnhealthy: DISCONNECTED_GRACE_MS,
          restartAttempts: MAX_RESTART_ATTEMPTS - 1,
        }),
      ).toBe("restart-ice");
      expect(
        decideIceRecoveryAction({
          state,
          msUnhealthy: DISCONNECTED_GRACE_MS,
          restartAttempts: MAX_RESTART_ATTEMPTS,
        }),
      ).toBe("recreate");
    }
  });
});

describe("isMediaStalled", () => {
  const stalled = {
    role: "espectador",
    iceConnectionState: "connected",
    inboundBitrateBps: 0,
    msSinceMediaFlowing: STALLED_MEDIA_MS + 1,
  } as const;

  it("catches a frozen stream that ICE still reports as connected", () => {
    expect(isMediaStalled(stalled)).toBe(true);
    expect(isMediaStalled({ ...stalled, iceConnectionState: "completed" })).toBe(true);
  });

  it("never fires on a null bitrate — that is the first sample, not a stall", () => {
    expect(isMediaStalled({ ...stalled, inboundBitrateBps: null })).toBe(false);
  });

  it("ignores the transmissor role, whose inbound bitrate is always absent", () => {
    expect(isMediaStalled({ ...stalled, role: "transmissor" })).toBe(false);
  });

  it("leaves an unhealthy ICE state to decideIceRecoveryAction", () => {
    expect(isMediaStalled({ ...stalled, iceConnectionState: "disconnected" })).toBe(false);
    expect(isMediaStalled({ ...stalled, iceConnectionState: "checking" })).toBe(false);
  });

  it("holds until the threshold is crossed", () => {
    expect(isMediaStalled({ ...stalled, msSinceMediaFlowing: STALLED_MEDIA_MS })).toBe(false);
  });

  it("does not fire while media is flowing", () => {
    expect(isMediaStalled({ ...stalled, inboundBitrateBps: 1 })).toBe(false);
  });
});
