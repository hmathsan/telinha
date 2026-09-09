# 0002 — Sinalizador

Define `apps/signaler`: um Cloudflare Worker com um Durable Object por Sessão.

## Divisão de responsabilidade

O Durable Object é **transporte e registro de conexões**. Ele repassa mensagens, arbitra as
vagas de Palco e encerra a Sessão quando o Anfitrião desconecta.

O Anfitrião é a **autoridade sobre admissão**. O Durable Object nunca decide quem entra: recebe
o `entrar`, encaminha `pedido-de-entrada` ao Anfitrião, e espera o `responder-entrada`.

Um Durable Object por Sessão: o objeto nasce com a Sessão e morre com ela, então o estado fica
isolado por construção e some sozinho. O `codigoDeSessao` é o nome do objeto.

## Comportamento

- Um WebSocket por Participante. Use WebSocket Hibernation: não há cobrança de GB-s enquanto o
  objeto hiberna, então uma Sessão parada entre trocas de SDP custa zero. Guarde o estado por
  conexão com `serializeAttachment` (teto de 16 KB por conexão).
- O Durable Object roda a mesma máquina de estados de `packages/protocol`. Ele é a instância
  autoritativa dela; os apps mantêm uma cópia para renderizar a UI.
- O `payload` de `signal` é repassado sem inspeção.
- Desconexão de qualquer Participante emite `participante-left { reason: 'disconnected' }` e
  libera a vaga de Palco dele, se tinha.
- Desconexão do Anfitrião emite `sessao-ended { reason: 'anfitriao-left' }` a todos e
  destrói o objeto.
- Uma Sessão sem nenhum Participante por 60 segundos se destrói.

## Credenciais TURN e o desligador de gasto

O sinalizador emite as credenciais TURN, porque o token da API sai de um `.asar` em segundos se
ficar no app. Use TTL de minutos e um `customIdentifier` por Participante.

Antes de emitir, consulte o egresso acumulado do mês no dataset GraphQL
`callsTurnUsageAdaptiveGroups`. Passando do limite configurado, pare de emitir credenciais e
devolva apenas STUN. A Cloudflare não tem teto de gasto próprio — veja a
[ADR 0007](../adr/0007-desligador-proprio-para-o-turn.md).

## Limite de taxa nas rotas de entrada

A URL do sinalizador é pública ([ADR 0005](../adr/0005-repositorio-publico-por-causa-do-auto-update.md)),
e `/sessao/create` cria um Durable Object sem autenticação nenhuma. O limite existe para que
ninguém crie Durable Objects sem teto — cada um traz armazenamento e um alarme de 60 segundos.

**O que ele não faz:** proteger a cota diária de requisições do Worker. Um `429` também é uma
requisição, e código dentro do Worker roda depois de a requisição já ter sido contada. Só uma
regra de WAF na borda barraria antes, e ela não existe em `*.workers.dev`. Quem quiser queimar a
cota diária consegue, e o sintoma é ninguém abrir Sessão até o dia virar — sem fatura, porque a
conta não tem meio de pagamento ([ADR 0007](../adr/0007-desligador-proprio-para-o-turn.md)).

Limite por IP (`CF-Connecting-IP`), via bindings `[[ratelimits]]`: **5 por minuto** em
`/sessao/create` e **30 por minuto** em `/sessao/join`. O `join` é barato, mas é por onde se
varreria códigos; 36⁶ combinações já tornam isso inviável, então ali o limite é higiene. Quem
estoura recebe `429` com `Retry-After`.

O miniflare não simula `[[ratelimits]]`: em `wrangler dev` e nos testes as bindings não existem e
o Worker segue sem limite, de propósito. Por isso a decisão vive numa função pura
(`src/rateLimit.ts`), que é o que os testes cobrem.

O `429` ainda não vira mensagem na interface — quem estoura vê o erro genérico de conexão. É
conhecido e aceito: quem dispara 5 criações por minuto é quem está testando ou quem está
abusando.

## O que o sinalizador não faz

Ele não vê mídia, não guarda histórico e não persiste nada além do tempo de vida da Sessão.
O único dado sensível que ele observa são os IPs nos ICE candidates, o que é inerente ao WebRTC.

## Configuração

Use a classe de Durable Object com backend **SQLite** — é a única disponível no plano gratuito
do Workers, que dá 100.000 requisições e 13.000 GB-s por dia. Sobra com folga para sete pessoas.

O cliente é um WebSocket do processo principal do Electron, não um navegador. Isso funciona sem
ressalva, desde que a conexão seja `wss://`.

A URL do sinalizador é a única configuração do app, injetada em build time por variável de
ambiente. Um `wrangler dev` local precisa funcionar para os testes de mídia com múltiplas
instâncias (spec 0006).

## Pronto quando

- `wrangler dev` sobe o sinalizador e um cliente WebSocket consegue criar e entrar numa Sessão.
- O caminho de admissão está testado: entrar, o Anfitrião aprovar, e entrar e o Anfitrião recusar.
- Estourar o limite de `/sessao/create` devolve `429` em vez de criar um Durable Object.
- Anfitrião desconectando derruba a Sessão para todos.
- O oitavo Participante é recusado com `'sessao-full'`.
- Com o limite de gasto zerado na configuração, o sinalizador devolve só STUN e não emite
  credencial TURN nenhuma.
