/**
 * 720p30 é teto, não piso (spec 0003, "Captura") — por isso `ideal`, nunca `exact`: a Fonte real
 * escolhida no seletor do processo principal decide a resolução, e o encoder pode entregar menos
 * sob congestionamento sem que a captura rejeite o pedido.
 */
export async function captureFonte(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
    audio: false,
  });
}
