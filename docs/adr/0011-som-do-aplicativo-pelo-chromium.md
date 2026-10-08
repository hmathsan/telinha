# O Som do aplicativo vem do Chromium, por uma string não documentada

Quando a Fonte é uma janela, o handler de `setDisplayMediaRequestHandler` responde
`{ video: source, audio: "applicationLoopback:<pid>" }`, com o PID do processo dono da janela. O
Electron repassa a string sem validar, e o serviço de áudio do Chromium 152 a entende: é o mesmo
caminho que o seletor do Chrome usa ao compartilhar uma janela, sobre a Process Loopback API do
Windows com a árvore de processos incluída. Quando a Fonte é um monitor, o renderer pede
`restrictOwnAudio: true` e o handler responde `"loopback"`, que o Electron traduz para o sistema
inteiro menos o próprio app.

Escolhemos isso porque o áudio entra no WebRTC pelo próprio Chromium: sincronia com o vídeo,
buffer e relógio ficam com quem já os resolve, sem PCM atravessando IPC. O preço é depender de um
valor que a documentação do Electron não lista.

O PID sai do HWND em `source.id` (`window:<HWND>:0`) por `GetWindowThreadProcessId`, chamado via
`koffi`.

## Considerado e rejeitado

- **Addon `loopback-capture` entregando PCM a um `MediaStreamTrackGenerator`**: API documentada,
  mas o áudio sai do processo principal, cruza IPC e chega ao renderer com a deriva de relógio por
  nossa conta — 10–30 ms a mais e sincronia pior. É binário nativo de um mantenedor só, num app que
  se atualiza sozinho. Não ganha nada no Windows 10: usa a mesma API. **É o plano B** se a string
  deixar de funcionar.
- **PowerShell para achar o PID**: sem dependência nativa, mas ~1 s por Transmitir, sujeito a
  bloqueio de antivírus e restrito a janelas principais.

## Consequências

- **Cada troca de versão do Electron pode quebrar o Som sem erro.** O roteiro de testes manuais de
  mídia ganha o caso de Som por janela e por monitor, e ele roda a cada bump.
- **Windows 11 é o suporte oficial.** O Chromium só liga as duas capturas a partir do build 22000.
  No Windows 10 a Fonte vai sem Som, a menos que o teste manual mostre que elas funcionam lá — o
  Som nunca inclui o próprio app, e o `restrictOwnAudio` é descartado em silêncio no Windows 10.
- **Som que vem de fora da árvore do processo não é capturado.** Apps da Loja, cuja janela pertence
  ao `ApplicationFrameHost.exe`, provavelmente entregam silêncio — e captura bem-sucedida em silêncio
  é indistinguível de um app calado. Aceito na v1.

## O que o log precisa mostrar

Este caminho falha de formas que não lançam exceção, então nasce com log:

- `som-capture-requested` — tipo da Fonte, modo pedido (`applicationLoopback`/`loopback`), PID
  resolvido, nome da janela, build do Windows.
- `som-capture-started` — `track.getSettings()` inteiro (canais, taxa, e se `echoCancellation`,
  `noiseSuppression` e `autoGainControl` ficaram de fato desligados).
- `som-capture-unavailable` — o motivo (`windows-10`, `pid-not-found`, `capture-failed`) e a
  mensagem de erro, quando houver.
- `som-capture-silent` — `audioLevel` do `media-source` em zero por tempo prolongado durante a
  transmissão, com o PID. Não vira aviso na tela, porque silêncio pode ser legítimo; é o que
  permite distinguir "o jogo estava mudo" de "a string parou de funcionar" ou do caso da Loja.

## Validação pendente

Tudo acima vem da leitura do código do Electron 44.2.0 e do Chromium 152.0.7977.76, não de
execução. Antes de construir interface: `applicationLoopback:<pid>`, `restrictOwnAudio` e
`loopbackWithoutChrome` no Windows 11 e no Windows 10 22H2, e um app da Loja. Se o resultado
contrariar esta ADR, ela é revista antes do resto.

Em 08/10/2026, com a spec 0009 implementada, nada disto rodou ainda — só a assinatura de
`GetWindowThreadProcessId` pelo `koffi` foi conferida em execução. O que falta e por quê está no TODO
do [roteiro](../roteiro-de-testes-manuais-de-midia.md). O Windows 10 saiu do suporte e não vai ser
medido: abaixo do build 22000 a Fonte vai sem Som, e a válvula `SCRN_BROADCAST_FORCE_SOM` fica para
quem quiser retomar a medição.
