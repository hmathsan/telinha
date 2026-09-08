export interface CodecCapabilityLike {
  readonly mimeType: string;
}

/**
 * Prioriza H.264 na negociação de codec do transceiver de envio. Sem isso, o Chromium tende a
 * oferecer VP8 primeiro — e o encoder VP8 do WebRTC do Chromium não tem caminho de hardware
 * nenhum, em GPU nenhuma: `encoderImplementation` seria sempre `libvpx` (software), e a conta de
 * sessões NVENC da ADR 0002 nunca chegaria a ser exercitada, driver bom ou ruim.
 */
export function preferH264<T extends CodecCapabilityLike>(codecs: readonly T[]): T[] {
  const h264 = codecs.filter((c) => c.mimeType.toLowerCase() === "video/h264");
  const others = codecs.filter((c) => c.mimeType.toLowerCase() !== "video/h264");
  return [...h264, ...others];
}
