# 0003 — Malha de mídia

Define como a tela sai da máquina do Transmissor e chega na dos Espectadores.

## Fatos confirmados (setembro de 2026)

**Encode:** o Chromium mantém um encoder por `RTCPeerConnection`. São 6 encodes de 720p30 na
máquina do Transmissor, e isso não tem como desligar. Cabe no teto atual do NVENC (12 sessões
desde o driver 591.44). Veja a [ADR 0002](../adr/0002-malha-p2p-sem-sfu.md).

**Captura de janela:** não é resolvida por padrão, e a correção traz a borda amarela do Windows
junto. Veja a seção Captura abaixo.

**IPs:** o Chromium ofusca IPs de LAN como candidatos mDNS `.local` **apenas enquanto a página
não tem permissão de câmera, microfone ou tela**. Este app tem. Portanto **cada Participante
aprende o IP de LAN e o IP público de todos os outros**, e isso é inerente ao desenho, não um
descuido. A única alavanca seria forçar relay, o que mata o P2P.

## Captura

O Transmissor escolhe uma Fonte — um monitor inteiro ou a janela de uma aplicação.

`desktopCapturer.getSources()` roda **só no processo principal** e enumera monitores e janelas
com miniaturas. O renderer chama `getDisplayMedia()`, o principal atende em
`session.setDisplayMediaRequestHandler`, mostra o seletor próprio (a grade estilo Discord) e
responde com a Fonte escolhida. É esse handler que substitui o seletor da Microsoft.

Alvo: 720p30. É teto, não piso.

### A captura de janela precisa de WGC

Por padrão, o Chromium captura janela por GDI (`PrintWindow`/`BitBlt`), que **entrega quadro
preto ou congelado quando a janela está ocluída ou compostas por GPU** — ou seja, exatamente no
caso de um jogo. Windows.Graphics.Capture resolve, porque pede o conteúdo ao DWM, mas está atrás
de flags do Chromium:

```
app.commandLine.appendSwitch('enable-features',
  'AllowWgcDesktopCapturer,AllowWgcWindowCapturer,AllowWgcScreenCapturer,AllowWgcZeroHz')
```

antes de `app.whenReady()`. **Confirme empiricamente se já vêm ligadas na sua versão do Electron**
capturando uma janela ocluída — a pesquisa não conseguiu determinar isso na fonte do M152.

WGC traz junto a **borda amarela** do Windows, e ela não sai: o capturador do Chromium nunca
consulta a propriedade que a desliga. Não é questão de empacotamento nem de permissão — veja a
[ADR 0006](../adr/0006-a-borda-amarela-fica.md), que também explica por que a linha MSIX está
encerrada.

**Primeiro teste do projeto:** compartilhe uma janela e confirme se a borda aparece **para o
Espectador** ou só na tela de quem transmite. Se for só local, não há problema a resolver.

Janela minimizada não pode ser capturada de forma confiável em nenhum dos caminhos.

## Topologia

Malha: cada Transmissor abre uma `RTCPeerConnection` por Espectador e adiciona o mesmo
`MediaStreamTrack` a todas. Sem SFU — veja a [ADR 0002](../adr/0002-malha-p2p-sem-sfu.md).

Até `MAX_TRANSMISSORES` fluxos simultâneos, até `MAX_PARTICIPANTES` na Sessão.

## TURN

O ICE resolve a maioria dos pares direto; uma minoria precisa de relay. Use o STUN gratuito da
Cloudflare mais o Realtime TURN, com credenciais de vida curta emitidas pelo sinalizador. O
controle de gasto vive lá também — veja a
[ADR 0007](../adr/0007-desligador-proprio-para-o-turn.md).

### Avisar quem está sendo retransmitido

O caminho correto no `getStats()` passa pelo `transport`, não por varredura de pares:

```ts
const stats = await pc.getStats();
let pair;
for (const s of stats.values()) {
  if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId);
}
// Só se o motor não expuser selectedCandidatePairId:
if (!pair) for (const s of stats.values())
  if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s;

const local = stats.get(pair.localCandidateId);
const souEuRetransmitido = local.candidateType === 'relay' && local.relayProtocol !== undefined;
```

