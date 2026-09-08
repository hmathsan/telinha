# apps/desktop

Electron + electron-vite + React. Implementa a spec 0003 (malha de mídia) nesta sessão; a UI é
o mínimo necessário para exercitá-la — a interface completa é a spec
[0004](../../docs/specs/0004-interface.md), e o empacotamento é a spec
[0005](../../docs/specs/0005-empacotamento.md).

- `src/main` — processo principal: flags do WGC, o `setDisplayMediaRequestHandler` que abre a
  grade de Fontes própria, o cliente WebSocket de sinalização (spec 0002: "o cliente é um
  WebSocket do processo principal, não um navegador") e a exportação de diagnóstico.
- `src/preload` — bridge de contexto único para a janela principal e para a grade de Fontes.
- `src/renderer` — React: telas de entrada/Sessão e a malha WebRTC (`src/renderer/src/media`).
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

## Pontos que dependem de confirmação na máquina

A spec 0003 lista fatos que só se confirmam rodando de verdade — ver "Pronto quando" em
[0003-malha-de-midia.md](../../docs/specs/0003-malha-de-midia.md). Este código implementa o que
a spec pede; não substitui essa validação.
