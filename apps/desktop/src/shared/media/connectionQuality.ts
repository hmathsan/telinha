export interface ConnectionQualityInput {
  readonly iceConnectionState: string;
  readonly qualityLimitationReason: string | null;
}

/**
 * O sinal discreto de "conexão degradada" do indicador de qualidade (spec 0004). `checking`,
 * `disconnected` e `failed` cobrem o defeito; `qualityLimitationReason === "bandwidth"` cobre o
 * congestionamento induzido pelo bitrate adaptativo (spec 0003) — a distinção que a spec pede
 * entre os dois é feita pela resolução/FPS ao lado deste sinal, não por ele sozinho.
 */
export function isConnectionDegraded(input: ConnectionQualityInput): boolean {
  if (
    input.iceConnectionState === "checking" ||
    input.iceConnectionState === "disconnected" ||
    input.iceConnectionState === "failed"
  ) {
    return true;
  }
  return input.qualityLimitationReason === "bandwidth";
}
