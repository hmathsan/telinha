import { describe, expect, it } from "vitest";
import { preferH264 } from "./codecPreference.js";

describe("preferH264", () => {
  it("moves H264 entries to the front, case-insensitively", () => {
    const codecs = [{ mimeType: "video/VP8" }, { mimeType: "video/H264" }, { mimeType: "video/VP9" }];
    expect(preferH264(codecs)).toEqual([{ mimeType: "video/H264" }, { mimeType: "video/VP8" }, { mimeType: "video/VP9" }]);
  });

  it("preserves the relative order within each group", () => {
    const codecs = [
      { mimeType: "video/VP9", profile: "a" },
      { mimeType: "video/H264", profile: "b" },
      { mimeType: "video/VP8", profile: "c" },
      { mimeType: "video/H264", profile: "d" },
    ];
    expect(preferH264(codecs).map((c) => c.profile)).toEqual(["b", "d", "a", "c"]);
  });

  it("passes an empty list through unchanged", () => {
    expect(preferH264([])).toEqual([]);
  });

  it("returns the list unchanged in order when there is no H264 entry", () => {
    const codecs = [{ mimeType: "video/VP9" }, { mimeType: "video/VP8" }];
    expect(preferH264(codecs)).toEqual(codecs);
  });
});
