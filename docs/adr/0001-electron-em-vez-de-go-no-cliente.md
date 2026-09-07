# Electron em vez de Go, no cliente e no sinalizador

O projeto nasceu com a intenção de ser Go + WebRTC com GUI em Wails, mas as três alternativas
em Go esbarram em trabalho nativo não orçado: `pion/mediadevices` só captura o monitor inteiro
via GDI BitBlt no Windows (não existe captura por janela), não há binding Go utilizável para
Windows.Graphics.Capture, e o `getDisplayMedia` do WebView2 entrega o seletor da Microsoft em
vez de um seletor próprio — além de um bug aberto de ~5 FPS ao capturar janela única.
Escolhemos Electron porque o `desktopCapturer` resolve de uma vez a enumeração de janelas com
miniaturas, a captura por janela, o encode por hardware e a pilha WebRTC completa.

Go entrou no projeto como aposta de performance. Com o Electron assumindo a captura, o encode e
o transporte, essa aposta deixou de existir, e manter Go só no sinalizador seria uma segunda
linguagem pagando por um WebSocket de ~150 linhas. **O projeto é TypeScript de ponta a ponta.**

## Consequências

- O binário e o consumo de RAM deixam de ser "leves" no sentido de um app Go. A aposta explícita
  é que o custo fique na ordem do que o Discord já custa na máquina do usuário.
- Linux e macOS ficam para a v3, mas o Electron os entrega quase de graça quando chegarmos lá —
  ao contrário do Wails, onde o Linux tem WebRTC desligado por padrão e o macOS não tem o
  callback de display-capture.
- O áudio por aplicação (v2) exige código nativo que o Chromium não oferece. Sem Go, o caminho
  passa a ser um addon nativo N-API. Isso não invalida a decisão, mas move o custo para a v2 em
  vez de eliminá-lo.
