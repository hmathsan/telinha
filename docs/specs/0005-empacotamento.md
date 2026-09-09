# 0005 — Empacotamento

Define como o app é construído, distribuído e atualizado. Windows apenas na v1.

## Build

`electron-vite` para desenvolvimento e build, `electron-builder` para empacotar. A URL do
sinalizador entra por variável de ambiente em build time.

## DevTools fora do app instalado

O app nunca chamou `openDevTools()`. Quem expõe o painel é o **menu padrão** do Electron, que traz
"Toggle Developer Tools" e o acelerador `Ctrl+Shift+I` mesmo com `autoHideMenuBar` — então fechar
essa porta é remover o menu (`Menu.setApplicationMenu(null)`), mais um `devtools-opened` que fecha
o painel se ele aparecer por outro caminho.

Isto é **acabamento, não segurança**: um app de release não tem menu de View. Não protege segredo
nenhum — a URL do sinalizador é pública ([ADR 0005](../adr/0005-repositorio-publico-por-causa-do-auto-update.md))
e o Código de Sessão é de quem já está na Sessão. Como não é fronteira de segurança, existe a
válvula `SCRN_BROADCAST_DEVTOOLS=1`, que reabre num app instalado e é o que permite depurar o
problema que só reproduz na máquina de outra pessoa.

Decidido em runtime por `app.isPackaged` — o mesmo sinal do auto-updater. Em build time, um
`electron-vite build` rodado sem a variável certa deixaria o DevTools escapar para dentro do
instalador.

A regra fica em `src/shared/hardening.ts`, testável sem abrir janela; `src/main/devTools.ts` só a
aplica. Lá também vive `SCRN_BROADCAST_DISABLE_HW_ACCEL`, que desliga encode e decode por vídeo
numa chave só, porque quem relata "a transmissão está ruim" não sabe de que lado da malha está o
problema.

## Distribuição

Instalador NSIS publicado em GitHub Releases, com `electron-updater` apontado para lá.

O repositório é público. Começou como restrição técnica — `electron-updater` contra um repositório
privado exige um token embutido no binário, que qualquer um extrai — e hoje é também intenção: o
app se destina a quem tem o mesmo problema, não só ao grupo que o originou. Veja a
[ADR 0005](../adr/0005-repositorio-publico-por-causa-do-auto-update.md) e a
[ADR 0009](../adr/0009-licenca-agpl-3.md).

## Versão

**A tag do git é a fonte da verdade da versão**, não o `package.json`. `apps/desktop/package.json`
fica em `0.0.0` para sempre: o script de release passa a versão da tag por
`--config.extraMetadata.version`, que reescreve o `package.json` **empacotado** — que é o que o
`electron-updater` lê.

O motivo é a `main` protegida. Se o `package.json` mandasse, toda release precisaria de um commit
de bump; com a `main` fechada, esse commit vira um PR de bump por release, ou um bypass da
proteção. Com a tag mandando, não há commit nenhum: uma versão existe se, e somente se, existe uma
tag.

O script consulta as tags antes de agir, então rodá-lo duas vezes não gera trabalho repetido nem
commit vazio.

## Atualização

Silenciosa em segundo plano, aplicada no próximo início. O objetivo é que todos os amigos
convirjam para a mesma versão sem ninguém pedir.

Mantenha a geração de blockmap do `electron-builder` ligada, para o `electron-updater` baixar
apenas o delta. O instalador fica na casa dos 100 MB — sem atualização diferencial, cada correção
de uma linha custa 100 MB de download para cada amigo, e a atualização silenciosa deixa de ser
silenciosa.

A rede de segurança é o handshake de versão da spec 0001: quando a convergência falha, o amigo
desatualizado recebe "Atualize o aplicativo para entrar nesta Sessão" em vez de um erro de
conexão sem explicação.

Suba `PROTOCOL_VERSION` sempre que uma mensagem mudar de forma incompatível. É a única coisa que
separa uma atualização tranquila de uma tarde depurando um problema que não é técnico.

## Pronto quando

- `npm run build` produz um instalador NSIS assinado ou não, mas instalável.
- O app instalado não abre DevTools por menu nem por atalho, e abre com `SCRN_BROADCAST_DEVTOOLS=1`.
- A versão do instalador vem da tag, com `apps/desktop/package.json` intocado em `0.0.0`.
- Uma versão instalada detecta e aplica uma release nova do GitHub.
- Dois apps com `PROTOCOL_VERSION` diferente se recusam com a mensagem correta.