`relayProtocol` e `url` existem **apenas em candidatos locais**, então a presença deles confirma
que o relay é deste Participante e não do outro lado. Leia as estatísticas só depois de
`connectionState === 'connected'`, e releia após um ICE restart.

**A mensagem certa é "sua rede exige um servidor de retransmissão", não "você está em CGNAT".**
Nada no `getStats()` distingue CGNAT de NAT simétrico, firewall corporativo ou UDP bloqueado — o
prefixo 100.64.0.0/10 fica no roteador do provedor e nunca aparece nos candidatos. Alegar CGNAT
seria um diagnóstico que o app não tem como fazer.

## Bitrate adaptativo

A qualidade oscila sob congestionamento e isso é o comportamento correto. Configure o teto com
`RTCRtpSender.setParameters({ encodings: [{ maxBitrate }] })` e deixe o controle de congestionamento
do Chromium trabalhar.

A UI precisa comunicar a oscilação (spec 0004). Sem isso, congestionamento é indistinguível de
defeito, durante o desenvolvimento e depois.

## Reconexão

Três camadas com custos diferentes:

- **`iceconnectionstate` vai a `disconnected`**: espere. Resolve sozinho na maioria das vezes.
- **Vai a `failed`**: chame `pc.restartIce()` e renegocie pelo sinalizador. O cliente WebSocket
  precisa da própria reconexão com backoff para isso funcionar.
- **O app fechou**: reentrada completa com o Código de Sessão. Não construa recuperação de
  sessão — o roster reconhecendo "quem voltou" custa mais do que colar seis caracteres.

## Diagnóstico

Colete `RTCPeerConnection.getStats()` periodicamente por conexão. Os mesmos dados alimentam o
indicador de qualidade da UI e o botão "exportar diagnóstico", que gera um arquivo com o
histórico da conexão para o amigo mandar no Discord. Sem telemetria remota.

Os campos que importam: bitrate de saída e entrada, `packetsLost`, `framesPerSecond`, o par de
candidatos ICE vencedor, e principalmente **`encoderImplementation` e `qualityLimitationReason`**.

### Log local

O diagnóstico exportado é um retrato do agora, e some com o app. Ao lado dele existe um log em
arquivo (`electron-log`, em `userData/logs/main.log`, com rotação): quedas de WebSocket com código
e motivo, transições de `iceconnectionstate`, falhas de SDP, erros não tratados dos dois processos
e a queda do encoder para software. Continua valendo "sem telemetria remota" — o arquivo é local, e
quem o manda para alguém é a pessoa.

Ele existe porque a primeira Sessão que terminou sozinha num teste com várias pessoas foi
impossível de diagnosticar: o app engolia o erro do WebSocket, o do SDP e o do encoder sem escrever
nada em lugar nenhum.

**Pendência conhecida.** O Anfitrião não reconecta: qualquer queda no caminho `create` encerra a
Sessão para todos (`signalingClient.ts`, e o comentário lá explica por quê — reconectar trocaria o
Código de Sessão de todo mundo sem aviso). É a explicação mais provável para uma Sessão que termina
sozinha. A decisão de mudar isso espera o log do próximo teste, porque preservar identidade através
da queda exige que o Durable Object conheça mais do que os sockets vivos.

Esses dois últimos não são opcionais. Quando o teto de sessões do encoder de hardware estoura —
num amigo de driver antigo, ou porque ele deixou o OBS aberto — o Chromium cai para OpenH264 por
software **sem lançar erro e sem emitir evento**. `encoderImplementation` mudando para `OpenH264`
é o único aviso que existe, e `qualityLimitationReason` distingue `cpu` de `bandwidth`.

## Pronto quando

- Dois apps na mesma máquina, contra um `wrangler dev` local, trocam tela.
- A captura de janela única sustenta 30 FPS medidos por `getStats()`, com a janela ocluída.
- `encoderImplementation` mostra encoder de hardware com 6 conexões abertas — ou o resultado
  contrário está registrado e a [ADR 0002](../adr/0002-malha-p2p-sem-sfu.md) foi revista.
- O indicador de qualidade acusa a queda para software quando ela é forçada com
  `--disable-accelerated-video-encode`.
- Derrubar a rede de um Espectador e restaurá-la reconecta sem colar o código de novo.
