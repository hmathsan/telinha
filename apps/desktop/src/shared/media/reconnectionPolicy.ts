export type IceConnectionState =
  | "new"
  | "checking"
  | "connected"
  | "completed"
  | "disconnected"
  | "failed"
  | "closed";

export type IceRecoveryAction = "none" | "wait" | "restart-ice";

/**
 * Camadas 1 e 2 da spec 0003 ("Reconexão"): `disconnected` espera, porque resolve sozinho na
 * maioria das vezes; `failed` pede `restartIce()` e renegociação pelo sinalizador. A camada 3
 * (reentrada completa com o Código de Sessão) não é decidida por estado de ICE — é o app inteiro
 * fechando — e por isso fica fora desta função.
 */
export function decideIceRecoveryAction(state: IceConnectionState): IceRecoveryAction {
  if (state === "failed") return "restart-ice";
  if (state === "disconnected") return "wait";
  return "none";
}
