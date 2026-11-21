import { logToMain } from "../log.js";

/**
 * Apito curto sintetizado via Web Audio API quando chega um Pedido de entrada (spec 0013).
 * Sem arquivo de áudio e sem licença: dois tons senoidais (880 Hz -> 1320 Hz), 120 ms cada,
 * 60 ms entre eles, ataque/saída de 10 ms para evitar estalo, ganho de pico 0,2.
 */

const TONE_FREQUENCIES_HZ = [880, 1320] as const;
const TONE_DURATION_S = 0.12;
const TONE_GAP_S = 0.06;
const ENVELOPE_RAMP_S = 0.01;
const PEAK_GAIN = 0.2;

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContext();
  }
  return sharedAudioContext;
}

function scheduleApito(ctx: AudioContext): void {
  const start = ctx.currentTime;
  for (let i = 0; i < TONE_FREQUENCIES_HZ.length; i += 1) {
    const freq = TONE_FREQUENCIES_HZ[i]!;
    const toneStart = start + i * (TONE_DURATION_S + TONE_GAP_S);
    const toneEnd = toneStart + TONE_DURATION_S;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, toneStart);

    gain.gain.setValueAtTime(0, toneStart);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, toneStart + ENVELOPE_RAMP_S);
    gain.gain.setValueAtTime(PEAK_GAIN, toneEnd - ENVELOPE_RAMP_S);
    gain.gain.linearRampToValueAtTime(0, toneEnd);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(toneStart);
    osc.stop(toneEnd);
  }
}

export function tocarApito(): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      void ctx
        .resume()
        .then(() => {
          scheduleApito(ctx);
        })
        .catch((error: unknown) => {
          logToMain("warn", "pedido-apito-failed", {
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }
    scheduleApito(ctx);
  } catch (error: unknown) {
    logToMain("warn", "pedido-apito-failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
