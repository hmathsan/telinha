import { findFirstStat, type StatsLike, type StatsReportLike } from "./webrtcStatsLike.js";

export interface RelayStatus {
  readonly isRelay: boolean;
  readonly relayProtocol?: string;
  readonly url?: string;
}

const NOT_RELAYED: RelayStatus = { isRelay: false };

/**
 * Localiza o par de candidatos ICE vencedor: via `transport.selectedCandidatePairId`, com
 * fallback para varredura de `candidate-pair` nomeado e bem-sucedido apenas se o motor não
 * expuser `transport` (spec 0003, "Avisar quem está sendo retransmitido").
 */
export function findSelectedCandidatePair(stats: StatsReportLike): StatsLike | undefined {
  const transport = findFirstStat(stats, (s) => s.type === "transport" && s.selectedCandidatePairId !== undefined);
  if (transport?.selectedCandidatePairId) {
    const pair = stats.get(transport.selectedCandidatePairId);
    if (pair) return pair;
  }
  return findFirstStat(stats, (s) => s.type === "candidate-pair" && s.nominated === true && s.state === "succeeded");
}

/**
 * `relayProtocol`/`url` só existem em candidatos locais, então a presença deles confirma que o
 * relay é deste Participante e não do outro lado. Ler só depois de `connectionState ===
 * 'connected'`, e reler após um ICE restart.
 */
export function detectRelay(stats: StatsReportLike): RelayStatus {
  const pair = findSelectedCandidatePair(stats);
  if (!pair?.localCandidateId) {
    return NOT_RELAYED;
  }
  const local = stats.get(pair.localCandidateId);
  if (!local || local.candidateType !== "relay" || local.relayProtocol === undefined) {
    return NOT_RELAYED;
  }
  return { isRelay: true, relayProtocol: local.relayProtocol, url: local.url };
}
