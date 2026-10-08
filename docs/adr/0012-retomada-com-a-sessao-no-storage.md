# A Retomada guarda a Sessão no storage e usa o `joinNonce` como prova

Quem cai volta à Sessão como a mesma pessoa, com o mesmo `participanteId`, sem pedir entrada de novo,
desde que volte em até 60 s. Para isso o Durable Object passa a guardar um resumo da Sessão em
`ctx.storage` (Código, Anfitrião, Participantes com nome, estado e `joinNonce`, Transmissores) em
vez de reconstruí-la só a partir dos sockets vivos, e aceita a volta de quem apresenta o par
`participanteId` + `joinNonce` que ele tem guardado.

O motivo está nos logs de 12/09/2026. Descontado o relógio do Espectador (52,5 s adiantado, medido
pela mesma perna ICE ficando `connected` nas duas máquinas), as duas quedas do Anfitrião — 15:48:05
e 16:14:38 — aconteceram no mesmo décimo de segundo nas duas máquinas, com `1006`, e sem nenhum
deploy do sinalizador naquele dia. É o Durable Object ou a borda da Cloudflare derrubando todos os
sockets de uma vez, a cada 25–55 minutos. Com a Sessão vivendo só nos attachments, cada uma dessas
quedas a destruía, e nenhuma mudança no cliente conseguiria salvá-la.

## O que isto revisa

- **[ADR 0010](./0010-chave-de-pedido-de-entrada.md), "Não autentica".** Continua valendo para o
  `join`. Para a Retomada, o `joinNonce` passa a ser a prova: é um UUID que nunca sai do app nem do
  sinalizador, não vai para o roster e morre com o processo. O `participanteId` sozinho não prova
  nada — todo mundo o recebe no roster.
- **[Spec 0003](../specs/0003-malha-de-midia.md), "Não construa recuperação de sessão".** A frase
  falava de reentrada depois de fechar o app, e para isso continua valendo: fechar o app é Sair. O
  que muda é que cair com o app aberto deixou de encerrar alguma coisa.
- **[Spec 0002](../specs/0002-sinalizador.md), "Desconexão do Anfitrião destrói o objeto".** Agora
  só a saída do Anfitrião, ou o prazo vencido depois de ele cair.

## Considerado e rejeitado

- **Retomada só do Anfitrião.** Não resolve o caso real: quando o objeto reinicia, todos caem, e o
  Anfitrião voltaria para seis pedidos de entrada.
- **Token emitido pelo sinalizador no `sessao-created`.** Um segredo a mais, com o mesmo alcance e o
  mesmo tempo de vida do `joinNonce`, e um campo a mais em duas mensagens.
- **Guardar `participanteId` e `joinNonce` em disco**, para reabrir o app e retomar. Seria a
  identidade persistente que a [ADR 0004](./0004-codigo-efemero-sem-identidade.md) recusa.
- **Heartbeat.** Não teria evitado nenhuma das quedas registradas — o `1006` chegou no mesmo instante
  nos dois lados, não houve socket meio-aberto —, e num sinalizador público cada ping de cada
  instalação soma na cota diária de requisições.

## Consequências

- O storage é a fonte da verdade da Sessão, e os attachments só dizem qual socket é de qual
  `participanteId`. Escrever no storage acontece quando o estado muda, nunca por `signal`: o plano
  gratuito limita escritas.
- Um reinício do objeto não emite `webSocketClose`. Um alarme de vigia, sempre agendado enquanto a
  Sessão existe, é o que descobre quem sumiu sem avisar.
- `PROTOCOL_VERSION` sobe para 2.
