# apps/desktop

Ainda não implementado nesta sessão — só o andaime (`package.json`, `tsconfig.json`, estrutura de
pastas). Implementação em sessões futuras, guiada pelas specs
[0003](../../docs/specs/0003-malha-de-midia.md), [0004](../../docs/specs/0004-interface.md) e
[0005](../../docs/specs/0005-empacotamento.md), e pela [ADR 0001](../../docs/adr/0001-electron-em-vez-de-go-no-cliente.md)
(Electron + electron-vite + electron-builder).

- `src/main` — processo principal do Electron.
- `src/preload` — bridge de contexto entre `main` e `renderer`.
- `src/renderer` — React (UI, Palco, indicador de qualidade).

Depende de `@pvt-broadcast/protocol` para as mensagens e a máquina de estados da Sessão — a
lógica de roster/admissão/Palco não deve ser reimplementada aqui (ver
[ADR 0003](../../docs/adr/0003-monorepo-com-nucleo-sem-ui.md)).
