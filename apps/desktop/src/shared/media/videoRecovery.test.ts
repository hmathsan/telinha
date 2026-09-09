import { describe, expect, it } from "vitest";
import {
  MAX_REATTACH_ATTEMPTS,
  shouldReattachVideo,
  STALE_FRAME_MS,
  type VideoSurfaceHealth,
} from "./videoRecovery.js";

const healthy: VideoSurfaceHealth = {
  msSinceLastFrame: 0,
  trackReadyState: "live",
  trackMuted: false,
  attempts: 0,
};

describe("shouldReattachVideo", () => {
  it("leaves an element that is receiving frames alone", () => {
    expect(shouldReattachVideo(healthy)).toBe(false);
  });

  it("reattaches when a live, unmuted track stops painting", () => {
    expect(shouldReattachVideo({ ...healthy, msSinceLastFrame: STALE_FRAME_MS + 1 })).toBe(true);
  });

  it("tolerates a gap shorter than the threshold", () => {
    expect(shouldReattachVideo({ ...healthy, msSinceLastFrame: STALE_FRAME_MS })).toBe(false);
  });

  it("does not reattach an ended track — there is no media to paint", () => {
    expect(
      shouldReattachVideo({ ...healthy, msSinceLastFrame: 10_000, trackReadyState: "ended" }),
    ).toBe(false);
  });

  it("does not reattach a muted track — the other side stopped sending", () => {
    expect(shouldReattachVideo({ ...healthy, msSinceLastFrame: 10_000, trackMuted: true })).toBe(false);
  });

  it("gives up after the attempt ceiling", () => {
    const stale = { ...healthy, msSinceLastFrame: 10_000 };
    expect(shouldReattachVideo({ ...stale, attempts: MAX_REATTACH_ATTEMPTS - 1 })).toBe(true);
    expect(shouldReattachVideo({ ...stale, attempts: MAX_REATTACH_ATTEMPTS })).toBe(false);
  });
});
