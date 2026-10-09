# Contribuindo

Obrigado pelo interesse. O Telinha (`scrn-broadcast` no código) é pequeno de propósito: faz uma
coisa só, para grupos de até sete pessoas. Antes de escrever código, leia o que está abaixo.

## Antes de abrir um PR

- **Bug:** abra uma [issue](https://github.com/hmathsan/telinha/issues/new/choose) com o
  `main.log` e o diagnóstico exportado. Para problemas de segurança, siga o [SECURITY.md](SECURITY.md).
- **Funcionalidade nova:** abra uma issue antes, para conversar. Algumas coisas ficam de fora de
  propósito: chat, gravação, contas, mais de 7 pessoas e servidor de mídia. O porquê está nas
  [ADRs](docs/adr/).
- **Algo parece uma escolha estranha?** Procure nas [ADRs](docs/adr/) antes de "consertar". A
  borda amarela, a malha sem SFU e o Código sem identidade são escolhas deliberadas.

## Onde está o quê

- [CONTEXT.md](CONTEXT.md): o vocabulário. Sessão, Participante, Anfitrião, Transmissor,
  Espectador, Fonte, Som, Palco e os outros termos têm significado exato e viram identificadores.
  **Leia primeiro.**
- [docs/specs/](docs/specs/README.md): o que construir, spec por spec, com os critérios de pronto.
- [docs/adr/](docs/adr/): por que as coisas são como são.
- [AGENTS.md](AGENTS.md): as regras do projeto em uma página. Vale para pessoas também.

```
apps/desktop      Electron + React + Vite
apps/signaler     Cloudflare Worker + Durable Object
packages/protocol Mensagens, limites, máquina de estados da Sessão (Node puro)
```

## Rodando localmente

Requisitos: Windows 10 ou 11, Node 22.

```bash
npm ci
npm run build -w packages/protocol
```

Em um terminal, suba o sinalizador local (`ws://localhost:8787`, só STUN):

```bash
npm run dev -w apps/signaler
```

Em outro, o app:

```bash
cp apps/desktop/.env.example apps/desktop/.env
npm run dev -w apps/desktop
```

Para testar uma Sessão sozinho, abra duas instâncias do app. Para testar entre duas máquinas,
aponte o `MAIN_VITE_SIGNALER_URL` do `.env` para um sinalizador acessível pelas duas.

## Testes

```bash
npm run typecheck --workspaces --if-present
npm test --workspaces --if-present
```

O CI roda os mesmos comandos em todo PR. A malha de mídia só se valida rodando na máquina: o
[roteiro de testes manuais](docs/roteiro-de-testes-manuais-de-midia.md) diz o que conferir.

## Regras que se quebram por acidente

- **A lógica de Sessão fica fora do React.** Roster, admissão, Palco e handshake vivem em
  `packages/protocol`, sem importar Electron, React ou WebRTC
  ([ADR 0003](docs/adr/0003-monorepo-com-nucleo-sem-ui.md)).
- **Termos do domínio em português nos identificadores**, sem acento: `Sessao`, `Anfitriao`,
  `Palco`, `codigoDeSessao`. Tudo o mais em inglês: `connect`, `retry`, `encoder`.
- **Todo caminho que pode falhar em silêncio escreve no log**, no mesmo commit. Isso vale para
  fallback, degradação e recuperação. Use `logToMain` no renderer e `log` no processo principal.
- **Não mude a versão no `package.json`.** A versão mora na tag
  ([spec 0005](docs/specs/0005-empacotamento.md)).
- **Mudou um comportamento descrito no README?** Atualize o [README.md](README.md) e o
  [README.en.md](README.en.md) no mesmo PR.

## Licença

Contribuições entram sob a [AGPL-3.0](LICENSE), a mesma licença do projeto
([ADR 0009](docs/adr/0009-licenca-agpl-3.md)).
