import { describe, expect, it } from "vitest";
import { buildEncodingParameters, MAX_BITRATE_BPS } from "./bitrate.js";

describe("buildEncodingParameters", () => {
  it("defaults to the 720p30 ceiling from ADR 0002", () => {
    expect(buildEncodingParameters()).toEqual([{ maxBitrate: MAX_BITRATE_BPS }]);
  });

  it("accepts a custom ceiling", () => {
    expect(buildEncodingParameters(1_000_000)).toEqual([{ maxBitrate: 1_000_000 }]);
  });
});
