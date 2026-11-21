# 0015 — Desempenho de GPU, diagnóstico e estabilidade da Sessão

Reúne quatro melhorias nascidas da análise do `main.log` real de Sessões jogando (`God of War III`,
`Deadlock`, `ZenlessZoneZero`, `007 First Light`) e da revisão da malha de mídia:

1. **Parar a tempestade de `video-surface-reattached`** quando o Telinha está minimizado/oculto
   atrás de um jogo ou capturando quadros estáticos com `AllowWgcZeroHz`.
2. **Reduzir a carga de GPU (encode, decode e composição)** enquanto se joga — tanto no
   Transmissor quanto no Espectador.
3. **Ampliar diagnóstico e logs de mídia** (`decoderImplementation`, tempo médio de encode/decode,
   resolução/fps reais da captura, status de GPU no boot) para que futuros `main.log` mostrem o
   gargalo real em qualquer máquina.
4. **Heartbeat no sinalizador** para impedir que conexões WebSocket ociosas morram em silêncio após
   20–30 minutos e quebrem a Retomada com `not-resumable`.

Nenhuma das quatro partes muda mensagens do protocolo de sinalização (`packages/protocol`):
**`PROTOCOL_VERSION` permanece em 2**, com compatibilidade total com clientes `1.0.0`.

---

## Parte 1 — Vigia de `<video>` sem falsos positivos (`videoSurfaces.ts`, `videoRecovery.ts`)

### O defeito visto no `main.log`

Em Sessões reais, `video-surface-reattached` disparou dezenas de vezes seguidas (tentativas 1, 2 e
3 simultâneas em todos os `<video>`, inclusive na prévia local do próprio Transmissor). A causa:
`videoSurfaces.ts` só ignorava elementos desconectados ou sem caixa (`getClientRects().length === 0`),
mas quando a janela está minimizada ou ocluída por um jogo em tela cheia, `isConnected` e
`getClientRects()` continuam positivos enquanto o Chromium suspende `requestVideoFrameCallback`.
O vigia interpretava isso como quadro congelado e resetava `srcObject = null; srcObject = stream;
play()` três vezes seguidas — derrubando e recriando o pipeline de decode/composição no meio do
jogo. Na prévia local, `AllowWgcZeroHz` também pausa entrega de quadros em telas estáticas,
disparando o mesmo falso positivo.

### Correção

Em `shared/media/videoRecovery.ts`:

- `VideoSurfaceHealth` ganha `documentHidden: boolean` e `isLocal: boolean`.
- `STALE_FRAME_MS` sobe de `1000` para `2500` ms.
- `shouldReattachVideo` devolve `false` quando `documentHidden === true` ou `isLocal === true`.

Em `renderer/src/media/videoSurfaces.ts`:

- `useVideoSurfaces` recebe `localId: string | null` (ou marca cada entrada com `isLocal`) e não
  roda o vigia na prévia local.
- Enquanto `document.hidden === true`, o vigia renova `lastFrameAt = now` e não tenta reanexar.
- Ao receber `visibilitychange` voltando a visível, renova `lastFrameAt = performance.now()` e zera
  `attempts` de todas as superfícies, evitando disparo imediato na volta do Alt+Tab.

Os testes em `videoRecovery.test.ts` cobrem `documentHidden: true`, `isLocal: true` e o novo teto
de `STALE_FRAME_MS`.

---

## Parte 2 — Reduzir carga de GPU ao jogar

### 2.1 Limites rígidos de captura e parâmetros de envio

Em `renderer/src/media/capture.ts`:

- `VIDEO` passa a definir teto explícito além de `ideal`, evitando que monitores 1440p/4K ou
  144 Hz+ sejam capturados/convertidos acima do alvo da malha (720p30):
  ```ts
  const VIDEO: MediaTrackConstraints = {
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 30, max: 30 },
  };
  ```
- Define `videoTrack.contentHint = "motion"` (o padrão de captura de tela no Chromium favorece
  nitidez de texto estático em vez de fluidez de movimento).
