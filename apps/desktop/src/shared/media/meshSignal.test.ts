import { describe, expect, it } from "vitest";
import { connectionKey, meshSignalPayloadSchema } from "./meshSignal.js";

describe("meshSignalPayloadSchema", () => {
  it("accepts a well-formed offer", () => {
    const result = meshSignalPayloadSchema.safeParse({
      kind: "offer",
      transmissorId: "t1",
      espectadorId: "e1",
      sdp: { type: "offer", sdp: "v=0..." },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a well-formed ice candidate", () => {
    const result = meshSignalPayloadSchema.safeParse({
      kind: "ice-candidate",
      transmissorId: "t1",
      espectadorId: "e1",
      candidate: { candidate: "candidate:1 1 UDP ...", sdpMid: "0", sdpMLineIndex: 0 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a recovery request in both modes", () => {
    for (const mode of ["ice-restart", "recreate"]) {
      const result = meshSignalPayloadSchema.safeParse({
        kind: "recovery-request",
        transmissorId: "t1",
        espectadorId: "e1",
        mode,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects a recovery request with an unknown mode", () => {
    const result = meshSignalPayloadSchema.safeParse({
      kind: "recovery-request",
      transmissorId: "t1",
      espectadorId: "e1",
      mode: "reboot-everything",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    const result = meshSignalPayloadSchema.safeParse({ kind: "bogus", transmissorId: "t1", espectadorId: "e1" });
    expect(result.success).toBe(false);
  });

  it("rejects a payload missing required fields", () => {
    const result = meshSignalPayloadSchema.safeParse({ kind: "offer", transmissorId: "t1" });
    expect(result.success).toBe(false);
  });
});

describe("connectionKey", () => {
  it("keys a connection by the (transmissor, espectador) pair, not by an unordered pair", () => {
    expect(connectionKey("a", "b")).not.toBe(connectionKey("b", "a"));
  });

  it("is stable for the same pair", () => {
    expect(connectionKey("a", "b")).toBe(connectionKey("a", "b"));
  });
});
