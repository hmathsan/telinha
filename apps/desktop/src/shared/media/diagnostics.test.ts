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
      frameWidth: 1280,
      frameHeight: 720,
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
    expect(snapshot.frameWidth).toBe(1280);
    expect(snapshot.frameHeight).toBe(720);
    expect(snapshot.encoderImplementation).toBe("ExternalEncoder");
    expect(snapshot.qualityLimitationReason).toBe("none");
  });

  it("reports the winning candidate pair's RTT in milliseconds", () => {
    const sampler = new DiagnosticsSampler();
    const stats = outboundStats();
    stats.set("pair1", {
      type: "candidate-pair",
      localCandidateId: "local1",
      remoteCandidateId: "remote1",
      currentRoundTripTime: 0.042,
    });
    expect(sampler.sample("conn1", stats).roundTripTimeMs).toBe(42);
  });

  it("reports a null RTT when the engine does not expose one yet", () => {
    const sampler = new DiagnosticsSampler();
    expect(sampler.sample("conn1", outboundStats()).roundTripTimeMs).toBeNull();
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
        inbound1: {
          type: "inbound-rtp",
          kind: "video",
          bytesReceived,
          timestamp,
          packetsLost: 3,
          framesPerSecond: 29,
          frameWidth: 960,
          frameHeight: 540,
        },
      });
    sampler.sample("conn1", stats(0, 0));
    const snapshot = sampler.sample("conn1", stats(62_500, 1000));
    expect(snapshot.inboundBitrateBps).toBe(500_000);
    expect(snapshot.packetsLost).toBe(3);
    expect(snapshot.framesPerSecond).toBe(29);
    expect(snapshot.frameWidth).toBe(960);
    expect(snapshot.frameHeight).toBe(540);
  });

  it("reports every Som field as null when there is no audio track", () => {
    const sampler = new DiagnosticsSampler();
    sampler.sample("conn1", outboundStats({ bytesSent: 0, timestamp: 0 }));
    const snapshot = sampler.sample("conn1", outboundStats({ bytesSent: 125_000, timestamp: 1000 }));
    expect(snapshot.somOutboundBitrateBps).toBeNull();
    expect(snapshot.somInboundBitrateBps).toBeNull();
    expect(snapshot.somPacketsLost).toBeNull();
    expect(snapshot.somAudioLevel).toBeNull();
  });

  it("on the Transmissor, reads Som bitrate from audio outbound-rtp and level from the audio media-source", () => {
    const sampler = new DiagnosticsSampler();
    const stats = (videoBytes: number, audioBytes: number, timestamp: number) =>
      statsMap({
        video: { type: "outbound-rtp", kind: "video", bytesSent: videoBytes, timestamp },
        audio: { type: "outbound-rtp", kind: "audio", bytesSent: audioBytes, timestamp },
        videoSource: { type: "media-source", kind: "video" },
        audioSource: { type: "media-source", kind: "audio", audioLevel: 0.25 },
      });
    sampler.sample("conn1", stats(0, 0, 0));
    const snapshot = sampler.sample("conn1", stats(125_000, 16_000, 1000));
    // O vídeo e o Som não podem se misturar: chaves separadas no bitrateFor.
    expect(snapshot.outboundBitrateBps).toBe(1_000_000);
    expect(snapshot.somOutboundBitrateBps).toBe(128_000);
    expect(snapshot.somAudioLevel).toBe(0.25);
    expect(snapshot.somInboundBitrateBps).toBeNull();
    expect(snapshot.somPacketsLost).toBeNull();
  });

  it("on the Espectador, reads Som bitrate, loss and level from audio inbound-rtp", () => {
    const sampler = new DiagnosticsSampler();
    const stats = (videoBytes: number, audioBytes: number, timestamp: number) =>
      statsMap({
        video: { type: "inbound-rtp", kind: "video", bytesReceived: videoBytes, timestamp, packetsLost: 3 },
        audio: { type: "inbound-rtp", kind: "audio", bytesReceived: audioBytes, timestamp, packetsLost: 7, audioLevel: 0.5 },
      });
    sampler.sample("conn1", stats(0, 0, 0));
    const snapshot = sampler.sample("conn1", stats(62_500, 8_000, 1000));
    expect(snapshot.inboundBitrateBps).toBe(500_000);
    expect(snapshot.packetsLost).toBe(3);
    expect(snapshot.somInboundBitrateBps).toBe(64_000);
    expect(snapshot.somPacketsLost).toBe(7);
    expect(snapshot.somAudioLevel).toBe(0.5);
    expect(snapshot.somOutboundBitrateBps).toBeNull();
  });

  it("reports a Som level of zero as zero, not as missing", () => {
    const sampler = new DiagnosticsSampler();
    const snapshot = sampler.sample(
      "conn1",
      statsMap({ audioSource: { type: "media-source", kind: "audio", audioLevel: 0 } }),
    );
    expect(snapshot.somAudioLevel).toBe(0);
  });

  it("forgets the Som byte samples along with the video ones", () => {
    const sampler = new DiagnosticsSampler();
    const stats = (audioBytes: number, timestamp: number) =>
      statsMap({
        out: { type: "outbound-rtp", kind: "audio", bytesSent: audioBytes, timestamp },
        in: { type: "inbound-rtp", kind: "audio", bytesReceived: audioBytes, timestamp },
      });
    sampler.sample("conn1", stats(500_000, 0));
    sampler.forget("conn1");
    const snapshot = sampler.sample("conn1", stats(0, 10));
    expect(snapshot.somOutboundBitrateBps).toBeNull();
    expect(snapshot.somInboundBitrateBps).toBeNull();
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

  it("flags a connection that is already on OpenH264 on its very first sample", () => {
    // O teto pode já ter estourado antes desta conexão existir (outro programa consumindo
    // sessões, ou um driver antigo) — nunca existe uma amostra "antes" em hardware nesse caso,
    // e é exatamente quem está nessa situação que mais precisa do aviso.
    expect(didFallBackToSoftwareEncoder(null, "OpenH264")).toBe(true);
  });

  it("does not flag a null current reading", () => {
    expect(didFallBackToSoftwareEncoder("ExternalEncoder", null)).toBe(false);
  });
});
