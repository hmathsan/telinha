# 0011 — Retomada

Quem cai volta à Sessão como a mesma pessoa. Vale para qualquer Participante, Anfitrião incluído.
O porquê está na [ADR 0012](../adr/0012-retomada-com-a-sessao-no-storage.md), e os termos **Sair**,
**Cair** e **Retomada** estão no [CONTEXT.md](../../CONTEXT.md).

**Esta spec revisa trechos de outras.** Onde houver conflito, ela prevalece, e a fase 5 atualiza os
textos antigos:

- 0001: "A saída do Anfitrião encerra a Sessão".
- 0002: "Desconexão do Anfitrião emite `sessao-ended`".
- 0003: "Não construa recuperação de sessão" e a "Pendência conhecida".
- O comentário de `signalingClient.ts` que diz que o `create` não reconecta.

## Comportamento

- **Cair não tira ninguém da Sessão.** Quem cai continua no roster e continua ocupando a vaga de
  Participante e a de Palco, se tinha uma. Os demais não recebem mensagem nenhuma.
- **O prazo é `RETOMADA_TIMEOUT_MS = 60_000`,** em `packages/protocol/src/limits.ts`. Quem volta
  dentro dele recupera o mesmo `participanteId`, sem pedido de entrada. A malha de mídia não é
  refeita.
- **Prazo vencido** tem o efeito de uma desconexão de hoje: `participante-left { reason: 'disconnected' }`
  para os demais e a vaga de Palco liberada. Se quem venceu o prazo é o Anfitrião, é
  `sessao-ended { reason: 'anfitriao-left' }`.
- **Sair não muda.** `leave` explícito, inclusive do Anfitrião, tem efeito imediato.
- **Só quem caiu vê algo:** a faixa de reconexão que a tela da Sessão já mostra para
  `status: "reconnecting"`.
- **Sem Anfitrião, os pedidos de entrada ficam pendentes.** Quando ele volta, recebe a lista inteira.
- **Quem volta tarde demais:**
  - o Espectador vira um pedido de entrada automaticamente, com o mesmo nome e Código;
  - o Anfitrião vai para a Entrada com "A conexão com a Sessão foi perdida.".
- **Fechar o app é Sair.** `participanteId` e `joinNonce` vivem só na memória do processo.

Casos de borda, com a resposta:

- **O Anfitrião clica em Sair enquanto está caído.** Não há socket para levar o `leave`. A Sessão
  acaba quando o prazo vence, não antes. Aceito.
- **O Anfitrião expulsa quem está caído.** Vale normalmente. A Retomada dessa pessoa é recusada, e
  ela reaparece como pedido de entrada, que o Anfitrião pode recusar.
- **Um `signal` para quem está caído** é descartado, como já acontece com quem não está admitido. A
  escada de reconexão da malha (spec 0003) cuida de renegociar depois.

## Fase 0 — Correção avulsa

`signalingClient.ts` reconecta para sempre quando o sinalizador responde `404` (log de 09/09/2026,
21:47). Uma resposta HTTP 4xx no upgrade que não seja `429` passa a ser terminal: emite `closed`
com `reason: "signaler-rejected"`. Use o evento `unexpected-response` do `ws` para ler o status, em
vez de interpretar a mensagem de erro. O `429` continua no backoff.

## Fase 1 — Protocolo (`packages/protocol`)

`PROTOCOL_VERSION` vai para **2**.

### Mensagens

App → Sinalizador:

| Type | Campos | Quem pode enviar |
|---|---|---|
| `resume` | `codigoDeSessao`, `participanteId`, `joinNonce`, `protocolVersion` | qualquer um, como primeira mensagem de uma conexão |

Sinalizador → App:

| Type | Campos | Destinatário |
|---|---|---|
| `resumed` | `participanteId`, `roster`, `transmissores`, `entryRequests` | quem retomou |
| `resume-refused` | `reason: 'not-resumable'` | quem tentou |

- `entryRequests` é `{ participanteId, name }[]`. Vem preenchido só para o Anfitrião e **substitui**
  a lista dele, não se soma a ela. Para os demais é `[]`.
- Um único motivo em `resume-refused`: Sessão inexistente, Participante desconhecido e nonce errado
  são indistinguíveis de propósito.
