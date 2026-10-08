/** 720p30 é teto, não piso (spec 0003); ~2,5 Mbps é o número usado na conta de upload da ADR 0002. */
export const MAX_BITRATE_BPS = 2_500_000;

/**
 * Teto do Opus estéreo do Som (spec 0009, "Malha"). Seis conexões de saída somam os +0,77 Mbps que
 * a ADR 0002 contabiliza. Vale também como `maxaveragebitrate` no SDP (`opusStereo.ts`).
 */
export const MAX_SOM_BITRATE_BPS = 128_000;

export interface EncodingParameters {
  readonly maxBitrate: number;
}

/**
 * Formato aceito por `RTCRtpSender.setParameters({ encodings })`. Deixa o controle de
 * congestionamento do Chromium livre para reduzir a qualidade sob rede ruim — o teto aqui só
 * evita que ele suba acima do que a malha foi dimensionada para aguentar.
 */
export function buildEncodingParameters(maxBitrateBps: number = MAX_BITRATE_BPS): EncodingParameters[] {
  return [{ maxBitrate: maxBitrateBps }];
}
