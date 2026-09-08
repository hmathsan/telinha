# Nome dividido entre repositório e marca

O projeto carregava três nomes ao mesmo tempo: `pvt-broadcast` no código e no diretório local,
`scrn-broadcast` no repositório, e `Palco` no mock que veio do Claude Design. Três nomes é um a
mais do que dá para sustentar, e nenhum dos três servia sozinho.

`Palco` está descartado por um motivo que não é estético: **é um termo do glossário**. O
[CONTEXT.md](../../CONTEXT.md) define Palco como a área principal da janela, e ele aparece como
identificador em `palcoSelection.ts`, `selectPalco` e `onReleasePalco`. Com o app chamado Palco,
toda frase de spec com "o Palco" passa a ter duas leituras, e desfazer isso exigiria renomear a
área — que é o lado com a melhor metáfora e o maior custo.

Sobrou a escolha entre unificar tudo sob uma marca ou manter dois nomes com papéis distintos.
Ficamos com dois:

- **`scrn-broadcast`** é o nome técnico: repositório, pacotes npm, `appId`, worker do sinalizador,
  identificadores. Casa com o repositório que já existe.
- **Olhaí** é a marca: aparece na tela de Entrada, no `<title>` e no atalho instalado.

## Por que não unificar

Porque os dois nomes têm prazos de validade diferentes. O nome técnico precisa congelar **agora**:
o [ADR 0005](./0005-repositorio-publico-por-causa-do-auto-update.md) põe o auto-update em GitHub
Releases, e o feed do `electron-updater` é `owner/repo`. Enquanto não há release publicada, trocar
`appId` e nome de repositório é grátis; depois da primeira, cada cliente instalado fica apontando
para um feed que não existe mais.

A marca é o contrário: ela ainda vai ser testada em gente de verdade, e trocá-la é barato
justamente porque ela vive em dois lugares. Amarrar os identificadores a um nome que ainda pode
mudar seria pagar o custo do rename duas vezes.

## Consequências

- `appId: com.scrnbroadcast.desktop` e `productName: Olhai` — sem acento, porque caminho de
  instalação NSIS com acento é fonte de problema; o "Olhaí" acentuado fica na interface.
- Quem lê o código encontra `scrn-broadcast` e não encontra "Olhaí" em lugar nenhum além da
  camada de apresentação. É de propósito.
- Se um dia a marca virar também o nome do repositório, isso é **outra** decisão, e ela custa o
  feed de auto-update de todo mundo que já instalou. Não é um detalhe de renomeação.
- `Palco` continua significando só a área principal da janela.
