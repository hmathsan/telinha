import type { SessaoDurableObject } from "./durableObject.js";
import type { TurnEnv } from "./turn.js";

export interface Env extends TurnEnv {
  readonly SESSAO: DurableObjectNamespace<SessaoDurableObject>;
}
