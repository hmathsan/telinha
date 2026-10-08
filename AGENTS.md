# scrn-broadcast

Compartilhamento de tela P2P entre um pequeno grupo de amigos. Electron + TypeScript, Windows.

O app se apresenta como **Telinha** para quem o usa; `scrn-broadcast` é o nome técnico, e é o único
que aparece no código. Veja a
[ADR 0008](./docs/adr/0008-nome-dividido-entre-repositorio-e-marca.md).

## Onde está o quê

- [CONTEXT.md](./CONTEXT.md) — o vocabulário. **Leia antes de escrever qualquer código.** Os
  termos Sessão, Participante, Anfitrião, Transmissor, Espectador, Fonte, Som, Código de
  Sessão, Palco, Foco e Grade têm significado exato e aparecem como identificadores no código.
- [docs/specs/README.md](./docs/specs/README.md) — o que construir, spec por spec, com os
  critérios de pronto. É o ponto de entrada de qualquer tarefa de implementação.
- [docs/adr/](./docs/adr/) — por que as coisas são como são. Consulte antes de propor mudar
  arquitetura, e antes de "consertar" algo que pareça uma escolha estranha.
- [README.md](./README.md) — o que o usuário final lê. Se um comportamento descrito lá mudar, ele
  muda junto, e o `README.en.md` é tradução integral dele.

## Três regras que se violam por acidente

**A lógica de Sessão fica fora do React.** Roster, admissão, ocupação do Palco e handshake vivem
em `packages/protocol`, em Node puro, sem importar Electron, React ou WebRTC. É isso que permite
testar a malha de sete Participantes sem sete pessoas e sem GPU
([ADR 0003](./docs/adr/0003-monorepo-com-nucleo-sem-ui.md)). Escrever essa lógica dentro de um
componente destrói a capacidade de teste do projeto inteiro.

**Termos do domínio em português nos identificadores**, sem acento: `Sessao`, `Anfitriao`,
`Transmissor`, `Espectador`, `Palco`, `Fonte`, `codigoDeSessao`. Tudo o mais em inglês:
`connect`, `retry`, `encoder`, `stats`.

**O log nasce no mesmo commit que o caminho que pode falhar em silêncio.** Fallback, degradação,
recuperação, API não documentada, qualquer decisão que muda o que chega ao outro lado: cada uma
escreve um evento no log local — `logToMain(nível, "evento-em-kebab-case", { campos })` no renderer,
`log` no principal — com campos que respondem o quê, onde e por quê sem cruzar com outro arquivo.
A malha saiu sem isso, e as primeiras quedas reais foram impossíveis de diagnosticar (spec 0003,
"Log local").

## Como isto sai para o mundo

**O sinalizador tem CD; o desktop não.** A tag `vX.Y.Z` dispara
`.github/workflows/deploy-signaler.yml`, que publica o Worker. O instalador sai da máquina de quem
mantém o projeto, por `npm run release -- X.Y.Z` (`scripts/release.mjs`), e o `electron-builder`
cria a release do GitHub como rascunho, para ser publicada no botão.

**A versão mora na tag, não no `package.json`.** `apps/desktop/package.json` fica em `0.0.0` para
sempre; a versão entra no pacote por `--config.extraMetadata.version`. Não bumpe versão em PR — o
script recusa se alguém tiver bumpado. O porquê está na spec
[0005](./docs/specs/0005-empacotamento.md), seção "Versão".

O CI (`.github/workflows/ci.yml`) roda typecheck e testes em PR e em push na `main`; o
empacotamento do desktop é um workflow separado, filtrado por `paths`, porque a release local não
exercita o `electron-builder` até a hora de publicar.

## Ordem de construção

`packages/protocol` e `apps/signaler` primeiro: são testáveis sem Electron, sem GPU e sem rede
externa. A malha de mídia depende de fatos que só se confirmam rodando na máquina, e a spec 0003
diz quais validar antes de escrever o resto.