- Logo após capturar, loga `video-capture-started` (info) com `videoTrack.getSettings()`
  (`width`, `height`, `frameRate`, `resizeMode`), para que o `main.log` sempre registre o que o WGC
  realmente entregou.

Em `shared/media/bitrate.ts` e `renderer/src/media/meshManager.ts`:

- `MAX_FRAMERATE = 30`.
- `buildEncodingParameters` passa a aceitar `maxFramerate` opcional (definido só no vídeo, não no
  áudio) e `active` opcional (`active?: boolean`).
- No transceiver de vídeo do Transmissor, `params.degradationPreference = "maintain-framerate"` é
  aplicado junto com `encodings`.

### 2.2 Ocultar/pausar a prévia local do Transmissor

Enquanto transmite, quem joga não precisa do compositor GPU do Chromium pintando uma cópia 30 fps
do próprio jogo no Telinha (especialmente em segundo monitor, onde o swapchain D3D11/ANGLE disputa
o DWM com o jogo no monitor principal).

- Botão discreto na `TopBar` (visível só enquanto `isTransmitting`): **Ocultar prévia** /
  **Mostrar prévia** (`aria-pressed`), com ícones `IconEye` / `IconEyeSlash`.
- Quando oculta:
  - o `localStream` deixa de ser montado em `streamsById` (o `<video>` da prévia local é liberado
    por completo — zero composição GPU local);
  - se o Transmissor for o único no Palco, o Palco mostra um estado limpo e silencioso
    ("Você está transmitindo — prévia oculta para economizar GPU", com botão "Mostrar prévia");
  - se houver outro Transmissor, o Palco mostra só o outro Transmissor em destaque;
  - não altera a transmissão: `localStream` continua indo normalmente pela malha.
- **Pausa automática quando a janela fica oculta (`document.hidden`):** mesmo com a prévia ligada,
  enquanto o Telinha estiver minimizado/oculto, o `<video>` local é pausado (`pause()`) e retomado
  ao voltar à tela.

### 2.3 Pausar vídeo sob demanda e ao minimizar (`video-pause` na malha)

Quando um Espectador minimiza o Telinha ou ativa "Pausar vídeo" (por exemplo, jogando com o Telinha
no segundo monitor enquanto só quer ouvir ou ficar na Sessão), manter o vídeo ativo desperdiça
**decode na GPU do Espectador** e **uma sessão inteira de encode + conversão D3D11 + banda no
Transmissor**.

#### Mensagem `video-pause` (`shared/media/meshSignal.ts`)

Novo variante no `meshSignalPayloadSchema` (payload opaco ao sinalizador, **sem subir
`PROTOCOL_VERSION`**, mesmo padrão de `som-state` e `recovery-request`):

```ts
z.object({
  kind: z.literal("video-pause"),
  transmissorId: z.string(),
  espectadorId: z.string(),
  paused: z.boolean(),
}),
```

- **Sentido:** Espectador → Transmissor.
- **Validação (`parseMeshSignal`):** só aceita quando `payload.espectadorId === fromParticipanteId`.
- **Efeito no Transmissor (`MeshManager`):**
  - guarda `remoteVideoPaused: boolean` na `ManagedConnection` de saída;
  - atualiza o sender de vídeo via `sender.setParameters` com `encodings[0].active = !paused` (sem
    renegociar e sem afetar o Som);
  - se `createOutgoingConnection` ou `recreate` criar uma perna nova para um Espectador, começa
    com `active: true`, e o Espectador reenvia `video-pause` quando receber a oferta caso ainda
    esteja pausado;
  - loga `mesh-video-pause-applied` (info, `{ key, paused }`).
