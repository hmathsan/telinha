import type { Participante } from "@pvt-broadcast/protocol";
import { IconX } from "./components/icons/index.js";

export interface ParticipantesDrawerProps {
  readonly roster: readonly Participante[];
  readonly transmissores: readonly string[];
  readonly myId: string | null;
  readonly isAnfitriao: boolean;
  readonly onExpel: (participanteId: string) => void;
  readonly onClose: () => void;
}

function inicial(name: string): string {
  return name.trim().slice(0, 1) || "?";
}

/**
 * Painel de 300px à direita, fechado por padrão (spec 0004, emendada, e 0008): numa janela de
 * 1280px ele toma 23% da largura que o Palco não tem, e importa em dois momentos — aprovar alguém
 * e expulsar alguém — não o tempo todo.
 */
export function ParticipantesDrawer(props: ParticipantesDrawerProps) {
  // O Anfitrião é quem criou a Sessão, e por isso é o primeiro do roster: o estado autoritativo do
  // Durable Object insere o criador antes de qualquer entrada e preserva a ordem de inserção
  // (`admittedParticipantes` em packages/protocol/src/stateMachine.ts).
  const anfitriaoId = props.roster[0]?.id ?? null;

  return (
    <aside className="drawer flex flex-col gap-3 p-3">
      <div className="flex flex-none items-center justify-between gap-2">
        <h3 className="section-label">Participantes</h3>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={props.onClose} title="Fechar">
          <IconX label="Fechar gaveta de Participantes" />
        </button>
      </div>

      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {props.roster.map((p) => {
          const papel = p.id === anfitriaoId ? "Anfitrião" : "Participante";
          const sufixo = p.id === props.myId ? " · você" : "";
          return (
            <li key={p.id} className="flex items-center gap-3">
              <span className="avatar" aria-hidden="true">
                {inicial(p.name)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2">
                  <span className="truncate">{p.name}</span>
                  {props.transmissores.includes(p.id) && <span className="dot dot-live" title="Transmitindo" />}
                </span>
                <span className="participante-papel">{`${papel}${sufixo}`}</span>
              </span>
              {props.isAnfitriao && p.id !== props.myId && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => props.onExpel(p.id)}>
                  Expulsar
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
