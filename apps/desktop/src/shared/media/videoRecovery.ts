/**
 * O estado de uma track sem depender da lib DOM: `src/shared` também é compilado pelo
 * `tsconfig.json` do processo principal, que não tem `DOM` em `lib` — mesma razão de
 * `SessionDescriptionLike` existir em `meshSignal.ts`.
 */
export type TrackReadyState = "live" | "ended";

/** O estado de um `<video>` que já está montado e deveria estar pintando quadros. */
export interface VideoSurfaceHealth {
  /** Há quanto tempo o elemento recebeu o último quadro. */
  readonly msSinceLastFrame: number;
  readonly trackReadyState: TrackReadyState;
  /** `true` enquanto a origem não entrega mídia — o outro lado pausou, ou a conexão caiu. */
  readonly trackMuted: boolean;
  /** Quantas reanexações já foram tentadas desde o último quadro que chegou. */
  readonly attempts: number;
}

/** Sem quadro por mais que isto, com a track viva, é o elemento que parou — não a mídia. */
export const STALE_FRAME_MS = 1000;

/** Se três reanexações não trouxeram quadro, o problema não está no `srcObject`. */
export const MAX_REATTACH_ATTEMPTS = 3;

/**
 * Se vale reanexar o `srcObject` de um `<video>` que parou de pintar.
 *
 * O defeito que isto cobre é um elemento preto enquanto a mídia continua chegando — a
 * `RTCPeerConnection` intacta, nenhuma transição de ICE, e mesmo assim nada na tela. Track `ended`
 * ou `muted` é o caso oposto: não há mídia para pintar, e reanexar não inventaria quadro nenhum.
 * O teto de tentativas existe porque uma reanexação que não resolve na terceira não resolve na
 * trigésima, e o laço só gastaria GPU.
 */
export function shouldReattachVideo(health: VideoSurfaceHealth): boolean {
  if (health.trackReadyState !== "live") return false;
  if (health.trackMuted) return false;
  if (health.attempts >= MAX_REATTACH_ATTEMPTS) return false;
  return health.msSinceLastFrame > STALE_FRAME_MS;
}
