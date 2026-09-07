# 0005 — Empacotamento

Define como o app é construído, distribuído e atualizado. Windows apenas na v1.

## Build

`electron-vite` para desenvolvimento e build, `electron-builder` para empacotar. A URL do
sinalizador entra por variável de ambiente em build time.

## Distribuição

Instalador NSIS publicado em GitHub Releases, com `electron-updater` apontado para lá.

O repositório é público, e isso é uma restrição técnica e não uma preferência: `electron-updater`
contra um repositório privado exige um token embutido no binário, que qualquer um extrai. Veja a
[ADR 0005](../adr/0005-repositorio-publico-por-causa-do-auto-update.md).

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
- Uma versão instalada detecta e aplica uma release nova do GitHub.
- Dois apps com `PROTOCOL_VERSION` diferente se recusam com a mensagem correta.
