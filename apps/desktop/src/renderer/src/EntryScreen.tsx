import { useState } from "react";
import type { EntryRefusedReason, SessaoEndedReason } from "@pvt-broadcast/protocol";
import type { ConnectAction } from "../../shared/ipc.js";

const ENTRY_ERROR_MESSAGES: Record<EntryRefusedReason, string> = {
  "incompatible-version": "Atualize o aplicativo para entrar nesta Sessão.",
  "invalid-code": "Código de Sessão inválido.",
  "sessao-full": "Esta Sessão já está cheia.",
  "refused-by-anfitriao": "O Anfitrião recusou sua entrada.",
};

const SESSAO_ENDED_MESSAGES: Record<SessaoEndedReason, string> = {
  "anfitriao-left": "O Anfitrião saiu e a Sessão terminou.",
};

const NAME_STORAGE_KEY = "pvt-broadcast:name";

export interface EntryScreenProps {
  readonly entryError: EntryRefusedReason | null;
  readonly sessaoEndedReason: SessaoEndedReason | null;
  readonly onConnect: (action: ConnectAction) => void;
}

export function EntryScreen({ entryError, sessaoEndedReason, onConnect }: EntryScreenProps) {
  const [name, setName] = useState(() => localStorage.getItem(NAME_STORAGE_KEY) ?? "");
  const [codigoDeSessao, setCodigoDeSessao] = useState("");

  function persistName(value: string): void {
    setName(value);
    localStorage.setItem(NAME_STORAGE_KEY, value);
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 360, margin: "80px auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <h1>pvt-broadcast</h1>
      {sessaoEndedReason && <p style={{ color: "#b45309" }}>{SESSAO_ENDED_MESSAGES[sessaoEndedReason]}</p>}
      {entryError && <p style={{ color: "#dc2626" }}>{ENTRY_ERROR_MESSAGES[entryError]}</p>}

      <label>
        Seu nome
        <input value={name} onChange={(e) => persistName(e.target.value)} style={{ display: "block", width: "100%" }} />
      </label>

      <button disabled={!name.trim()} onClick={() => onConnect({ kind: "create", name: name.trim() })}>
        Criar Sessão
      </button>

      <hr />

      <label>
        Código de Sessão
        <input
          value={codigoDeSessao}
          onChange={(e) => setCodigoDeSessao(e.target.value.toUpperCase())}
          maxLength={6}
          style={{ display: "block", width: "100%", textTransform: "uppercase" }}
        />
      </label>
      <button
        disabled={!name.trim() || codigoDeSessao.length !== 6}
        onClick={() => onConnect({ kind: "join", name: name.trim(), codigoDeSessao })}
      >
        Entrar
      </button>
    </div>
  );
}
