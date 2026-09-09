import { useState, type ReactNode } from "react";
import type { EntryRefusedReason, SessaoEndedReason } from "@scrn-broadcast/protocol";
import { formatCodigoDeSessao, isCodigoDeSessaoCompleto, normalizeCodigoDeSessao } from "../../shared/codigoDeSessao.js";
import type { ConnectAction } from "../../shared/ipc.js";
import { IconBroadcast, IconWarningCircle } from "./components/icons/index.js";

const ENTRY_ERROR_MESSAGES: Record<EntryRefusedReason, string> = {
  "incompatible-version": "Atualize o aplicativo para entrar nesta Sessão.",
  "invalid-code": "Código de Sessão inválido.",
  "sessao-full": "Esta Sessão já está cheia.",
  "refused-by-anfitriao": "O Anfitrião recusou sua entrada.",
};

const SESSAO_ENDED_MESSAGES: Record<SessaoEndedReason, string> = {
  "anfitriao-left": "O Anfitrião saiu e a Sessão terminou.",
};

const DISCONNECT_REASON_MESSAGES: Record<string, string> = {
  "removido-da-sessao": "Você foi removido da Sessão pelo Anfitrião.",
  "sessao-encerrada": "A Sessão terminou.",
  "anfitriao-connection-lost": "A conexão com a Sessão foi perdida.",
};

const NAME_STORAGE_KEY = "scrn-broadcast:name";

const NOTICE_CLASS = { warn: "card-warn", danger: "card-danger", accent: "card-accent" } as const;

/** Os quatro motivos de recusa e os de desconexão, numa faixa de aviso do Nocturne (spec 0008). */
function Notice({
  tone,
  children,
}: {
  readonly tone: keyof typeof NOTICE_CLASS;
  readonly children: ReactNode;
}) {
  return (
    <p className={`card ${NOTICE_CLASS[tone]} flex items-center gap-3 text-sm`} role="status">
      {tone === "accent" ? <span className="dot dot-live" /> : <IconWarningCircle />}
      <span>{children}</span>
    </p>
  );
}

export interface EntryScreenProps {
  readonly entryError: EntryRefusedReason | null;
  readonly sessaoEndedReason: SessaoEndedReason | null;
  readonly lastDisconnectReason: string | null;
  /** Pedido enviado, esperando o Anfitrião. Trava os dois botões enquanto durar. */
  readonly awaitingApproval: boolean;
  readonly onConnect: (action: ConnectAction) => void;
  readonly onCancel: () => void;
}

export function EntryScreen({
  entryError,
  sessaoEndedReason,
  lastDisconnectReason,
  awaitingApproval,
  onConnect,
  onCancel,
}: EntryScreenProps) {
  const [name, setName] = useState(() => localStorage.getItem(NAME_STORAGE_KEY) ?? "");
  const [codigoDeSessao, setCodigoDeSessao] = useState("");

  function persistName(value: string): void {
    setName(value);
    localStorage.setItem(NAME_STORAGE_KEY, value);
  }

  const nameFilled = name.trim().length > 0;
  const codigoCompleto = isCodigoDeSessaoCompleto(codigoDeSessao);

  return (
    <div className="flex min-h-screen justify-center px-6 py-20">
      <div className="entry-column flex flex-col gap-6">
        {/* Na Entrada a marca é o título: ela é a primeira coisa que a pessoa lê. */}
        <div className="flex flex-col gap-2">
          <h1 className="brand brand-lg">
            <IconBroadcast /> Telinha
          </h1>
          <p className="entry-tagline">Sua tela, com seus amigos</p>
          <p className="field-hint">
            Crie uma Sessão e passe o Código, ou entre com o Código que te passaram. Não há contas nem senhas.
          </p>
        </div>

        {/*
         * Sem este aviso, a tela ficava idêntica depois do clique em "Entrar" — e as pessoas
         * clicavam de novo, sem saber que o Anfitrião precisa aceitar. Cada clique abria uma
         * conexão nova, com um `participanteId` novo, e o Anfitrião via a mesma pessoa várias
         * vezes na fila.
         */}
        {awaitingApproval && (
          <Notice tone="accent">Pedido enviado. O Anfitrião precisa aceitar sua entrada — aguarde.</Notice>
        )}
        {sessaoEndedReason && <Notice tone="warn">{SESSAO_ENDED_MESSAGES[sessaoEndedReason]}</Notice>}
        {entryError && <Notice tone="danger">{ENTRY_ERROR_MESSAGES[entryError]}</Notice>}
        {lastDisconnectReason && (
          <Notice tone="warn">{DISCONNECT_REASON_MESSAGES[lastDisconnectReason] ?? "Você saiu da Sessão."}</Notice>
        )}

        <label className="field">
          <span className="field-label">Seu nome</span>
          <input
            className="input"
            value={name}
            onChange={(e) => persistName(e.target.value)}
            disabled={awaitingApproval}
            autoFocus
          />
        </label>

        {/*
         * Seis caracteres em maiúsculas, exibidos com respiro. O rótulo é "Código de Sessão" e
         * nunca "ID de sala" (CONTEXT.md): é a única coisa que ensina o vocabulário a quem usa.
         */}
        <label className="field">
          <span className="field-label">Código de Sessão</span>
          <input
            className="input input-code"
            value={formatCodigoDeSessao(codigoDeSessao)}
            onChange={(e) => setCodigoDeSessao(normalizeCodigoDeSessao(e.target.value))}
            disabled={awaitingApproval}
            placeholder="ABC DEF"
            spellCheck={false}
            autoComplete="off"
          />
          <span className="field-hint">Deixe em branco para criar uma Sessão nova.</span>
        </label>

        {/*
         * Esperando aprovação, os dois botões dão lugar a "Cancelar pedido". Travar sem oferecer
         * saída seria armadilha: um Anfitrião que simplesmente não responde deixaria a pessoa
         * presa na tela, e cancelar retira o pedido da fila dele (`entry-request-withdrawn`).
         */}
        {awaitingApproval ? (
          <button className="btn btn-secondary btn-block" onClick={onCancel}>
            Cancelar pedido
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              className="btn btn-primary btn-block"
              disabled={!nameFilled}
              onClick={() => onConnect({ kind: "create", name: name.trim() })}
            >
              Criar Sessão
            </button>
            <button
              className="btn btn-secondary btn-block"
              disabled={!nameFilled || !codigoCompleto}
              onClick={() =>
                onConnect({ kind: "join", name: name.trim(), codigoDeSessao: normalizeCodigoDeSessao(codigoDeSessao) })
              }
            >
              Entrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
