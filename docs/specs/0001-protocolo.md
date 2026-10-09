# 0001 — Protocolo

Define `packages/protocol`: as mensagens trocadas entre o app e o sinalizador, o handshake de
versão e a máquina de estados da Sessão. Nada aqui importa Electron, React ou WebRTC.

## Handshake de versão

`PROTOCOL_VERSION` é um inteiro que sobe quando qualquer mensagem muda de forma incompatível.
Está em **2** desde a Retomada ([spec 0011](./0011-retomada.md)). Toda mensagem de entrada na
Sessão (`create-sessao`, `join`, `resume`) o carrega. O sinalizador recusa
versão diferente da sua com `entry-refused { reason: 'incompatible-version' }`, e o app mostra
"Atualize o aplicativo para entrar nesta Sessão".

Isso existe porque sem Servidor mediando a mídia, dois amigos em versões diferentes falham de
formas que parecem problema de rede. O handshake transforma isso numa mensagem clara.

## Mensagens

Todas as mensagens são JSON com um campo `type` discriminante, validadas com Zod na fronteira.
`participanteId` é um UUID atribuído pelo sinalizador na conexão. Os identificadores de código
(`type`, nomes de campo) são em inglês, exceto os termos de domínio do CONTEXT.md — `sessao`,
`anfitriao`, `transmissor`, `participante`, `palco` — que permanecem em português dentro deles.

### App → Sinalizador

| Type | Campos | Quem pode enviar |
|---|---|---|
| `create-sessao` | `name`, `protocolVersion`, `joinNonce` | qualquer um |
| `join` | `codigoDeSessao`, `name`, `protocolVersion`, `joinNonce` | qualquer um |
| `respond-entry` | `participanteId`, `approved` | só o Anfitrião |
| `expel` | `participanteId` | só o Anfitrião |
| `request-palco` | — | qualquer Participante admitido |
| `release-palco` | — | quem está no Palco |
| `signal` | `toParticipanteId`, `payload` | qualquer Participante admitido |
| `leave` | — | qualquer Participante admitido |
| `resume` | `codigoDeSessao`, `participanteId`, `joinNonce`, `protocolVersion` | qualquer um, como primeira mensagem de uma conexão |

`payload` do `signal` é opaco para o sinalizador: ele repassa sem inspecionar. É por ali que
trafegam SDP e ICE candidates.

`joinNonce` é um UUID sorteado uma vez por processo do app e reenviado em toda tentativa. Não é
identidade: no `join`, serve para o sinalizador reconhecer que o pedido que chega vem do mesmo app
do pedido anterior e substituir um pelo outro ([ADR 0010](../adr/0010-chave-de-pedido-de-entrada.md)).
No `resume`, é a prova de que quem volta é quem caiu — o `participanteId` sozinho está no roster de
todo mundo. Nunca sai do app nem do sinalizador, e morre com o processo
([ADR 0012](../adr/0012-retomada-com-a-sessao-no-storage.md)).

### Sinalizador → App

| Type | Campos | Destinatário |
|---|---|---|
| `sessao-created` | `codigoDeSessao`, `participanteId` | quem criou |
| `entry-request` | `participanteId`, `name` | só o Anfitrião |
| `entry-request-withdrawn` | `participanteId` | só o Anfitrião |
| `entry-approved` | `participanteId`, `roster`, `transmissores` | quem entrou |
| `entry-refused` | `reason` | quem tentou |
| `participante-joined` | `participante` | todos os demais |
| `participante-left` | `participanteId`, `reason` | todos os demais |
| `transmissores-changed` | `participanteIds` | todos |
| `signal` | `fromParticipanteId`, `payload` | o destinatário do `signal` |
| `sessao-ended` | `reason` | todos |
| `palco-denied` | `reason` | quem pediu o Palco |
| `resumed` | `participanteId`, `roster`, `transmissores`, `entryRequests` | quem retomou |
| `resume-refused` | `reason` | quem tentou |

Motivos de `entry-refused`: `'incompatible-version'`, `'invalid-code'`, `'sessao-full'`,
`'refused-by-anfitriao'`.
Motivos de `participante-left`: `'left'`, `'expelled'`, `'disconnected'`.
Motivos de `sessao-ended`: `'anfitriao-left'`.
Motivo de `palco-denied`: `'palco-full'`.
Motivo de `resume-refused`: `'not-resumable'`, o único — Sessão inexistente, Participante
desconhecido e nonce errado são indistinguíveis de propósito.

