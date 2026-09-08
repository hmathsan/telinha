# scrn-broadcast

Compartilhamento de tela P2P entre um pequeno grupo de amigos. Electron + TypeScript, Windows.

O app se apresenta como **Olhaí** para quem o usa; `scrn-broadcast` é o nome técnico, e é o único
que aparece no código. Veja a
[ADR 0008](./docs/adr/0008-nome-dividido-entre-repositorio-e-marca.md).

## Onde está o quê

- [CONTEXT.md](./CONTEXT.md) — o vocabulário. **Leia antes de escrever qualquer código.** Os
  termos Sessão, Participante, Anfitrião, Transmissor, Espectador, Fonte, Código de Sessão,
  Palco, Foco e Grade têm significado exato e aparecem como identificadores no código.
- [docs/specs/README.md](./docs/specs/README.md) — o que construir, spec por spec, com os
  critérios de pronto. É o ponto de entrada de qualquer tarefa de implementação.
- [docs/adr/](./docs/adr/) — por que as coisas são como são. Consulte antes de propor mudar
  arquitetura, e antes de "consertar" algo que pareça uma escolha estranha.

## Duas regras que se violam por acidente

**A lógica de Sessão fica fora do React.** Roster, admissão, ocupação do Palco e handshake vivem
em `packages/protocol`, em Node puro, sem importar Electron, React ou WebRTC. É isso que permite
testar a malha de sete Participantes sem sete pessoas e sem GPU
([ADR 0003](./docs/adr/0003-monorepo-com-nucleo-sem-ui.md)). Escrever essa lógica dentro de um
componente destrói a capacidade de teste do projeto inteiro.

**Termos do domínio em português nos identificadores**, sem acento: `Sessao`, `Anfitriao`,
`Transmissor`, `Espectador`, `Palco`, `Fonte`, `codigoDeSessao`. Tudo o mais em inglês:
`connect`, `retry`, `encoder`, `stats`.

## Ordem de construção

`packages/protocol` e `apps/signaler` primeiro: são testáveis sem Electron, sem GPU e sem rede
externa. A malha de mídia depende de fatos que só se confirmam rodando na máquina, e a spec 0003
diz quais validar antes de escrever o resto.
