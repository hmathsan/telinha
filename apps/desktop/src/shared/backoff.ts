export interface BackoffOptions {
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly factor?: number;
  readonly jitterRatio?: number;
}

const DEFAULT_OPTIONS: Required<BackoffOptions> = {
  initialDelayMs: 500,
  maxDelayMs: 30_000,
  factor: 2,
  jitterRatio: 0.2,
};

/**
 * Reconexão do WebSocket de sinalização (spec 0003, "Reconexão", camada 2): `attempt` conta a
 * partir de 0. `random` é injetável para determinismo em teste; produção usa `Math.random`.
 */
export function nextBackoffDelayMs(
  attempt: number,
  options: BackoffOptions = {},
  random: () => number = Math.random,
): number {
  const { initialDelayMs, maxDelayMs, factor, jitterRatio } = { ...DEFAULT_OPTIONS, ...options };
  const base = Math.min(initialDelayMs * factor ** attempt, maxDelayMs);
  const jitter = base * jitterRatio * (random() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
}