- Versão diferente responde `entry-refused { reason: 'incompatible-version' }`, como no `join`.

### Estado

- `ParticipanteState` ganha `"fallen"`.
- `InternalParticipante` ganha `fallenAt: number | null`.
- O roster (`entry-approved`, `resumed`) inclui os `fallen`: eles continuam na Sessão.
- `MAX_PARTICIPANTES` conta os `fallen`.
- Destinatários de efeitos continuam sendo só os `admitted`. Quem está caído não tem socket, e o
  `resumed` entrega o estado inteiro na volta.

### Transições novas

Todas são funções puras que recebem `now: number`. Nada de `Date.now()` dentro do pacote.

- **`processFall(state, participanteId, now)`**
  - `pending-approval`: igual a `processLeave(..., "disconnected")` de hoje, com
    `entry-request-withdrawn` para o Anfitrião.
  - `admitted`: vira `fallen` com `fallenAt = now`, **sem efeitos**. Vale também para o Anfitrião.
  - `fallen` ou inexistente: nada muda.
- **`processResume(state, connectionId, message, now)`**
  - Versão diferente → `entry-refused incompatible-version`.
  - Código diferente, `participanteId` inexistente, estado que não seja `admitted` nem `fallen`, ou
    `joinNonce` diferente do guardado → `resume-refused`.
  - Senão → `admitted`, `fallenAt = null` e o efeito `resumed` para `message.participanteId`.
  - Aceitar a partir de `admitted` é intencional: o fechamento do socket antigo pode ainda não ter
    chegado ao Durable Object.
  - Os efeitos de recusa vão para um id de conexão que o chamador passa (`connectionId`), porque quem
    foi recusado não tem `participanteId` na Sessão.
- **`processRetomadaDeadlines(state, now)`**
  - Aplica `processLeave(..., "disconnected")` a cada `fallen` com
    `now >= fallenAt + RETOMADA_TIMEOUT_MS`, acumulando estado e efeitos.
  - Se um deles é o Anfitrião, o resultado é o `sessao-ended` de hoje.
- **`nextRetomadaDeadline(state): number | null`**: o menor `fallenAt + RETOMADA_TIMEOUT_MS`.

`processMessage` com `type: "resume"` não é chamado. O Durable Object trata `resume` antes, como já
faz com `create-sessao`. Faça o `switch` rejeitar `resume` explicitamente.

### Testes (em `stateMachine.test.ts`)

- Cada ramo acima, incluindo as três formas de recusa.
- Admitido cai e volta: o estado final é igual ao inicial, e ninguém além dele recebe efeito.
- O Anfitrião cai e o prazo vence: `sessao-ended`.
- Um Transmissor cai: mantém a vaga até o prazo e perde a vaga no prazo, com `transmissores-changed`.
- Pedido de entrada com o Anfitrião caído: fica `pending-approval`, e o `resumed` do Anfitrião o
  lista em `entryRequests`.
- `fallen` conta para `sessao-full`.
- O Anfitrião expulsa um `fallen`, e depois a Retomada dele é recusada.

## Fase 2 — Sinalizador (`apps/signaler`)

A parte de maior risco. Mude o mínimo em volta.

### Fonte da verdade

- O `SessaoState` inteiro, **incluindo `pending-approval`**, fica numa chave do storage (`"sessao"`),
  serializado com `participantes` como array.
- O attachment de cada socket passa a carregar só `{ participanteId, codigoDeSessao }`.
- Grave com `ctx.storage.put` só quando o estado serializado muda. Um `signal` nunca grava.
- A chave some quando a Sessão termina (`ended`): o `storage.delete("sessao")` roda antes do alarme
  de limpeza de 60 s que já existe.

### Reconciliação

Rode sempre que carregar o estado, antes de processar qualquer coisa:

- Um "socket vivo" é o que está em `ctx.getWebSockets()` com `readyState` aberto, excluindo o socket
  que está sendo fechado no `handleDisconnect`.
- Para cada Participante sem socket vivo, aplique `processFall(state, id, now)`: um `admitted` vira
  `fallen` e um `pending-approval` sai.
- É isso que detecta um reinício do objeto, que não emite `webSocketClose`.

### Mensagens

