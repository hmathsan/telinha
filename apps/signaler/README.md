# apps/signaler

Cloudflare Worker + Durable Object por Sessão. Implementado conforme a
[spec 0002](../../docs/specs/0002-sinalizador.md).

## Estrutura

- `src/index.ts` — o Worker. Só roteia: `/sessao/create` gera um `codigoDeSessao` novo,
  `/sessao/join?codigoDeSessao=XXXXXX` usa o código informado. Em ambos, escolhe o Durable
  Object pelo `codigoDeSessao` (`idFromName`) e repassa o WebSocket.
- `src/durableObject.ts` — `SessaoDurableObject`. Roda a máquina de estados de
  `@pvt-broadcast/protocol`. Não guarda o `SessaoState` inteiro num campo: cada mensagem o
  reconstrói a partir do `serializeAttachment` de cada conexão viva (hibernação preserva
  WebSockets aceitos e seus attachments, mas não campos de instância). Um alarme de 60s destrói
  o objeto quando a Sessão fica sem ninguém.
- `src/turn.ts` — o desligador de gasto do TURN ([ADR 0007](../../docs/adr/0007-desligador-proprio-para-o-turn.md)):
  consulta o egresso acumulado do mês e devolve só STUN acima do limite configurado.

## Rodando localmente

```
npm run dev
```

Sobe `wrangler dev` em `http://127.0.0.1:8787`. Sem `TURN_KEY_ID`/`TURN_TOKEN`/`CF_ACCOUNT_ID`/
`CF_ANALYTICS_TOKEN` configurados (via `wrangler secret put` em produção, ou um `.dev.vars` local
não versionado), o sinalizador devolve só STUN — suficiente para os testes de admissão e para a
malha de mídia local (spec 0006).

## Testes

```
npm test
```

Usa `@cloudflare/vitest-pool-workers`: os testes rodam dentro do runtime real do Workers
(`workerd`), conectando WebSockets de verdade ao Worker exportado, sem precisar de `wrangler dev`
nem de rede externa.
