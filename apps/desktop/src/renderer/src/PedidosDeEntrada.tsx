import type { EntryRequestEntry } from "../../shared/clientSessaoState.js";
import { selectPilhaDePedidos } from "../../shared/pedidosQueue.js";

export interface PedidosDeEntradaProps {
  readonly pedidos: readonly EntryRequestEntry[];
  readonly onRespond: (participanteId: string, approved: boolean) => void;
}

/**
 * A fila de pedidos como pilha de cards (spec 0008, "Aprovação de entrada"). Continua não-modal
 * pelo motivo de sempre — dois modais um sobre o outro fazem o Anfitrião aprovar quem não queria —
 * mas empilhada de verdade: um pedido por vez, os seguintes desenhados atrás, e o contador dizendo
 * quantos faltam. Antes, N pedidos viravam N faixas empilhadas empurrando o Palco para fora da tela.
 */
export function PedidosDeEntrada({ pedidos, onRespond }: PedidosDeEntradaProps) {
  const pilha = selectPilhaDePedidos(pedidos);
  const ativo = pilha.ativo;
  if (!ativo) return null;

  return (
    <div className="pedido-pilha flex-none" role="status">
      {/* Os de trás são profundidade, não conteúdo: quem lê por leitor de tela recebe o ativo e o
          contador, que já dizem tudo o que há para saber. */}
      {pilha.atras.map((pedido, index) => (
        <div
          key={pedido.participanteId}
          className={`card card-accent pedido-pilha-fundo pedido-pilha-fundo-${index + 1}`}
          aria-hidden
        />
      ))}

      <div className="card card-accent pedido-pilha-frente flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          {ativo.name} pediu para entrar.
          {pilha.restantes > 0 && <span className="tag tag-accent">+{pilha.restantes} esperando</span>}
        </span>
        <span className="flex flex-none gap-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onRespond(ativo.participanteId, true)}>
            Aprovar
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRespond(ativo.participanteId, false)}>
            Recusar
          </button>
        </span>
      </div>
    </div>
  );
}