- **`create-sessao`**: só vale sem `"sessao"` no storage.
- **`join`**: sem `"sessao"` no storage → `invalid-code`, como hoje.
- **`resume`**:
  - chama `processResume` com o id aleatório da conexão como `connectionId`;
  - se aceito, **antes** de entregar os efeitos:
    1. todo outro socket com o mesmo `participanteId` recebe o attachment reduzido e é fechado
       (como `stripAndClose`), para o fechamento dele não virar uma queda;
    2. o attachment do socket novo passa a ter o `participanteId` retomado;
  - depois entrega os efeitos e envia `ice-servers`, porque as credenciais TURN têm TTL de minutos;
  - se recusado, entrega `resume-refused` **sem fechar**: o Espectador manda `join` na mesma conexão.
- **`webSocketClose` / `webSocketError`** chamam `processFall`, e não mais `processLeave`.
- **`leave` explícito** continua em `processLeave` e fecha com `removido-da-sessao`.

### Alarme

Há um só por objeto. Depois de toda transição, agende
`min(nextRetomadaDeadline, now + VIGIA_INTERVAL_MS)`, com `VIGIA_INTERVAL_MS = 5 * 60_000`, enquanto
`"sessao"` existir.

No `alarm()`:
1. Carregue o estado.
2. Reconcilie.
3. Aplique `processRetomadaDeadlines`.
4. Grave, entregue os efeitos e feche os sockets como `applyResult` já faz.
5. Reagende.

Sem `"sessao"` e sem sockets, faça o `deleteAll` de hoje.

A vigia é o que encerra uma Sessão cujo objeto reiniciou e para a qual ninguém voltou. Sem ela, o
Código continuaria aceitando pedidos para um Anfitrião que não existe mais.

### Testes

Em `durableObject.test.ts`, ou num `retomada.test.ts` novo:

- Espectador fecha o socket, reconecta com `resume` e recebe `resumed` com o mesmo id. O Anfitrião
  não recebe `participante-left`.
- O Anfitrião fecha o socket e os demais não recebem `sessao-ended`. Com `runDurableObjectAlarm`
  depois do prazo, recebem. Controle o relógio com `vi.setSystemTime` ou gravando `fallenAt` no
  passado via `runInDurableObject`.
- `resume` com nonce errado recebe `resume-refused`, e um `join` na mesma conexão vira pedido de
  entrada.
- `resume` com o socket antigo ainda aberto: o antigo é fechado e ninguém vê saída.
- **Reinício do objeto:** grave via `runInDurableObject` um `"sessao"` com três admitidos e nenhum
  socket.
  - Conectar um deles com `resume` retoma.
  - `runDurableObjectAlarm` depois do prazo encerra a Sessão para quem retomou, se o Anfitrião não
    voltou.
- `signal` não grava no storage: espione `ctx.storage.put` ou compare as contagens.

## Fase 3 — Processo principal (`signalingClient.ts`)

- **Alvo da Retomada.** Guarde `resumeTarget: { codigoDeSessao, participanteId, isAnfitriao } | null`
  ao ver passar `sessao-created`, `entry-approved` ou `resumed`. Limpe em `connect()`, `leave()` e em
  qualquer fechamento terminal.
