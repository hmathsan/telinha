/**
 * Forma mínima de um relatório de `RTCPeerConnection.getStats()` de que este módulo precisa.
 * `RTCStatsReport` real é um `ReadonlyMap<string, any>`, então é estruturalmente compatível sem
 * conversão — isolar o formato aqui é o que permite testar a lógica com `Map`s simples, sem
 * jsdom nem uma `RTCPeerConnection` de verdade.
 */
export interface StatsLike {
  readonly type: string;
  readonly id?: string;
  readonly selectedCandidatePairId?: string;
  readonly nominated?: boolean;
  readonly state?: string;
  readonly localCandidateId?: string;
  readonly remoteCandidateId?: string;
  readonly candidateType?: string;
  readonly relayProtocol?: string;
  readonly url?: string;
  readonly kind?: string;
  readonly bytesSent?: number;
  readonly bytesReceived?: number;
  readonly packetsLost?: number;
  readonly framesPerSecond?: number;
  readonly frameWidth?: number;
  readonly frameHeight?: number;
  readonly encoderImplementation?: string;
  readonly qualityLimitationReason?: string;
  readonly currentRoundTripTime?: number;
  readonly timestamp?: number;
  readonly [key: string]: unknown;
}

export type StatsReportLike = ReadonlyMap<string, StatsLike>;

export function findFirstStat(
  stats: StatsReportLike,
  predicate: (stat: StatsLike) => boolean,
): StatsLike | undefined {
  for (const stat of stats.values()) {
    if (predicate(stat)) return stat;
  }
  return undefined;
}
