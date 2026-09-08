import { describe, expect, it } from "vitest";
import { detectRelay } from "./relayDetection.js";
import type { StatsLike } from "./webrtcStatsLike.js";

function statsMap(entries: Record<string, StatsLike>): Map<string, StatsLike> {
  return new Map(Object.entries(entries));
}

describe("detectRelay", () => {
  it("detects a relayed local candidate via transport.selectedCandidatePairId", () => {
    const stats = statsMap({
      transport1: { type: "transport", selectedCandidatePairId: "pair1" },
      pair1: { type: "candidate-pair", localCandidateId: "local1" },
      local1: { type: "local-candidate", candidateType: "relay", relayProtocol: "udp", url: "turn:example.com" },
    });

    expect(detectRelay(stats)).toEqual({ isRelay: true, relayProtocol: "udp", url: "turn:example.com" });
  });

  it("reports no relay when the local candidate is a direct srflx/host type", () => {
    const stats = statsMap({
      transport1: { type: "transport", selectedCandidatePairId: "pair1" },
      pair1: { type: "candidate-pair", localCandidateId: "local1" },
      local1: { type: "local-candidate", candidateType: "srflx" },
    });

    expect(detectRelay(stats)).toEqual({ isRelay: false });
  });

  it("falls back to scanning nominated/succeeded candidate-pairs when no transport stat exists", () => {
    const stats = statsMap({
      pairOther: { type: "candidate-pair", nominated: false, state: "succeeded", localCandidateId: "localOther" },
      pairWinner: { type: "candidate-pair", nominated: true, state: "succeeded", localCandidateId: "local1" },
      local1: { type: "local-candidate", candidateType: "relay", relayProtocol: "tcp", url: "turn:example.com" },
    });

    expect(detectRelay(stats)).toEqual({ isRelay: true, relayProtocol: "tcp", url: "turn:example.com" });
  });

  it("does not mistake the remote peer's relay candidate for this participant's own", () => {
    // relayProtocol/url only ever appear on local candidates; a remote relay candidate must not
    // be read as `local1` here, so this stays a host/srflx match instead of a relay.
    const stats = statsMap({
      transport1: { type: "transport", selectedCandidatePairId: "pair1" },
      pair1: { type: "candidate-pair", localCandidateId: "local1", remoteCandidateId: "remote1" },
      local1: { type: "local-candidate", candidateType: "srflx" },
      remote1: { type: "remote-candidate", candidateType: "relay", relayProtocol: "udp" },
    });

    expect(detectRelay(stats)).toEqual({ isRelay: false });
  });

  it("returns no relay when nothing matches", () => {
    expect(detectRelay(statsMap({}))).toEqual({ isRelay: false });
  });
});
