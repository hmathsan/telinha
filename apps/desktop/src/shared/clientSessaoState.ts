import type {
  EntryRefusedReason,
  IceServer,
  PalcoDeniedReason,
  Participante,
  SessaoEndedReason,
  SignalerToAppMessage,
} from "@pvt-broadcast/protocol";
import type { ConnectAction } from "./ipc.js";

/**
 * Cópia, do lado do app, do estado autoritativo que o Durable Object mantém (spec 0002: "os apps
 * mantêm uma cópia para renderizar a UI"). Reage às mensagens que o sinalizador manda ao app —
 * não reusa `processMessage` de `packages/protocol` porque aquela função modela o que o Durable
 * Object faz ao RECEBER uma mensagem de um Participante; este reducer modela o que um Participante
 * vê nas mensagens que o Durable Object EMITE, incluindo as que outros Participantes provocaram.
 */
export interface EntryRequestEntry {
  readonly participanteId: string;
  readonly name: string;
}

export interface ClientSessaoState {
  readonly screen: "entry" | "sessao";
  readonly pendingMyName: string | null;
  readonly myId: string | null;
  readonly isAnfitriao: boolean;
  readonly codigoDeSessao: string | null;
  readonly roster: readonly Participante[];
  readonly transmissores: readonly string[];
  readonly pendingEntryRequests: readonly EntryRequestEntry[];
  readonly iceServers: readonly IceServer[];
  readonly entryError: EntryRefusedReason | null;
  readonly palcoDeniedReason: PalcoDeniedReason | null;
  readonly sessaoEndedReason: SessaoEndedReason | null;
  /**
   * O Durable Object fecha o WebSocket sem mandar mensagem alguma quando expulsa alguém ou
   * fecha uma Sessão já encerrada (ver `durableObject.ts`: `safeClose`). `sessaoEndedReason`
   * cobre só a saída do Anfitrião, que É anunciada por mensagem — isto cobre o resto.
   */
  readonly lastDisconnectReason: string | null;
}

export const initialClientSessaoState: ClientSessaoState = {
  screen: "entry",
  pendingMyName: null,
  myId: null,
  isAnfitriao: false,
  codigoDeSessao: null,
  roster: [],
  transmissores: [],
  pendingEntryRequests: [],
  iceServers: [],
  entryError: null,
  palcoDeniedReason: null,
  sessaoEndedReason: null,
  lastDisconnectReason: null,
};

export type ClientSessaoAction =
  | { readonly source: "signaler"; readonly message: SignalerToAppMessage }
  | { readonly source: "connect-attempt"; readonly connectAction: ConnectAction }
  | { readonly source: "respond-entry"; readonly participanteId: string }
  | { readonly source: "connection-terminated"; readonly reason: string }
  | { readonly source: "reset" };

export function sessaoReducer(state: ClientSessaoState, action: ClientSessaoAction): ClientSessaoState {
  if (action.source === "reset") {
    return initialClientSessaoState;
  }

  if (action.source === "connect-attempt") {
    return { ...initialClientSessaoState, pendingMyName: action.connectAction.name };
  }

  if (action.source === "respond-entry") {
    return {
      ...state,
      pendingEntryRequests: state.pendingEntryRequests.filter((r) => r.participanteId !== action.participanteId),
    };
  }

  if (action.source === "connection-terminated") {
    // Já na tela de entrada == uma mensagem (entry-refused, sessao-ended) chegou primeiro e já
    // contou a razão mais específica; o fechamento do WebSocket que vem logo depois não deve
    // sobrescrevê-la com um motivo genérico.
    if (state.screen === "entry") return state;
    return { ...initialClientSessaoState, lastDisconnectReason: action.reason };
  }

  const message = action.message;
  switch (message.type) {
    case "sessao-created":
      return {
        ...state,
        screen: "sessao",
        myId: message.participanteId,
        isAnfitriao: true,
        codigoDeSessao: message.codigoDeSessao,
        roster: state.pendingMyName ? [{ id: message.participanteId, name: state.pendingMyName }] : [],
        entryError: null,
      };

    case "entry-request":
      return {
        ...state,
        pendingEntryRequests: [
          ...state.pendingEntryRequests.filter((r) => r.participanteId !== message.participanteId),
          { participanteId: message.participanteId, name: message.name },
        ],
      };

    case "entry-approved":
      return {
        ...state,
        screen: "sessao",
        myId: message.participanteId,
        isAnfitriao: false,
        roster: message.roster,
        transmissores: message.transmissores,
        entryError: null,
      };

    case "entry-refused":
      return { ...state, entryError: message.reason };

    case "participante-joined":
      return {
        ...state,
        roster: state.roster.some((p) => p.id === message.participante.id)
          ? state.roster
          : [...state.roster, message.participante],
        pendingEntryRequests: state.pendingEntryRequests.filter((r) => r.participanteId !== message.participante.id),
      };

    case "participante-left":
      return {
        ...state,
        roster: state.roster.filter((p) => p.id !== message.participanteId),
        transmissores: state.transmissores.filter((id) => id !== message.participanteId),
        pendingEntryRequests: state.pendingEntryRequests.filter((r) => r.participanteId !== message.participanteId),
      };

    case "transmissores-changed":
      return { ...state, transmissores: message.participanteIds };

    case "palco-denied":
      return { ...state, palcoDeniedReason: message.reason };

    case "sessao-ended":
      return { ...initialClientSessaoState, sessaoEndedReason: message.reason };

    case "ice-servers":
      return { ...state, iceServers: message.iceServers };

    case "signal":
      return state; // roteado para a malha de mídia, não muda este estado.
  }
}
