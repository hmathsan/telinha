/** Mensagens de texto trocadas no heartbeat do WebSocket de sinalização (spec 0015, parte 4). */
export const HEARTBEAT_PING = "ping";
export const HEARTBEAT_PONG = "pong";

/** Intervalo entre pings enquanto o socket está aberto. */
export const HEARTBEAT_INTERVAL_MS = 25_000;

/**
 * Tempo máximo de espera por `"pong"` (ou qualquer outra mensagem) após enviar `"ping"`.
 * No pior caso, um socket morto em silêncio é detectado em ~35 s (`25 s + 10 s`), bem dentro
 * dos 60 s de `RETOMADA_TIMEOUT_MS`.
 */
export const HEARTBEAT_TIMEOUT_MS = 10_000;

export function isHeartbeatPong(text: string): boolean {
  return text === HEARTBEAT_PONG;
}

export interface HeartbeatTimers {
  readonly setTimeout: (fn: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
}

export interface HeartbeatOptions {
  readonly sendPing: () => void;
  readonly onTimeout: () => void;
  readonly intervalMs?: number;
  readonly timeoutMs?: number;
  readonly timers?: HeartbeatTimers;
}

export interface HeartbeatController {
  /** Inicia o ciclo de pings. Reinicia de forma limpa se já estiver ativo. */
  start(): void;
  /** Qualquer mensagem recebida (inclusive `"pong"`) comprova que o socket está vivo. */
  onActivity(): void;
  /** Cancela todos os timers pendentes. Idempotente. */
  stop(): void;
  /** `true` enquanto o ciclo está rodando. */
  isActive(): boolean;
  /** `true` enquanto há um `"ping"` enviado aguardando resposta dentro do prazo. */
  isAwaitingResponse(): boolean;
}

const DEFAULT_TIMERS: HeartbeatTimers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Controlador puro do heartbeat do cliente de sinalização (spec 0015, parte 4):
 * - A cada `intervalMs`, dispara `sendPing()` e arma um timeout de `timeoutMs`.
 * - Qualquer mensagem recebida (`onActivity()`) cancela o timeout pendente.
 * - Se o timeout expirar sem atividade, para o ciclo e chama `onTimeout()` uma única vez.
 */
export function createHeartbeat(options: HeartbeatOptions): HeartbeatController {
  const intervalMs = options.intervalMs ?? HEARTBEAT_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? HEARTBEAT_TIMEOUT_MS;
  const timers = options.timers ?? DEFAULT_TIMERS;

  let active = false;
  let intervalTimer: unknown = null;
  let timeoutTimer: unknown = null;

  const clearIntervalTimer = (): void => {
    if (intervalTimer !== null) {
      timers.clearTimeout(intervalTimer);
      intervalTimer = null;
    }
  };

  const clearTimeoutTimer = (): void => {
    if (timeoutTimer !== null) {
      timers.clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
  };

  const stop = (): void => {
    active = false;
    clearIntervalTimer();
    clearTimeoutTimer();
  };

  const armTimeout = (): void => {
    if (timeoutTimer !== null) return;
    timeoutTimer = timers.setTimeout(() => {
      timeoutTimer = null;
      if (!active) return;
      stop();
      options.onTimeout();
    }, timeoutMs);
  };

  const scheduleNextPing = (): void => {
    clearIntervalTimer();
    if (!active) return;
    intervalTimer = timers.setTimeout(() => {
      intervalTimer = null;
      if (!active) return;
      // Arma o timeout antes de `sendPing()` para que uma resposta ou `stop()` síncrono em testes
      // consiga limpar o timer sem corrida.
      armTimeout();
      options.sendPing();
      if (active) {
        scheduleNextPing();
      }
    }, intervalMs);
  };

  return {
    start(): void {
      stop();
      active = true;
      scheduleNextPing();
    },
    onActivity(): void {
      clearTimeoutTimer();
    },
    stop,
    isActive(): boolean {
      return active;
    },
    isAwaitingResponse(): boolean {
      return timeoutTimer !== null;
    },
  };
}
