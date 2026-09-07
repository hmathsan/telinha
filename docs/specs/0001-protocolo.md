# 0001 — Protocolo

Define `packages/protocol`: as mensagens trocadas entre o app e o sinalizador, o handshake de
versão e a máquina de estados da Sessão. Nada aqui importa Electron, React ou WebRTC.

## Handshake de versão

`PROTOCOL_VERSION` é um inteiro que sobe quando qualquer mensagem muda de forma incompatível.
Toda mensagem de entrada na Sessão (`create-sessao`, `join`) o carrega. O sinalizador recusa
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
| `create-sessao` | `name`, `protocolVersion` | qualquer um |
| `join` | `codigoDeSessao`, `name`, `protocolVersion` | qualquer um |
| `respond-entry` | `participanteId`, `approved` | só o Anfitrião |
| `expel` | `participanteId` | só o Anfitrião |
| `request-palco` | — | qualquer Participante admitido |
| `release-palco` | — | quem está no Palco |
| `signal` | `toParticipanteId`, `payload` | qualquer Participante admitido |
| `leave` | — | qualquer Participante admitido |

`payload` do `signal` é opaco para o sinalizador: ele repassa sem inspecionar. É por ali que
trafegam SDP e ICE candidates.

### Sinalizador → App

| Type | Campos | Destinatário |
|---|---|---|
| `sessao-created` | `codigoDeSessao`, `participanteId` | quem criou |
| `entry-request` | `participanteId`, `name` | só o Anfitrião |
| `entry-approved` | `participanteId`, `roster`, `transmissores` | quem entrou |
| `entry-refused` | `reason` | quem tentou |
| `participante-joined` | `participante` | todos os demais |
| `participante-left` | `participanteId`, `reason` | todos os demais |
| `transmissores-changed` | `participanteIds` | todos |
| `signal` | `fromParticipanteId`, `payload` | o destinatário do `signal` |
| `sessao-ended` | `reason` | todos |
| `palco-denied` | `reason` | quem pediu o Palco |

Motivos de `entry-refused`: `'incompatible-version'`, `'invalid-code'`, `'sessao-full'`,
`'refused-by-anfitriao'`.
Motivos de `participante-left`: `'left'`, `'expelled'`, `'disconnected'`.
Motivos de `sessao-ended`: `'anfitriao-left'`.
Motivo de `palco-denied`: `'palco-full'`.

`palco-denied` não fazia parte da tabela original desta spec — foi adicionada porque a regra de
`request-palco` abaixo descrevia uma recusa sem um tipo de mensagem para carregá-la.

## Máquina de estados da Sessão

Implementada como função pura: `(state, message) => { state, effects }`. Os efeitos são
descrições de mensagens a enviar, não envios. É isso que permite testá-la sem rede.

Estados de um Participante: `pending-approval` → `admitted` → `left`.

Regras que a máquina impõe:

- Um Participante em `pending-approval` só pode enviar `leave`. Qualquer outra mensagem dele
  é descartada.
- `request-palco` concede a vaga se `transmissores.length < MAX_TRANSMISSORES`; senão responde
  negando com `palco-denied { reason: 'palco-full' }`. Primeiro a chegar, sem fila — o Durable
  Object é single-threaded, então a ordem de chegada já resolve a disputa.
- `join` com a Sessão em `MAX_PARTICIPANTES` recusa com `'sessao-full'`.
- `expel` e `respond-entry` vindos de quem não é o Anfitrião são descartados.
- A saída do Anfitrião encerra a Sessão para todos.

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
