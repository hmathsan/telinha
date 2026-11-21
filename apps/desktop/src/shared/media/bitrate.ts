/** 720p30 é teto, não piso (spec 0003); ~2,5 Mbps é o número usado na conta de upload da ADR 0002. */
export const MAX_BITRATE_BPS = 2_500_000;

/** Teto de quadros por segundo do vídeo enviado pela malha (spec 0015, Parte 2.1). */
export const MAX_FRAMERATE = 30;

/**
 * Teto do Opus estéreo do Som (spec 0009, "Malha"). Seis conexões de saída somam os +0,77 Mbps que
 * a ADR 0002 contabiliza. Vale também como `maxaveragebitrate` no SDP (`opusStereo.ts`).
 */
export const MAX_SOM_BITRATE_BPS = 128_000;

export interface EncodingParameters {
  readonly maxBitrate: number;
  readonly maxFramerate?: number;
  readonly active?: boolean;
}

export interface EncodingOptions {
  readonly maxFramerate?: number;
  readonly active?: boolean;
}

/**
 * Formato aceito por `RTCRtpSender.setParameters({ encodings })`. Deixa o controle de
 * congestionamento do Chromium livre para reduzir a qualidade sob rede ruim — o teto aqui só
 * evita que ele suba acima do que a malha foi dimensionada para aguentar.
 */
export function buildEncodingParameters(
  maxBitrateBps: number = MAX_BITRATE_BPS,
  options?: EncodingOptions,
): EncodingParameters[] {
  const encoding: { maxBitrate: number; maxFramerate?: number; active?: boolean } = {
    maxBitrate: maxBitrateBps,
  };
  if (options?.maxFramerate !== undefined) encoding.maxFramerate = options.maxFramerate;
  if (options?.active !== undefined) encoding.active = options.active;
  return [encoding];
}
