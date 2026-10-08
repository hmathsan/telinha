# Uma chave de pedido de entrada, que não é identidade

> Revisada em parte pela [ADR 0012](./0012-retomada-com-a-sessao-no-storage.md): na Retomada, o
> `joinNonce` passa a ser a prova de quem volta.

O `join` e o `create-sessao` carregam um `joinNonce`: um UUID sorteado uma vez por processo do app
e reenviado em toda tentativa de entrada, inclusive nas reconexões com backoff. Ao receber um
`join`, o sinalizador remove qualquer Participante que já esteja na Sessão com o mesmo `joinNonce`
antes de registrar o novo.

Isso existe por um defeito concreto, visto no primeiro teste com várias pessoas: o mesmo humano
aparecia duas vezes na lista de Participantes. O `participanteId` nasce por conexão WebSocket, e
uma conexão que morre sem `close` — queda meio-aberta, hibernação do Durable Object, o app pedindo
entrada de novo — continua contando como Participante enquanto a pessoa reentra. Sem nada ligando
as duas conexões, o sinalizador não tem como saber que são a mesma pessoa, e o `MAX_PARTICIPANTES`
ainda enche de fantasmas.

## Isto não é a identidade que a ADR 0004 rejeitou

A [ADR 0004](./0004-codigo-efemero-sem-identidade.md) recusa contas, senhas, chaves e qualquer
coisa que persista entre Sessões. O `joinNonce` não é nada disso:

- **Não persiste.** Vive na memória do processo e some quando o app fecha. Duas execuções do mesmo
  app na mesma máquina são dois humanos diferentes para o sinalizador, como sempre foram.
- **Não autentica.** Quem gate a entrada continua sendo o Código de Sessão e a aprovação manual do
  Anfitrião. Forjar um nonce alheio não entra em Sessão nenhuma — só derruba a própria conexão que
  o legítimo dono tinha, e para isso já bastaria conhecer o Código.
- **Não identifica ninguém para ninguém.** Não aparece na UI, não vai para o roster e nenhum outro
  Participante o recebe.

É uma chave de deduplicação de pedidos, no escopo de uma Sessão, com o tempo de vida do processo.

## Considerado e rejeitado

- **Deduplicar por nome digitado**: dois amigos podem se chamar Ana, e recusar a segunda seria pior
  que o defeito. O nome é livre justamente porque não decide nada (ADR 0004).
- **Heartbeat para detectar o socket morto**: resolve o fantasma, não resolve o resto — a pessoa
  que pede entrada de novo antes do heartbeat expirar continua duplicando. Ficam compatíveis: se
  um dia houver heartbeat, o nonce continua sendo o que liga as duas conexões.
- **Deixar o Anfitrião expulsar o duplicado na mão**: era o que sobrava antes, e o teste mostrou
  que ninguém entende qual dos dois "Bruno" expulsar.
