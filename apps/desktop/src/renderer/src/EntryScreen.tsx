import { useState } from "react";
import type { EntryRefusedReason, SessaoEndedReason } from "@pvt-broadcast/protocol";
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

const NAME_STORAGE_KEY = "pvt-broadcast:name";

/** Os quatro motivos de recusa e os de desconexão, numa faixa de aviso do Nocturne (spec 0008). */
function Notice({ tone, children }: { readonly tone: "warn" | "danger"; readonly children: string }) {
  return (
    <p className={`card ${tone === "danger" ? "card-danger" : "card-warn"} flex items-center gap-3 text-sm`} role="status">
      <IconWarningCircle />
      <span>{children}</span>
    </p>
  );
}

export interface EntryScreenProps {
  readonly entryError: EntryRefusedReason | null;
  readonly sessaoEndedReason: SessaoEndedReason | null;
  readonly lastDisconnectReason: string | null;
  readonly onConnect: (action: ConnectAction) => void;
}

export function EntryScreen({ entryError, sessaoEndedReason, lastDisconnectReason, onConnect }: EntryScreenProps) {
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

        {sessaoEndedReason && <Notice tone="warn">{SESSAO_ENDED_MESSAGES[sessaoEndedReason]}</Notice>}
        {entryError && <Notice tone="danger">{ENTRY_ERROR_MESSAGES[entryError]}</Notice>}
        {lastDisconnectReason && (
          <Notice tone="warn">{DISCONNECT_REASON_MESSAGES[lastDisconnectReason] ?? "Você saiu da Sessão."}</Notice>
        )}

        <label className="field">
          <span className="field-label">Seu nome</span>
          <input className="input" value={name} onChange={(e) => persistName(e.target.value)} autoFocus />
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
            placeholder="ABC DEF"
            spellCheck={false}
            autoComplete="off"
          />
          <span className="field-hint">Deixe em branco para criar uma Sessão nova.</span>
        </label>

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
            onClick={() => onConnect({ kind: "join", name: name.trim(), codigoDeSessao: normalizeCodigoDeSessao(codigoDeSessao) })}
          >
            Entrar
          </button>
        </div>
      </div>
    </div>
  );
}
