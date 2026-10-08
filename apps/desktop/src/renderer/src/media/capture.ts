import type { SomCaptureMode, SomStatus, SomUnavailableReason } from "../../../shared/media/somCapture.js";
import { logToMain } from "../log.js";

/** `restrictOwnAudio` ainda falta no `lib.dom` desta versão do TypeScript. */
interface SomTrackConstraints extends MediaTrackConstraints {
  readonly restrictOwnAudio?: boolean;
}

interface SomTrackSettings extends MediaTrackSettings {
  readonly restrictOwnAudio?: boolean;
}

/**
 * 720p30 é teto, não piso (spec 0003, "Captura") — por isso `ideal`, nunca `exact`: a Fonte real
 * escolhida no seletor do processo principal decide a resolução, e o encoder pode entregar menos
 * sob congestionamento sem que a captura rejeite o pedido.
 */
const VIDEO: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
};

/**
 * O Chromium liga os três processamentos por padrão também para áudio de tela, e cancelamento de
 * eco sobre som de jogo o destrói. `restrictOwnAudio` é a metade do renderer da invariante do Som
 * para monitores (spec 0009); o handler do principal é a outra.
 */
const SOM: SomTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  restrictOwnAudio: true,
};

export interface FonteCapture {
  readonly stream: MediaStream;
  readonly som: SomStatus;
}

function unavailable(stream: MediaStream, reason: SomUnavailableReason): FonteCapture {
  return { stream, som: { ativo: false, reason } };
}

function dropTrack(stream: MediaStream, track: MediaStreamTrack): void {
  track.stop();
  stream.removeTrack(track);
}

/**
 * Captura a Fonte com o Som que o processo principal decidiu (spec 0009, "Captura no renderer").
 * Cada caminho em que o Som some escreve no log: nenhum deles lança.
 */
export async function captureFonte(): Promise<FonteCapture> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: VIDEO, audio: SOM });
  } catch (error) {
    // Rejeitar e cancelar chegam aqui iguais. Só o principal sabe se houve uma Fonte escolhida com
    // áudio — se não houve, é cancelamento, e quem trata é o `useSessao`.
    if (!(await window.scrnBroadcast.retryCaptureWithoutSom())) throw error;
    logToMain("warn", "som-capture-unavailable", { reason: "capture-failed", message: String(error) });
    stream = await navigator.mediaDevices.getDisplayMedia({ video: VIDEO, audio: false });
    return unavailable(stream, "capture-failed");
  }

  const track = stream.getAudioTracks()[0];
  if (!track) {
    const report = await window.scrnBroadcast.getLastSomCapture();
    const reason: SomUnavailableReason =
      report && report.decision.audio === null ? report.decision.reason : "capture-failed";
    logToMain(reason === "capture-failed" ? "warn" : "info", "som-capture-unavailable", { reason });
    return unavailable(stream, reason);
  }

  if (track.readyState === "ended") {
    dropTrack(stream, track);
    logToMain("warn", "som-capture-unavailable", { reason: "capture-failed", message: "track-already-ended" });
    return unavailable(stream, "capture-failed");
  }

  // Track sem relatório não deveria existir; se existir, cai no modo que passa pela checagem abaixo.
  const report = await window.scrnBroadcast.getLastSomCapture();
  const mode: SomCaptureMode = report && report.decision.audio !== null ? report.decision.mode : "loopback";
  const settings: SomTrackSettings = track.getSettings();

  // A invariante sendo defendida: no Windows 10 o Chromium descarta `restrictOwnAudio` em silêncio,
  // e o Som do sistema levaria o som do próprio app.
  if (mode === "loopback" && settings.restrictOwnAudio !== true) {
    dropTrack(stream, track);
    logToMain("warn", "som-capture-unavailable", { reason: "own-audio-not-excluded", settings });
    return unavailable(stream, "own-audio-not-excluded");
  }

  track.contentHint = "music";
  logToMain("info", "som-capture-started", { mode, settings });
  if (settings.echoCancellation === true || settings.noiseSuppression === true || settings.autoGainControl === true) {
    // Defeito de qualidade, não de invariante: a track segue.
    logToMain("warn", "som-processing-not-disabled", { settings });
  }
  // O Som parar não é a Fonte parar: quem libera o Palco continua olhando só o vídeo.
  track.addEventListener("ended", () => logToMain("info", "som-capture-ended", { mode }), { once: true });

  return { stream, som: { ativo: true, mode } };
}
