# Especificações

Este projeto é desenvolvido a partir destas specs. Elas dizem **o que construir**; os
[ADRs](../adr/) dizem **por quê**, e o [CONTEXT.md](../../CONTEXT.md) define o vocabulário.

Leia o `CONTEXT.md` antes de qualquer spec. Os termos **Sessão, Participante, Anfitrião,
Transmissor, Espectador, Fonte, Código de Sessão, Palco** têm significado exato e são usados
como identificadores no código.

## Specs

- [0001 — Protocolo](./0001-protocolo.md): mensagens entre app e sinalizador, handshake de
  versão, máquina de estados da Sessão. Leia antes de tocar em `packages/protocol` ou em
  qualquer coisa que troque mensagens.
- [0002 — Sinalizador](./0002-sinalizador.md): o Cloudflare Worker e o Durable Object.
- [0003 — Malha de mídia](./0003-malha-de-midia.md): captura, encode, conexões WebRTC,
  bitrate adaptativo, reconexão. **Contém pontos provisórios — veja o aviso na spec.**
- [0004 — Interface](./0004-interface.md): telas, Palco, indicador de qualidade.
- [0005 — Empacotamento](./0005-empacotamento.md): build, instalador, auto-update.
- [0006 — Testes](./0006-testes.md): como validar a malha sem sete pessoas.
- [0007 — Sistema visual](./0007-sistema-visual.md): tokens do Nocturne, Tailwind, tipografia,
  estados. A fundação que a 0008 monta em cima.
- [0008 — Telas](./0008-telas.md): Entrada, Sessão, seletor de Fonte e diagnóstico redesenhados.
  O comportamento continua sendo o da 0004.

## Invariantes

Valem em todas as specs.

**Limites como constantes.** `MAX_PARTICIPANTES = 7` e `MAX_TRANSMISSORES = 2` vivem em
`packages/protocol/src/limits.ts` e são importados de lá. Não são metas de performance: são
o contrato da [ADR 0002](../adr/0002-malha-p2p-sem-sfu.md).

**Idioma dos identificadores.** Termos do domínio em português, sem acento: `Sessao`,
`Anfitriao`, `Transmissor`, `Espectador`, `Palco`, `Fonte`, `codigoDeSessao`. Tudo o mais em
inglês (`connect`, `retry`, `encoder`, `stats`). Inverter essa regra é uma edição desta linha
e uma renomeação mecânica.

**O núcleo da Sessão roda em Node puro.** A lógica de roster, admissão, ocupação do Palco e
handshake vive em `packages/protocol` e importa zero de Electron, React ou WebRTC. É o que
torna a [ADR 0003](../adr/0003-monorepo-com-nucleo-sem-ui.md) executável.

**TypeScript estrito.** `strict: true`, sem `any` implícito. As mensagens do protocolo são
validadas em runtime na fronteira (Zod), porque o outro lado da conexão é um binário que
você não controla.

## Estrutura do monorepo

```
apps/desktop      Electron + React + Vite
apps/signaler     Cloudflare Worker + Durable Object
packages/protocol Mensagens, limites, máquina de estados da Sessão
```
