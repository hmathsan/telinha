/**
 * Qual áudio pedir ao Chromium para acompanhar a Fonte (spec 0009, "Decisão de captura, fora do
 * Electron"). A regra mora aqui, e não no handler do processo principal, pela mesma disciplina da
 * ADR 0003: "Windows 10 com a janela do próprio app" custa uma linha de teste aqui e uma tarde de
 * depuração lá dentro.
 *
 * A invariante que decide os casos duvidosos: o Som nunca inclui o som do próprio app. Quando não
 * há como garantir isso, a Fonte vai sem Som.
 */

/** O Chromium só exclui o próprio processo da captura a partir do Windows 11 (ADR 0011). */
export const MIN_WINDOWS_BUILD_FOR_SOM = 22000;

export type SomUnavailableReason =
  | "som-off" // o Transmissor desligou o Som no seletor (0010)
  | "windows-10" // build < MIN_WINDOWS_BUILD_FOR_SOM
  | "own-app" // a janela é do próprio app
  | "pid-not-found" // o HWND não resolveu para um processo
  | "capture-failed" // o Chromium recusou ou entregou a track já encerrada
  | "own-audio-not-excluded"; // monitor sem restrictOwnAudio efetivo

export type SomCaptureMode = "applicationLoopback" | "loopback" | "loopbackWithoutChrome";

export type SomCaptureDecision =
  | { readonly audio: string; readonly mode: SomCaptureMode }
  | { readonly audio: null; readonly reason: SomUnavailableReason };

/** O que o renderer sabe do Som da Fonte depois da captura. Quem consome é a 0010. */
export type SomStatus =
  | { readonly ativo: true; readonly mode: SomCaptureMode }
  | { readonly ativo: false; readonly reason: SomUnavailableReason };

export interface SomCaptureInput {
  readonly fonteKind: "screen" | "window";
  readonly somRequested: boolean;
  readonly windowsBuild: number;
  readonly pid: number | null;
  readonly ownPid: number;
  /** `SCRN_BROADCAST_FORCE_SOM=1` — a válvula do roteiro para o Windows 10 (`shared/hardening.ts`). */
  readonly forced: boolean;
}

export function decideSomCapture(input: SomCaptureInput): SomCaptureDecision {
  if (!input.somRequested) return { audio: null, reason: "som-off" };
  const isWindows11 = input.windowsBuild >= MIN_WINDOWS_BUILD_FOR_SOM;
  if (!isWindows11 && !input.forced) return { audio: null, reason: "windows-10" };

  if (input.fonteKind === "window") {
    if (input.pid === null || input.pid === 0) return { audio: null, reason: "pid-not-found" };
    // Nem a válvula libera: a captura do próprio processo é a invariante, não uma limitação do SO.
    if (input.pid === input.ownPid) return { audio: null, reason: "own-app" };
    return { audio: `applicationLoopback:${input.pid}`, mode: "applicationLoopback" };
  }

  if (isWindows11) return { audio: "loopback", mode: "loopback" };
  return { audio: "loopbackWithoutChrome", mode: "loopbackWithoutChrome" };
}

/** "10.0.22631" → 22631; qualquer coisa ilegível → 0. */
export function windowsBuildFrom(osRelease: string): number {
  const match = /^\d+\.\d+\.(\d+)/.exec(osRelease);
  if (!match?.[1]) return 0;
  const build = Number(match[1]);
  return Number.isSafeInteger(build) ? build : 0;
}

/** "window:132456:0" → 132456; "screen:0:0" ou malformado → null. */
export function hwndFromSourceId(sourceId: string): number | null {
  const match = /^window:(\d+):\d+$/.exec(sourceId);
  if (!match?.[1]) return null;
  const hwnd = Number(match[1]);
  return Number.isSafeInteger(hwnd) && hwnd > 0 ? hwnd : null;
}