- **Queda com `resumeTarget`,** vindo de `create` ou de `join:
  - guarde `fellAt` da primeira queda e zere quando chegar `resumed`;
  - reconecte com o backoff atual em `/sessao/join?codigoDeSessao=…`, com `resume` como primeira
    mensagem;
  - as mensagens da fila de saída só são enviadas depois de `resumed`, nunca antes.
- **Recusa ou prazo local.** Chegou `resume-refused`, ou `now - fellAt > RETOMADA_TIMEOUT_MS` antes de
  conseguir conexão:
  - **Anfitrião:** emita `closed` com `reason: "anfitriao-connection-lost"`.
  - **Espectador:** emita o estado novo `{ status: "rejoining", codigoDeSessao, name }` e mande `join`
    na mesma conexão (se ela estiver aberta) ou na próxima tentativa. Daqui em diante é o caminho do
    `join` de hoje.
- **Queda sem `resumeTarget`** (antes de `sessao-created` ou de `entry-approved`): comportamento de
  hoje.
- **Log** (regra do AGENTS.md):
  - `signaling-resume-sent { attempt, msSinceFall }`
  - `signaling-resumed { msSinceFall }`
  - `signaling-resume-refused { reason, isAnfitriao }`
  - `signaling-resume-expired { msSinceFall, isAnfitriao }`

`SignalingConnectionState` em `shared/ipc.ts` ganha a variante `rejoining`.

## Fase 4 — Renderer

- **`clientSessaoState.ts`, `resumed`:**
  - substitui `roster` e `transmissores`;
  - para o Anfitrião, substitui `pendingEntryRequests` por `entryRequests`;
  - não mexe em `myId`, `screen` nem `codigoDeSessao`.
- **`useSessao.ts`, `resumed`:** reconcilie a malha com o roster anterior (`stateRef` antes do
  dispatch):
  - `handleParticipanteLeft` para quem saiu do roster;
  - `handleParticipanteJoined` **só** para ids que não estavam no roster, porque
    `meshManager.handleParticipanteJoined` não é idempotente e criaria uma segunda conexão;
  - depois o mesmo tratamento de `transmissores-changed`, incluindo o `isTransmitting`.
- **`rejoining`:** feche a malha e vá ao estado de `connect-attempt` de um `join`, ou seja Entrada
  com `awaitingApproval` e o Código. O `identity-changed-on-reconnect` continua como rede de
  segurança.
- **A faixa de `reconnecting`** em `SessaoScreen.tsx` já existe e é o aviso da Retomada. Troque o
  texto para "Reconectando à Sessão…", sem número de tentativa.

## Fase 5 — Documentos

- **0001:** tabelas com `resume`, `resumed` e `resume-refused`; estado `fallen`; regras da Retomada;
  versão 2; o parágrafo do `joinNonce` apontando para a ADR 0012.
- **0002:** "Comportamento", reescrevendo as linhas da desconexão, com o storage e a vigia. Também
  "Pronto quando": "Anfitrião desconectando derruba a Sessão" vira "Anfitrião caindo encerra a Sessão
  depois do prazo; saindo, na hora".
- **0003:** a linha "O app fechou" da tabela fica. O parágrafo "A camada 3…" passa a dizer que cair
  com o app aberto é Retomada (spec 0011) e que fechar o app continua exigindo reentrada manual. A
  "Pendência conhecida" sai.
- **0008:** o texto novo da faixa.
- **`roteiro-de-testes-manuais-de-midia.md` §4:** os roteiros abaixo. "Anfitrião sai" passa a dizer
  explicitamente "fecha a janela", para não se confundir com cair.
- **README.md e README.en.md:** a linha "Encerramento" ganha que uma queda de conexão de até um minuto
  não encerra nada.
- **specs/README.md:** a entrada da 0011 já existe.

### Roteiro manual

Precisa de duas máquinas.

- **Anfitrião cai e volta.** Wi-Fi do Anfitrião desligado por ~20 s.
  - Ninguém sai do roster e o vídeo dos outros não para.
  - No log do Anfitrião: `signaling-resume-sent` e depois `signaling-resumed`.
- **Anfitrião cai e não volta.** Wi-Fi desligado por ~90 s.
  - A Sessão termina para todos entre 60 e 65 s depois da queda.
  - O Anfitrião volta à Entrada com "A conexão com a Sessão foi perdida.".
- **Espectador cai e volta.** Mesmo teste com o Espectador. Nenhum pedido de entrada aparece para o
  Anfitrião.
- **Reinício do objeto.** Com `wrangler dev --persist-to .wrangler/state`, pare e suba o `wrangler` de
  novo com uma Sessão em andamento. Todos retomam.
- **Sessão longa.** Duas horas. Toda `signaling-close` com `1006` no log é seguida de
  `signaling-resumed`.

## Lançamento

A versão 2 recusa apps antigos com `incompatible-version`. A tag publica o Worker. Rode
`npm run release` e publique o rascunho logo depois, para que a janela em que ninguém atualizado
consegue entrar seja de minutos.

## Pronto quando

- Os testes das fases 1 e 2 passam, incluindo o de reinício do objeto.
- `npm run typecheck` e os testes de todos os pacotes passam.
- Os cinco roteiros manuais passaram em duas máquinas.
- As specs 0001, 0002, 0003 e 0008, o roteiro e os READMEs não contradizem esta spec.
