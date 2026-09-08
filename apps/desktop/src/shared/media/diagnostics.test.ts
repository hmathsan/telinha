import { describe, expect, it } from "vitest";
import { DiagnosticsSampler, didFallBackToSoftwareEncoder } from "./diagnostics.js";
import type { StatsLike } from "./webrtcStatsLike.js";

function statsMap(entries: Record<string, StatsLike>): Map<string, StatsLike> {
  return new Map(Object.entries(entries));
}

function outboundStats(overrides: Partial<StatsLike> = {}) {
  return statsMap({
    transport1: { type: "transport", selectedCandidatePairId: "pair1" },
    pair1: { type: "candidate-pair", localCandidateId: "local1", remoteCandidateId: "remote1" },
    local1: { type: "local-candidate", candidateType: "host" },
    remote1: { type: "remote-candidate", candidateType: "host" },
    outbound1: {
      type: "outbound-rtp",
      kind: "video",
      bytesSent: 0,
      timestamp: 0,
      framesPerSecond: 30,
      encoderImplementation: "ExternalEncoder",
      qualityLimitationReason: "none",
      ...overrides,
    },
  });
}

describe("DiagnosticsSampler", () => {
  it("returns null bitrate on the first sample (no prior delta to compute from)", () => {
    const sampler = new DiagnosticsSampler();
    const snapshot = sampler.sample("conn1", outboundStats());
    expect(snapshot.outboundBitrateBps).toBeNull();
    expect(snapshot.framesPerSecond).toBe(30);
    expect(snapshot.encoderImplementation).toBe("ExternalEncoder");
    expect(snapshot.qualityLimitationReason).toBe("none");
  });

  it("computes bitrate from the byte/time delta between two samples", () => {
    const sampler = new DiagnosticsSampler();
    sampler.sample("conn1", outboundStats({ bytesSent: 0, timestamp: 0 }));
    const snapshot = sampler.sample("conn1", outboundStats({ bytesSent: 125_000, timestamp: 1000 }));
    // 125,000 bytes * 8 bits over 1000ms == 1,000,000 bps
    expect(snapshot.outboundBitrateBps).toBe(1_000_000);
  });

  it("does not confuse two different connections' byte counters", () => {
    const sampler = new DiagnosticsSampler();
    sampler.sample("conn1", outboundStats({ bytesSent: 0, timestamp: 0 }));
    const snapshotOfFreshConnection = sampler.sample("conn2", outboundStats({ bytesSent: 999_999, timestamp: 500 }));
    expect(snapshotOfFreshConnection.outboundBitrateBps).toBeNull();
  });

  it("forgets a connection's prior sample so a reused key does not report a spurious spike", () => {
    const sampler = new DiagnosticsSampler();
    sampler.sample("conn1", outboundStats({ bytesSent: 500_000, timestamp: 0 }));
    sampler.forget("conn1");
    const snapshot = sampler.sample("conn1", outboundStats({ bytesSent: 0, timestamp: 10 }));
    expect(snapshot.outboundBitrateBps).toBeNull();
  });

  it("reports packetsLost and inbound bitrate from inbound-rtp stats", () => {
    const sampler = new DiagnosticsSampler();
    const stats = (bytesReceived: number, timestamp: number) =>
      statsMap({
        inbound1: { type: "inbound-rtp", kind: "video", bytesReceived, timestamp, packetsLost: 3, framesPerSecond: 29 },
      });
    sampler.sample("conn1", stats(0, 0));
    const snapshot = sampler.sample("conn1", stats(62_500, 1000));
    expect(snapshot.inboundBitrateBps).toBe(500_000);
    expect(snapshot.packetsLost).toBe(3);
    expect(snapshot.framesPerSecond).toBe(29);
  });

  it("surfaces the relay status for the connection via the same snapshot", () => {
    const sampler = new DiagnosticsSampler();
    const stats = statsMap({
      transport1: { type: "transport", selectedCandidatePairId: "pair1" },
      pair1: { type: "candidate-pair", localCandidateId: "local1" },
      local1: { type: "local-candidate", candidateType: "relay", relayProtocol: "udp", url: "turn:example.com" },
    });
    expect(sampler.sample("conn1", stats).relay).toEqual({
      isRelay: true,
      relayProtocol: "udp",
      url: "turn:example.com",
    });
  });
});

describe("didFallBackToSoftwareEncoder", () => {
  it("flags a transition from hardware to OpenH264", () => {
    expect(didFallBackToSoftwareEncoder("ExternalEncoder", "OpenH264")).toBe(true);
  });

  it("does not flag when already on OpenH264", () => {
    expect(didFallBackToSoftwareEncoder("OpenH264", "OpenH264")).toBe(false);
  });

  it("does not flag when staying on hardware", () => {
    expect(didFallBackToSoftwareEncoder("ExternalEncoder", "ExternalEncoder")).toBe(false);
  });

  it("does not flag the very first sample, which has no prior implementation to compare", () => {
    expect(didFallBackToSoftwareEncoder(null, "OpenH264")).toBe(false);
  });

  it("does not flag a null current reading", () => {
    expect(didFallBackToSoftwareEncoder("ExternalEncoder", null)).toBe(false);
  });
});