`entryRequests` do `resumed` é `{ participanteId, name }[]`: vem preenchido só para o Anfitrião e
substitui a lista dele. Para os demais é `[]`.

`palco-denied` não fazia parte da tabela original desta spec — foi adicionada porque a regra de
`request-palco` abaixo descrevia uma recusa sem um tipo de mensagem para carregá-la.

## Máquina de estados da Sessão

Implementada como função pura: `(state, message) => { state, effects }`. Os efeitos são
descrições de mensagens a enviar, não envios. É isso que permite testá-la sem rede.

Estados de um Participante: `pending-approval` → `admitted` ⇄ `fallen` → `left`.

`fallen` é quem caiu e ainda está no prazo da Retomada. Continua na Sessão: aparece no roster
(`entry-approved`, `resumed`) e conta para `MAX_PARTICIPANTES`. Não recebe efeitos — não tem
socket —, e um `signal` para ele é descartado.

Regras que a máquina impõe:

- Um Participante em `pending-approval` só pode enviar `leave`. Qualquer outra mensagem dele
  é descartada.
- `request-palco` concede a vaga se `transmissores.length < MAX_TRANSMISSORES`; senão responde
  negando com `palco-denied { reason: 'palco-full' }`. Primeiro a chegar, sem fila — o Durable
  Object é single-threaded, então a ordem de chegada já resolve a disputa.
- `join` com um `joinNonce` que já está na Sessão remove o Participante anterior antes de registrar
  o novo — o pendente vira `entry-request-withdrawn` para o Anfitrião; o admitido vira
  `participante-left { reason: 'disconnected' }` para todos, liberando a vaga de Palco se tinha uma.
  Isso acontece **antes** da conta de `MAX_PARTICIPANTES`: um fantasma não rouba a vaga de si mesmo.
- `join` com a Sessão em `MAX_PARTICIPANTES` recusa com `'sessao-full'`.
- Um Participante em `pending-approval` que envia `leave` (ou cuja conexão cai) gera
  `entry-request-withdrawn` para o Anfitrião. Sem isso o pedido fica na fila dele para sempre, e
  aprová-lo não faz nada.
- `expel` e `respond-entry` vindos de quem não é o Anfitrião são descartados.
- A saída do Anfitrião encerra a Sessão para todos.

### Retomada

Spec [0011](./0011-retomada.md). Funções puras que recebem `now`; nada de `Date.now()` no pacote.

- `processFall`: um `admitted` cai para `fallen` sem efeito nenhum, o Anfitrião inclusive; um
  `pending-approval` sai como numa desconexão.
- `processResume`: com a mesma versão, o mesmo Código e o par `participanteId` + `joinNonce` de
  alguém `admitted` ou `fallen`, volta a `admitted` e recebe `resumed` com o estado inteiro. Aceitar
  a partir de `admitted` é de propósito: o fechamento do socket antigo pode não ter chegado. Fora
  isso, `resume-refused` (ou `entry-refused 'incompatible-version'`) para o id da conexão.
- `processRetomadaDeadlines`: quem está `fallen` há `RETOMADA_TIMEOUT_MS` (60 s) sai com
  `participante-left { reason: 'disconnected' }`, liberando o Palco; se é o Anfitrião,
  `sessao-ended { reason: 'anfitriao-left' }`.
- Sem Anfitrião, os pedidos de entrada ficam pendentes; o `resumed` dele os entrega.
- Quem foi expulso enquanto caído não retoma.

## Código de Sessão

Seis caracteres do alfabeto `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (sem `I`, `L`, `O`, `0`, `1`, que
as pessoas confundem ao ditar). Gerado com `crypto.getRandomValues`. Existe só enquanto a Sessão
existe — veja a [ADR 0004](../adr/0004-codigo-efemero-sem-identidade.md).

## Pronto quando

- `packages/protocol` compila e é testável com `node --test`, sem instalar Electron.
- Toda mensagem da tabela tem um schema Zod e um tipo TypeScript derivado dele.
- Cada regra da máquina de estados tem um teste que a exercita, incluindo as recusas.
- Um teste monta uma Sessão de 7 Participantes com 2 Transmissores e verifica que o oitavo é
  recusado e o terceiro pedido de Palco é negado.
