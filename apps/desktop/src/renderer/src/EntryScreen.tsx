import { useState } from "react";
import type { EntryRefusedReason, SessaoEndedReason } from "@pvt-broadcast/protocol";
import type { ConnectAction } from "../../shared/ipc.js";
import { IconWarningCircle } from "./components/icons/index.js";

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

function Notice({ tone, children }: { readonly tone: "warn" | "danger"; readonly children: string }) {
  return (
    <p className={`card ${tone === "danger" ? "card-danger" : "card-warn"} flex items-center gap-3 text-sm`}>
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

  return (
    <div className="flex min-h-screen justify-center px-6 py-20">
      <div className="entry-column flex flex-col gap-6">
        <h1>pvt-broadcast</h1>

        {sessaoEndedReason && <Notice tone="warn">{SESSAO_ENDED_MESSAGES[sessaoEndedReason]}</Notice>}
        {entryError && <Notice tone="danger">{ENTRY_ERROR_MESSAGES[entryError]}</Notice>}
        {lastDisconnectReason && (
          <Notice tone="warn">{DISCONNECT_REASON_MESSAGES[lastDisconnectReason] ?? "Você saiu da Sessão."}</Notice>
        )}

        <label className="field">
          <span className="field-label">Seu nome</span>
          <input className="input" value={name} onChange={(e) => persistName(e.target.value)} />
        </label>

        <button className="btn btn-primary btn-block" disabled={!name.trim()} onClick={() => onConnect({ kind: "create", name: name.trim() })}>
          Criar Sessão
        </button>

        <hr className="border-0 border-t border-t-border" />

        <label className="field">
          <span className="field-label">Código de Sessão</span>
          <input
            className="input input-code"
            value={codigoDeSessao}
            onChange={(e) => setCodigoDeSessao(e.target.value.toUpperCase())}
            maxLength={6}
          />
        </label>
        <button
          className="btn btn-secondary btn-block"
          disabled={!name.trim() || codigoDeSessao.length !== 6}
          onClick={() => onConnect({ kind: "join", name: name.trim(), codigoDeSessao })}
        >
          Entrar
        </button>
      </div>
    </div>
  );
}