- **Efeito no Espectador:**
  - quando pausado (manualmente ou por janela minimizada/oculta), envia `video-pause { paused: true }`
    para todos os Transmissores ativos; ao voltar, envia `{ paused: false }`;
  - o Som continua funcionando normalmente caso esteja audível;
  - no modo manual ("Pausar vídeo" na `TopBar`, visível quando há pelo menos um Transmissor remoto),
    o Palco exibe um aviso leve indicando que o vídeo remoto está pausado para economizar GPU, com
    botão para retomar.
  - **Debounce de minimização (`HIDE_PAUSE_DELAY_MS = 2000`):** só envia `paused: true` depois de
    2 s contínuos em `document.hidden === true`, para que Alt+Tabs rápidos não fiquem ligando e
    desligando o encoder. A volta (`paused: false`) é imediata.
  - **Watchdog de mídia (`MeshManager.pollDiagnostics`):** enquanto uma perna de Espectador estiver
    intencionalmente em `videoPaused`, o watchdog `isMediaStalled` não dispara recuperação por
    `inboundBitrateBps === 0`.
- **Compatibilidade com `1.0.0`:** um Transmissor `1.0.0` descarta `video-pause` (loga
  `mesh-signal-rejected`) e segue funcionando; um Espectador `1.0.0` nunca envia `video-pause`.

---

## Parte 3 — Diagnóstico de GPU e logs mais ricos

### Boot (`main/log.ts`)

O evento `boot` passa a incluir `gpuFeatureStatus` (apenas os campos relevantes de
`app.getGPUFeatureStatus()`: `video_encode`, `video_decode`, `gpu_compositing`), coletado após
`app.whenReady()` em um evento `gpu-feature-status` (info) — porque `app.getGPUFeatureStatus()` só
é confiável depois que o processo de GPU inicializou.

### Amostragem (`shared/media/diagnostics.ts`, `shared/media/webrtcStatsLike.ts`)

`ConnectionDiagnosticsSnapshot` ganha:

- `decoderImplementation: string | null` (de `inbound-rtp` de vídeo);
- `powerEfficientEncoder: boolean | null` (de `outbound-rtp` de vídeo);
- `powerEfficientDecoder: boolean | null` (de `inbound-rtp` de vídeo);
- `avgEncodeTimeMs: number | null` (calculado por delta de `totalEncodeTime` / delta de
  `framesEncoded` × 1000);
- `avgDecodeTimeMs: number | null` (calculado por delta de `totalDecodeTime` / delta de
  `framesDecoded` × 1000).

Em `DiagnosticsPanel.tsx`:

- a coluna **Encoder** passa a mostrar `Encoder / Decoder` (conforme o papel da perna) e, no
  tooltip ou coluna auxiliar, `avgEncodeTimeMs` / `avgDecodeTimeMs`.
- o `.json` exportado já inclui todos os campos novos automaticamente.

### Log de resumo de mídia (`MeshManager`)

Para que o `main.log` registre o codec/aceleração sem inundar o arquivo a cada 2 s:

- por conexão, loga `mesh-media-codec` (info) na **primeira** vez que `encoderImplementation` (no
  Transmissor) ou `decoderImplementation` (no Espectador) aparecer não-nulo, e novamente só se o
  valor mudar — com `{ key, role, encoderImplementation, decoderImplementation, powerEfficientEncoder,
  powerEfficientDecoder, frameWidth, frameHeight, framesPerSecond, qualityLimitationReason }`.

---

## Parte 4 — Heartbeat no sinalizador (correção do `not-resumable`)

### O defeito visto no `main.log`

Em três Sessões reais (`2026-10-11 21:32`, `2026-10-13 23:47`, `2026-10-18 03:06`), após 25–33
minutos sem nenhuma mensagem de sinalização (mídia fluindo direto via P2P), o WebSocket morreu em
silêncio (NAT / borda da Cloudflare). O cliente só percebeu quando o ICE precisou mandar
`restart-ice`, recebeu `code: 1006` e tentou `resume` achando que tinha caído 600 ms antes — mas o
Durable Object já havia encerrado o Participante ou a Sessão minutos antes, respondendo
`resume-refused { reason: 'not-resumable' }`.

### Correção

**Sinalizador (`apps/signaler/src/durableObject.ts`):**

- No construtor de `SessaoDurableObject`, registrar a resposta automática da Hibernation API da
  Cloudflare:
  ```ts
  this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  ```
- Isso responde `"pong"` a toda mensagem de texto `"ping"` direto na borda **sem acordar o Durable
  Object da hibernação** e sem consumir escrita de storage.

