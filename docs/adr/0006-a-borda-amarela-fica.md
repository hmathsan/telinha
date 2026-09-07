# A borda amarela do Windows fica

Capturar a janela de uma aplicação exige Windows.Graphics.Capture — o caminho GDI padrão do
Chromium entrega quadro preto quando a janela está ocluída ou é composta por GPU, que é
exatamente o caso de um jogo. O WGC traz junto a borda amarela que o Windows desenha em volta do
que está sendo capturado, e ela não sai.

## Por que não sai

O motivo não é o que parece à primeira vista, e isso importa porque a pista falsa custa dias.

`GraphicsCaptureSession.IsBorderRequired = false` é acessível a apps não empacotados: o OBS é
Win32 puro distribuído por NSIS e desliga a borda. A capacidade `graphicsCaptureWithoutBorder`
é de uso geral (`uap11:Capability`), não restrita — não exige Store, nem aprovação da Microsoft.

**O bloqueio é o Chromium.** O `wgc_capture_session.cc` do WebRTC nunca consulta a interface
`IGraphicsCaptureSession3`, que é onde a propriedade vive; não há uma referência a borda no
arquivo. O Electron não aplica patch algum ali. Não existe caminho a partir de JavaScript,
nem de configuração, nem de manifesto.

As únicas saídas seriam um addon nativo fazendo a própria captura WGC e alimentando o WebRTC por
fora, ou um fork do Chromium. Ambas custam mais do que a borda incomoda.

## Antes de gastar esforço nisso

Verifique se a borda **chega ao Espectador**. Há relato do fórum do OBS de que ela é sobreposição
local, visível só na tela de quem compartilha. Se isso valer para o caminho WGC do Chromium, não
há problema a resolver. O teste é de cinco minutos e vem antes de qualquer alternativa.

## Consequência para o empacotamento

Isto encerra a linha de investigação MSIX/APPX. Ela não removeria a borda, e custaria o
`electron-updater`, que não suporta APPX — a atualização passaria a ser da Store ou de um
`.appinstaller`. A [ADR 0005](./0005-repositorio-publico-por-causa-do-auto-update.md) continua
válida sem ressalva.
