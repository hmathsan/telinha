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

Uma escada, em `shared/media/reconnectionPolicy.ts`, aplicada por conexão. Cada degrau custa mais
que o anterior, e o relógio de cada perna zera quando ela volta a `connected`:

| Gatilho | Ação |
| --- | --- |
| `disconnected` há menos de `DISCONNECTED_GRACE_MS` (6 s) | esperar |
| `disconnected` passado o período de graça, ou `failed` | `iceRestart`, até `MAX_RESTART_ATTEMPTS` (2) |
| Tentativas esgotadas | refazer a `RTCPeerConnection` do zero |
| `inboundBitrateBps === 0` por `STALLED_MEDIA_MS` (8 s) com o ICE em `connected` | entra na mesma escada |
| O app fechou | reentrada completa com o Código de Sessão |

`RECOVERY_COOLDOWN_MS` (10 s) é o piso entre duas ações na mesma perna, valendo também para as
pedidas pelo par. A escalada é avaliada no mesmo poll de 2 s do diagnóstico: `disconnected` que
precisa envelhecer não tem evento que o anuncie, e um timer por conexão seria um relógio a mais
para manter.

**A camada 3 é a Retomada ([spec 0011](./0011-retomada.md)).** Cair com o app aberto — Wi-Fi,
queda do sinalizador, reinício do Durable Object — volta à Sessão como a mesma pessoa, sem pedido de
entrada, se for dentro de 60 s; a malha não é refeita, e a escada acima cuida de cada perna. Fechar
o app continua exigindo reentrada manual, com o Código de Sessão e a aprovação do Anfitrião: fechar
o app é Sair.

### Por que a escada, e não só `failed`

A versão anterior desta seção mandava esperar em `disconnected` porque "resolve sozinho na maioria
das vezes", e agir só em `failed`. O log da Sessão de 09/09/2026 refuta as duas metades: uma perna
entrou em `disconnected` às 02:10:27, ficou lá com o vídeo congelado até a pessoa sair na mão às
02:14:29, e **em nenhum momento do arquivo inteiro existe um `failed`**. A camada 2 nunca rodou uma
vez sequer em produção. Esperar por `failed` é esperar por um evento que o Chromium não emite
quando o caminho `srflx↔srflx` morre por remapeamento de NAT depois de dezenas de minutos.

O degrau de refazer a `RTCPeerConnection` existe porque o deploy é STUN-only: sem relay para onde
cair, re-gatherar candidatos `srflx` novos é o único recurso que resta.

### O Espectador pede, o Transmissor oferta

Cada sentido da malha é uma `RTCPeerConnection` própria, com detecção própria — o diagnóstico
daquela mesma noite mostra as pernas de saída de um Transmissor em `connected` a 1,7 Mbps e a
perna de entrada dele em `disconnected` no mesmo instante. Quem percebe a quebra costuma ser o
Espectador, e só o Transmissor pode ofertar.

Por isso o payload de `signal` tem um `kind: "recovery-request"` com `mode: "ice-restart" |
"recreate"` — o único que anda no sentido contrário. É payload da malha, opaco para o sinalizador,
então **não sobe `PROTOCOL_VERSION`**: um cliente antigo que o receba loga `mesh-signal-rejected` e
não faz nada, que é exatamente o comportamento de hoje. Subir a versão trocaria "não recupera" por
"não consegue entrar".

No `recreate`, quem oferta derruba a `RTCPeerConnection` e refaz na hora. Quem assiste **não**
fecha a sua: marca a perna e pede, e a troca acontece quando a oferta nova chega. Fechar antes
deixaria a miniatura sumida para sempre se o Transmissor não respondesse — sem entrada no mapa não
sobra ninguém para insistir no pedido, e um cliente antigo (que ignora `recovery-request`) é
exatamente esse caso.

## Diagnóstico

Colete `RTCPeerConnection.getStats()` periodicamente por conexão. Os mesmos dados alimentam o
indicador de qualidade da UI e o botão "exportar diagnóstico", que gera um arquivo com o
histórico da conexão para o amigo mandar no Discord. Sem telemetria remota.

Os campos que importam: bitrate de saída e entrada, `packetsLost`, `framesPerSecond`, o par de
candidatos ICE vencedor, e principalmente **`encoderImplementation` e `qualityLimitationReason`**.

Cada linha carrega também `msUnhealthy` e `restartAttempts` — há quanto tempo aquela perna está
quebrada e quantos degraus da escada já subiu. Sem eles, responder isso durante uma ocorrência
exigia cruzar o .json exportado com o `main.log` linha a linha, que foi exatamente o trabalho que
o defeito de 09/09/2026 deu.

### Log local

O diagnóstico exportado é um retrato do agora, e some com o app. Ao lado dele existe um log em
arquivo (`electron-log`, em `userData/logs/main.log`, com rotação): quedas de WebSocket com código
e motivo, transições de `iceconnectionstate`, cada degrau da escada de reconexão
(`mesh-ice-recovery`, com o gatilho `ice`/`media`/`peer`), falhas de SDP, erros não tratados dos
dois processos e a queda do encoder para software. Continua valendo "sem telemetria remota" — o arquivo é local, e
quem o manda para alguém é a pessoa.

Ele existe porque a primeira Sessão que terminou sozinha num teste com várias pessoas foi
impossível de diagnosticar: o app engolia o erro do WebSocket, o do SDP e o do encoder sem escrever
nada em lugar nenhum.

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