**Cliente (`apps/desktop/src/main/signalingClient.ts`):**

- Constantes (exportadas em `shared/heartbeat.ts` ou no próprio cliente):
  - `HEARTBEAT_INTERVAL_MS = 25_000` (envia `"ping"` a cada 25 s enquanto o socket está aberto);
  - `HEARTBEAT_TIMEOUT_MS = 10_000` (se nenhum `"pong"` ou outra mensagem chegar em 10 s após o
    `"ping"`, considera o socket morto).
- Ao receber `"pong"`, cancela o timeout pendente e retorna sem passar pelo parser Zod de mensagens
  JSON (evitando falsos `signaling-message-not-json`).
- Se o timeout expirar: loga `signaling-heartbeat-timeout` (warn, `{ kind }`) e chama
  `ws.terminate()`, disparando a Retomada imediatamente (~35 s no pior caso, bem dentro dos 60 s de
  `RETOMADA_TIMEOUT_MS`).
- O timer é limpo em `close`, `leave()` e `discardCurrentSocket()`.
- **Compatibilidade:** um sinalizador antigo que ainda não tenha `setWebSocketAutoResponse` ignora
  `"ping"` (falha no `JSON.parse` e retorna) — mas como o sinalizador tem CD na tag `v1.1.0`, ele
  sobe junto com a release antes de qualquer cliente receber o instalador `1.1.0`.

---

## Log

| Evento | Onde | Nível | Campos |
| --- | --- | --- | --- |
| `gpu-feature-status` | principal | info | `video_encode`, `video_decode`, `gpu_compositing` |
| `video-capture-started` | renderer | info | `width`, `height`, `frameRate`, `resizeMode` |
| `mesh-media-codec` | renderer | info | `key`, `role`, `encoderImplementation`, `decoderImplementation`, `powerEfficientEncoder`, `powerEfficientDecoder`, `frameWidth`, `frameHeight`, `framesPerSecond`, `qualityLimitationReason` |
| `mesh-video-pause-sent` | renderer | info | `paused`, `reason` (`hidden` \| `manual`), `transmissores` |
| `mesh-video-pause-applied` | renderer | info | `key`, `paused` |
| `signaling-heartbeat-timeout` | principal | warn | `kind` |

## Roteiro manual

1. **Sem tempestade de `video-surface-reattached`.** Transmita um jogo em janela por 15 minutos
   alternando Alt+Tab e minimizando o Telinha. Confira no `main.log` que `video-surface-reattached`
   não dispara enquanto a janela está oculta nem para a prévia local.
2. **Prévia oculta.** Transmitindo, clique em **Ocultar prévia**. A transmissão continua normal
   para o Espectador, e a prévia some do Palco local. Clique em **Mostrar prévia** e ela volta.
3. **Pausa de vídeo ao minimizar e manual.** Com um Transmissor e um Espectador, minimize o Telinha
   do Espectador por >3 s (ou clique em **Pausar vídeo**). No Diagnóstico do Transmissor, o bitrate
   de vídeo para esse Espectador cai a ~0 Mbps (enquanto o Som continua, se ativo). Restaurar a
   janela retoma o vídeo em ~1 s.
4. **Limites de captura e logs.** Transmita num monitor >720p (>60 Hz) e verifique no `main.log`
   `gpu-feature-status`, `video-capture-started` (≤1280×720, ≤30 fps) e `mesh-media-codec` com
   `encoderImplementation` e `decoderImplementation`.
5. **Sessão longa sem queda.** Mantenha uma Sessão de 2 pessoas por >40 minutos sem trocar
   mensagens de controle; force um `restart-ice` ou desconecte a rede brevemente. O WebSocket
   permanece vivo pelo heartbeat e a Retomada completa sem `not-resumable`.

## Pronto quando

- `npm test` passa com os testes novos de `videoRecovery`, `bitrate`, `meshSignal`, `diagnostics` e
  heartbeat/sinalizador.
- `npm run typecheck` passa em todos os workspaces.
- `PROTOCOL_VERSION` continua em `2`.
- Os casos 1 a 5 do roteiro passam.
