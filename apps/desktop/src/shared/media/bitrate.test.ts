import { describe, expect, it } from "vitest";
import { buildEncodingParameters, MAX_BITRATE_BPS, MAX_FRAMERATE } from "./bitrate.js";

describe("buildEncodingParameters", () => {
  it("defaults to the 720p30 ceiling from ADR 0002", () => {
    expect(buildEncodingParameters()).toEqual([{ maxBitrate: MAX_BITRATE_BPS }]);
  });

  it("accepts a custom ceiling", () => {
    expect(buildEncodingParameters(1_000_000)).toEqual([{ maxBitrate: 1_000_000 }]);
  });

  it("exports MAX_FRAMERATE = 30 and includes maxFramerate when provided", () => {
    expect(MAX_FRAMERATE).toBe(30);
    expect(buildEncodingParameters(MAX_BITRATE_BPS, { maxFramerate: MAX_FRAMERATE })).toEqual([
      { maxBitrate: MAX_BITRATE_BPS, maxFramerate: 30 },
    ]);
  });

  it("includes active flag when provided without leaking undefined fields", () => {
    expect(buildEncodingParameters(MAX_BITRATE_BPS, { active: false })).toEqual([
      { maxBitrate: MAX_BITRATE_BPS, active: false },
    ]);
    expect(buildEncodingParameters(MAX_BITRATE_BPS, { maxFramerate: MAX_FRAMERATE, active: true })).toEqual([
      { maxBitrate: MAX_BITRATE_BPS, maxFramerate: 30, active: true },
    ]);
  });
});
