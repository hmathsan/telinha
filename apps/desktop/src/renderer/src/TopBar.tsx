import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatCodigoDeSessao } from "../../shared/codigoDeSessao.js";
import type { ModoPalco } from "../../shared/palcoSelection.js";
import {
  IconBroadcast,
  IconCheck,
  IconCopy,
  IconGridFour,
  IconSignOut,
  IconSquare,
  IconUsers,
} from "./components/icons/index.js";

const COPIED_FEEDBACK_MS = 1500;

export interface TopBarProps {
  readonly codigoDeSessao: string | null;
  readonly modo: ModoPalco;
  readonly alternadorVisivel: boolean;
  readonly onModoChange: (modo: ModoPalco) => void;
  readonly transmitirButton: ReactNode;
  readonly participantesCount: number;
  readonly drawerOpen: boolean;
  readonly onToggleDrawer: () => void;
  readonly onLeave: () => void;
}

/**
 * Um elemento comum no topo do conteúdo, **não** a moldura da janela: a barra de título nativa do
 * Windows continua no lugar e `mainWindow.ts` não muda (spec 0008, "Barra superior").
 */
export function TopBar(props: TopBarProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function copyCodigo(): void {
    if (!props.codigoDeSessao) return;
    window.pvtBroadcast.copyToClipboard(props.codigoDeSessao);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  }

  return (
    <header className="topbar flex flex-none items-center gap-4 px-4 py-2">
      <span className="brand">
        <IconBroadcast /> Telinha
      </span>

      {props.codigoDeSessao && (
        <span className="tag">
          <span className="codigo-de-sessao">{formatCodigoDeSessao(props.codigoDeSessao)}</span>
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            onClick={copyCodigo}
            title={copied ? "Código copiado" : "Copiar Código de Sessão"}
          >
            {copied ? <IconCheck label="Código copiado" /> : <IconCopy label="Copiar Código de Sessão" />}
          </button>
        </span>
      )}

      <span className="flex-1" />

      {/* Só com dois ou mais Transmissores: com um só não há escolha de layout a fazer (0008). */}
      {props.alternadorVisivel && (
        <span className="segmented" role="group" aria-label="Modo do Palco">
          <button
            type="button"
            className={`btn ${props.modo === "foco" ? "btn-secondary" : "btn-ghost"}`}
            aria-pressed={props.modo === "foco"}
            onClick={() => props.onModoChange("foco")}
          >
            <IconSquare /> Foco
          </button>
          <button
            type="button"
            className={`btn ${props.modo === "grade" ? "btn-secondary" : "btn-ghost"}`}
            aria-pressed={props.modo === "grade"}
            onClick={() => props.onModoChange("grade")}
          >
            <IconGridFour /> Grade
          </button>
        </span>
      )}

      {props.transmitirButton}

      <button
        type="button"
        className="btn btn-ghost"
        aria-expanded={props.drawerOpen}
        onClick={props.onToggleDrawer}
        title="Participantes"
      >
        <IconUsers /> {props.participantesCount}
      </button>

      <button type="button" className="btn btn-ghost" onClick={props.onLeave}>
        <IconSignOut />
        Sair
      </button>
    </header>
  );
}
