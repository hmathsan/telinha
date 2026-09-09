import { findFirstStat, type StatsLike, type StatsReportLike } from "./webrtcStatsLike.js";
import { detectRelay, findSelectedCandidatePair, type RelayStatus } from "./relayDetection.js";

export interface CandidatePairSummary {
  readonly localCandidateType?: string;
  readonly remoteCandidateType?: string;
}

export interface ConnectionDiagnosticsSnapshot {
  readonly outboundBitrateBps: number | null;
  readonly inboundBitrateBps: number | null;
  readonly packetsLost: number | null;
  readonly framesPerSecond: number | null;
  readonly frameWidth: number | null;
  readonly frameHeight: number | null;
  readonly encoderImplementation: string | null;
  readonly qualityLimitationReason: string | null;
  /** RTT do par de candidatos vencedor, em milissegundos — a coluna RTT do diagnóstico (0008). */
  readonly roundTripTimeMs: number | null;
  readonly selectedCandidatePair: CandidatePairSummary | null;
  readonly relay: RelayStatus;
}

function candidatePairSummary(stats: StatsReportLike, pair: StatsLike | undefined): CandidatePairSummary | null {
  if (!pair) return null;
  const local = pair.localCandidateId ? stats.get(pair.localCandidateId) : undefined;
  const remote = pair.remoteCandidateId ? stats.get(pair.remoteCandidateId) : undefined;
  return {
    localCandidateType: local?.candidateType,
    remoteCandidateType: remote?.candidateType,
  };
}

interface PriorByteSample {
  readonly bytes: number;
  readonly timestampMs: number;
}

/**
 * Mantém a amostra anterior de bytes por conexão para calcular bitrate por delta — o
 * `getStats()` só dá contadores cumulativos (spec 0003, "Diagnóstico").
 */
export class DiagnosticsSampler {
  private readonly priorByKey = new Map<string, PriorByteSample>();

  sample(connectionKey: string, stats: StatsReportLike): ConnectionDiagnosticsSnapshot {
    const selectedPair = findSelectedCandidatePair(stats);
    const outbound = findFirstStat(stats, (s) => s.type === "outbound-rtp" && s.kind === "video");
    const inbound = findFirstStat(stats, (s) => s.type === "inbound-rtp" && s.kind === "video");

    const outboundBitrateBps =
      outbound?.bytesSent !== undefined
        ? this.bitrateFor(`${connectionKey}:out`, outbound.bytesSent, outbound.timestamp ?? Date.now())
        : null;
    const inboundBitrateBps =
      inbound?.bytesReceived !== undefined
        ? this.bitrateFor(`${connectionKey}:in`, inbound.bytesReceived, inbound.timestamp ?? Date.now())
        : null;

    const framesPerSecond = outbound?.framesPerSecond ?? inbound?.framesPerSecond;
    const frameWidth = outbound?.frameWidth ?? inbound?.frameWidth;
    const frameHeight = outbound?.frameHeight ?? inbound?.frameHeight;

    return {
      outboundBitrateBps,
      inboundBitrateBps,
      packetsLost: inbound?.packetsLost ?? null,
      framesPerSecond: framesPerSecond ?? null,
      frameWidth: frameWidth ?? null,
      frameHeight: frameHeight ?? null,
      encoderImplementation: outbound?.encoderImplementation ?? null,
      qualityLimitationReason: outbound?.qualityLimitationReason ?? null,
      roundTripTimeMs:
        selectedPair?.currentRoundTripTime !== undefined ? Math.round(selectedPair.currentRoundTripTime * 1000) : null,
      selectedCandidatePair: candidatePairSummary(stats, selectedPair),
      relay: detectRelay(stats),
    };
  }

  /** Descarta as amostras anteriores de uma conexão fechada, para não vazar memória nem produzir
   * um bitrate espúrio se a mesma chave for reaproveitada por uma conexão nova. */
  forget(connectionKey: string): void {
    this.priorByKey.delete(`${connectionKey}:out`);
    this.priorByKey.delete(`${connectionKey}:in`);
  }

  private bitrateFor(key: string, bytes: number, timestampMs: number): number | null {
    const prior = this.priorByKey.get(key);
    this.priorByKey.set(key, { bytes, timestampMs });
    if (!prior) return null;
    const deltaBytes = bytes - prior.bytes;
    const deltaMs = timestampMs - prior.timestampMs;
    if (deltaMs <= 0 || deltaBytes < 0) return null;
    return Math.round((deltaBytes * 8 * 1000) / deltaMs);
  }
}

/**
 * O único aviso que existe quando o teto de sessões do encoder de hardware estoura: o Chromium
 * cai para OpenH264 por software em silêncio, sem exceção e sem evento (spec 0003, ADR 0002).
 *
 * Dispara tanto numa transição vista em tempo real (hardware -> software no meio da Sessão)
 * quanto na primeiríssima amostra de uma conexão já em software: se o teto já tinha estourado
 * antes desta conexão existir — outro programa consumindo sessões, ou um driver antigo com teto
 * de 3 —, nunca existe uma amostra "antes" em hardware para comparar, e o amigo afetado é
 * exatamente quem mais precisa do aviso.
 */
export function didFallBackToSoftwareEncoder(
  previousEncoderImplementation: string | null,
  currentEncoderImplementation: string | null,
): boolean {
  if (currentEncoderImplementation === null) return false;
  const isSoftwareNow = currentEncoderImplementation.toLowerCase().includes("openh264");
  if (!isSoftwareNow) return false;
  const wasAlreadyKnownSoftware =
    previousEncoderImplementation !== null && previousEncoderImplementation.toLowerCase().includes("openh264");
  return !wasAlreadyKnownSoftware;
}
