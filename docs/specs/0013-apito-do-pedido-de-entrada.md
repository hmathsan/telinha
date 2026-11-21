# 0013 — Apito do Pedido de entrada

Quando chega um **Pedido de entrada** (CONTEXT.md), o Anfitrião ouve um apito. Se a janela do
Telinha não está em foco, ela também pisca na barra de tarefas. Quem transmite costuma estar no jogo,
não olhando para o Telinha, e o amigo que pediu não tem outro jeito de avisar. Hoje o pedido só
aparece como card (spec [0008](./0008-telas.md), "Pedidos de entrada").

Não depende de nenhuma spec pendente. Pode sair antes da [0011](./0011-retomada.md), mas a regra de
"novo" abaixo já considera a Retomada.

## Comportamento

- **Toca um apito por pedido novo,** com a janela em foco ou não, enquanto o apito não estiver
  silenciado. Quem está olhando ouve um apito curto, e isso não atrapalha.
- **Pisca na barra de tarefas** só quando a janela não está em foco, e para quando ela ganha foco.
  Continua piscando mesmo com o apito silenciado, porque silenciar o som não deve esconder o aviso
  visual.
- **Não repete.** Um pedido pendente não volta a apitar.
- **Botão de silenciar o apito na barra superior,** visível só para o Anfitrião (ao lado do botão de
  Participantes): ícone de sino (`IconBell` quando ativo, `IconBellSlash` quando silenciado), com
  `aria-pressed` e título descritivo ("Silenciar apito de entrada" / "Ativar apito de entrada").
  - A preferência é persistida em `localStorage` (`scrn-broadcast:apito-muted`, `"1"` quando
    silenciado; padrão ativo), da mesma forma que o nome na Entrada.
  - Pedidos que chegam com o apito silenciado ainda entram no conjunto de `anunciados`: reativar o
    apito não dispara apito retroativo para pedidos já pendentes.
- **Só o Anfitrião ouve,** porque só ele recebe `entry-request`.
- **O apito nunca vai no Som,** pela invariante da 0009: o Som nunca inclui o próprio app.

## O que é "novo"

Um pedido é novo quando o seu `participanteId` ainda não apitou **nesta Sessão**. É uma função pura
em `shared/pedidosQueue.ts`, ao lado de `selectPilhaDePedidos`:

```ts
/** Os pedidos cujo `participanteId` não está em `anunciados`, na ordem de chegada. */
export function pedidosNovos(
  anunciados: ReadonlySet<string>,
  pedidos: readonly EntryRequestEntry[],
): EntryRequestEntry[];
```

O `useSessao` guarda os anunciados num `useRef<Set<string>>`, que é zerado ao sair da Sessão. A cada
mudança de `pendingEntryRequests`, ele:

1. calcula `pedidosNovos`;
2. se houver pelo menos um:
   - se o apito não estiver silenciado, apita **uma vez** (cinco pedidos no mesmo instante não viram
     cinco apitos) e loga `pedido-apito`; senão, loga `pedido-apito-silenciado`;
   - pede atenção (`requestAttention`) em ambos os casos;
3. acrescenta os ids ao conjunto.

O conjunto, e não "o que não estava na lista anterior", é o que mantém a 0011 correta: quando o
Anfitrião faz a Retomada, ele recebe a lista inteira de pedidos pendentes de novo, e eles não podem
apitar outra vez.

Os testes, em `pedidosQueue.test.ts`, cobrem:

- lista vazia não devolve nada;
- um pedido novo é devolvido;
- um pedido já anunciado não é devolvido, mesmo reaparecendo depois de sumir da lista;
- dois novos chegam juntos na ordem de chegada.

## Apito

Crie `renderer/src/media/apito.ts`, com `tocarApito(): void`. O som é sintetizado pela Web Audio
API, sem arquivo de áudio e sem licença:

- dois tons senoidais curtos, 880 Hz e depois 1320 Hz, de 120 ms cada, com 60 ms entre eles;
- envelope com ataque e saída de 10 ms, para não estalar;
- ganho de pico 0,2.

Um único `AudioContext` é criado preguiçosamente e reaproveitado. Se ele estiver `suspended`, chame
`resume()` antes. Uma falha (contexto que não retoma ou exceção) loga `pedido-apito-failed` (warn,
com `message`) e não lança: o card continua aparecendo. A política de autoplay padrão do Electron
(spec 0009, "Reprodução no Espectador") já dispensa gesto do usuário.

## Barra de tarefas

IPC novo (`shared/ipc.ts`, `preload/index.ts`), sem resposta: `requestAttention(): void`. No
principal:

- se `mainWindow` está em foco, não faz nada;
- senão, chama `mainWindow.flashFrame(true)` e loga `pedido-attention-requested` (info).

Em `mainWindow.ts`, o evento `focus` chama `flashFrame(false)`.

## Log

| Evento | Onde | Nível | Campos |
| --- | --- | --- | --- |
| `pedido-apito` | renderer | info | `novos` (quantos), `total` |
| `pedido-apito-silenciado` | renderer | info | `novos`, `total` |
| `pedido-apito-failed` | renderer | warn | `message` |
| `pedido-attention-requested` | principal | info | — |

## Roteiro manual

Os passos usam duas máquinas, ou duas instâncias.

1. **Em foco.** Com o Telinha em foco, peça entrada pela outra máquina. Toca um apito, e a barra de
   tarefas não pisca.
2. **Fora de foco.** Com outro app em foco, peça entrada. Toca um apito e o ícone pisca. Clicar no
   Telinha para o piscar.
3. **Sem repetição.** Deixe o pedido pendente por 30 s. Não toca outro apito.
4. **Silenciado.** Silencie o apito na barra superior, tire o foco e peça entrada. Não toca apito,
   mas a barra de tarefas continua piscando. Reative o apito com o pedido ainda pendente: não toca
   apito retroativo. Feche e abra o app: a preferência continua salva.
5. **Rajada.** Três pedidos em sequência rápida dão três apitos, um por pedido. Pedidos no mesmo
   instante dão um apito só.
6. **Transmitindo.** Transmita o monitor com "Sistema inteiro" e peça entrada. O Anfitrião ouve o
   apito, e o Espectador não.
7. **Retomada.** Com um pedido pendente, derrube a rede do Anfitrião e restaure-a dentro do prazo.
   O pedido continua lá, e o apito não toca de novo.

## Pronto quando

- `npm test` passa com os casos novos de `pedidosQueue.test.ts`.
- `npm run typecheck` passa.
- Os casos 1 a 7 do roteiro passam.
