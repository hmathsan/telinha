export type IceConnectionState =
  | "new"
  | "checking"
  | "connected"
  | "completed"
  | "disconnected"
  | "failed"
  | "closed";

export type IceRecoveryAction = "none" | "wait" | "restart-ice" | "recreate";

export type Role = "transmissor" | "espectador";

/**
 * Quanto `disconnected` espera antes de virar ação. Blips reais do Chromium se resolvem em 1 a 3
 * segundos; o que passa disso, na prática, não se resolve mais sozinho.
 */
export const DISCONNECTED_GRACE_MS = 6_000;

/** Quantos `iceRestart` antes de desistir da `RTCPeerConnection` e refazê-la do zero. */
export const MAX_RESTART_ATTEMPTS = 2;

/** Piso entre duas ações de recuperação na mesma perna, dos dois lados da sinalização. */
export const RECOVERY_COOLDOWN_MS = 10_000;

/** Quanto tempo de `inboundBitrateBps === 0` conta como mídia parada. */
export const STALLED_MEDIA_MS = 8_000;

export interface IceRecoveryInput {
  readonly state: IceConnectionState;
  /** Há quanto tempo esta perna está insalubre. Zero quando está saudável. */
  readonly msUnhealthy: number;
  readonly restartAttempts: number;
}

/**
 * A escada de recuperação da spec 0003 ("Reconexão"). A versão anterior desta função devolvia
 * `wait` para `disconnected` e parava aí, apostando que o Chromium chegaria em `failed` sozinho —
 * e o log da Sessão de 09/09/2026 mostra que ele não chega: uma perna ficou em `disconnected` por
 * mais de quatro minutos, com o vídeo congelado, até a pessoa sair na mão. Por isso `disconnected`
 * escala igual a `failed` depois do período de graça, e por isso existe um degrau acima do
 * `iceRestart`: refazer a `RTCPeerConnection`, que é o que re-gathera candidatos `srflx` novos
 * quando o NAT remapeou a porta (o deploy é STUN-only — não há relay para onde cair).
 */
export function decideIceRecoveryAction(input: IceRecoveryInput): IceRecoveryAction {
  if (input.state !== "disconnected" && input.state !== "failed") return "none";
  if (input.state === "disconnected" && input.msUnhealthy < DISCONNECTED_GRACE_MS) return "wait";
  return escalationFor(input.restartAttempts);
}

/** O degrau da escada dado o que já se tentou — compartilhado com o watchdog de mídia. */
export function escalationFor(restartAttempts: number): "restart-ice" | "recreate" {
  return restartAttempts < MAX_RESTART_ATTEMPTS ? "restart-ice" : "recreate";
}

export interface MediaStallInput {
  readonly role: Role;
  readonly iceConnectionState: string;
  readonly inboundBitrateBps: number | null;
  readonly msSinceMediaFlowing: number;
}

/**
 * A outra metade do defeito: mídia que para com o ICE ainda em `connected`, que nenhum evento
 * anuncia. Vale só para quem recebe — o lado que envia tem `outboundBitrateBps` zerado sempre que
 * não está transmitindo, o que não é defeito nenhum.
 *
 * `null` nunca conta. Ele aparece na primeira amostra de cada perna (o bitrate é uma delta entre
 * duas leituras) e sempre que não há `inbound-rtp`; tratá-lo como zero faria toda conexão recém
 * criada entrar na escada antes de ter chance de conectar. Só o `0` literal conta.
 */
export function isMediaStalled(input: MediaStallInput): boolean {
  if (input.role !== "espectador") return false;
  if (input.iceConnectionState !== "connected" && input.iceConnectionState !== "completed") return false;
  if (input.inboundBitrateBps !== 0) return false;
  return input.msSinceMediaFlowing > STALLED_MEDIA_MS;
}
