# apps/desktop

Electron + electron-vite + React. A malha de mídia é a spec
[0003](../../docs/specs/0003-malha-de-midia.md), a interface é a spec
[0004](../../docs/specs/0004-interface.md), o empacotamento (`electron-builder`,
`electron-updater`) é a spec [0005](../../docs/specs/0005-empacotamento.md), e o sistema visual
(Nocturne + Tailwind) é a spec [0007](../../docs/specs/0007-sistema-visual.md).

- `src/main` — processo principal: flags do WGC, o `setDisplayMediaRequestHandler` que abre a
  grade de Fontes própria, o cliente WebSocket de sinalização (spec 0002: "o cliente é um
  WebSocket do processo principal, não um navegador") e a exportação de diagnóstico.
- `src/preload` — bridge de contexto único para a janela principal e para a grade de Fontes.
- `src/renderer` — React: telas de entrada/Sessão e a malha WebRTC (`src/renderer/src/media`).
  `src/renderer/src/styles` guarda o sistema visual: os tokens e componentes do Nocturne, o Inter
  vendorizado em `.woff2` (a CSP `default-src 'self'` bloqueia o Google Fonts) e a folha que
  apelida os tokens para o Tailwind. `components/icons` traz os traçados do Phosphor inline.
- `src/shared` — lógica pura, testável em Node sem Electron/DOM/WebRTC: backoff de reconexão,
  detecção de relay, amostragem de diagnóstico, política de reconexão por ICE, teto de bitrate,
  validação do payload de sinalização da malha, e o reducer que espelha o estado da Sessão do
  lado do app (spec 0002: "os apps mantêm uma cópia para renderizar a UI"). `npm test` roda só
  isto — a malha de WebRTC de verdade é validação manual (spec 0006).

Depende de `@pvt-broadcast/protocol` para as mensagens e a máquina de estados da Sessão — a
lógica de roster/admissão/Palco não é reimplementada aqui (ver
[ADR 0003](../../docs/adr/0003-monorepo-com-nucleo-sem-ui.md)).

## Rodando

```
cp .env.example .env   # opcional; sem isso usa ws://localhost:8787
npm run dev             # nesta pasta, ou "npm run dev -w @pvt-broadcast/desktop" na raiz
```

Precisa de um sinalizador rodando (`npm run dev` em `apps/signaler`, que sobe `wrangler dev` em
`localhost:8787` por padrão).

## Empacotando e publicando (spec 0005)

```
npm run build    # electron-vite build + electron-builder: gera o instalador NSIS em release/,
                  # sem publicar nada (--publish never)
npm run release   # o mesmo build, mas publica em GitHub Releases (--publish always).
                  # Precisa de GH_TOKEN com permissão de escrita no repositório.
```

`electron-builder.yml` aponta o `publish` para `hmathsan/scrn-broadcast` — o repositório é
público por causa do auto-update (ver [ADR 0005](../../docs/adr/0005-repositorio-publico-por-causa-do-auto-update.md)).
O blockmap (`*.exe.blockmap`) sai junto do instalador; é o que permite ao `electron-updater`
baixar só o delta em vez dos ~100 MB inteiros a cada atualização.

O app checa por atualização silenciosamente ao iniciar (`src/main/autoUpdater.ts`), só fora de
`npm run dev` (não existe `app-update.yml` num build de desenvolvimento). A atualização baixada
é aplicada no próximo início do app, sem diálogo.

## Pontos que dependem de confirmação na máquina

A spec 0003 lista fatos que só se confirmam rodando de verdade — ver "Pronto quando" em
[0003-malha-de-midia.md](../../docs/specs/0003-malha-de-midia.md). Este código implementa o que
a spec pede; não substitui essa validação.

Para forçar a queda para encoder por software (`encoderImplementation` virando `OpenH264`) e
testar o aviso do indicador de qualidade: `--disable-accelerated-video-encode` é uma flag do
Chromium, e nem o npm nem o `electron-vite dev` a repassam para o processo do Electron que
lançam. Use a variável de ambiente:

```
PVT_BROADCAST_DISABLE_HW_ENCODE=1 npm run dev -w @pvt-broadcast/desktop
```

No PowerShell:

```
$env:PVT_BROADCAST_DISABLE_HW_ENCODE = '1'; npm run dev -w @pvt-broadcast/desktop
```
