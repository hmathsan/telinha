import type { SessaoDurableObject } from "./durableObject.js";
import type { TurnEnv } from "./turn.js";

export interface Env extends TurnEnv {
  readonly SESSAO: DurableObjectNamespace<SessaoDurableObject>;
  /**
   * Limites de taxa por IP das rotas de entrada. Opcionais porque o miniflare não simula
   * `[[ratelimits]]` — ver `rateLimit.ts`.
   */
  readonly CREATE_LIMITER?: RateLimit;
  readonly JOIN_LIMITER?: RateLimit;
}
