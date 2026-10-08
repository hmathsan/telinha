# Roteiro de testes manuais de mídia

Valida a malha de mídia (spec 0003) e as telas de Palco (spec 0004) com múltiplas instâncias do
app na mesma máquina, contra um sinalizador local — como descrito na
[spec 0006](./specs/0006-testes.md).

**Advertência:** rodar muitas instâncias na sua máquina concentra todos os encodes numa GPU só,
o que pode ser justamente o limite investigado na spec 0003. Trate um resultado ruim (FPS baixo,
queda pra software antes da hora) como possível artefato do teste até confirmar com máquinas
separadas.

## Preparação

1. Suba o sinalizador local:

   ```bash
   cd apps/signaler && npm run dev
   ```

   Fica em `ws://localhost:8787` — é o padrão que o app já usa quando `MAIN_VITE_SIGNALER_URL`
   não está definido (`apps/desktop/src/main/index.ts`).

2. Empacote o desktop uma vez:

   ```bash
   cd apps/desktop && npm run build
   ```

3. Cada instância precisa do seu próprio perfil, senão as janelas competem pelo mesmo
   `localStorage` (nome salvo) e pela mesma sessão do Chromium. Abra uma instância por
   Participante assim, variando `--user-data-dir`:

   ```bash
   npx electron out/main/index.js --user-data-dir=/tmp/scrn-broadcast-p1
   npx electron out/main/index.js --user-data-dir=/tmp/scrn-broadcast-p2
   ```

   Repita para quantos Participantes o passo pedir. Dê nomes diferentes em cada instância na
   tela de Entrada (Ana, Bruno, Carlos, ...) para não se perder entre janelas.

## 1. Captura

**Monitor inteiro.** Numa instância, "Criar Sessão", depois "Transmitir" escolhendo um monitor
inteiro. Numa segunda instância, entre com o Código de Sessão, seja aprovado, e confirme que a
tela do monitor aparece no Palco.

**Janela de aplicação — o primeiro teste do projeto.** Transmita a janela de um app qualquer
(não o próprio scrn-broadcast). Observe a borda amarela do Windows:

- **O que observar:** a borda aparece só na tela de quem transmite, ou também na do Espectador?
  Se for só local, não há nada a corrigir (ver [ADR 0006](./adr/0006-a-borda-amarela-fica.md)).
  Se aparecer também do lado do Espectador, é uma regressão a investigar.

**Janela ocluída.** Com a mesma janela sendo transmitida, sobreponha outra janela por cima dela
(ou minimize e restaure, mas não deixe minimizada — captura de janela minimizada não é
suportada). Depois clique de volta nela para trazê-la à frente.

- **O que observar:** o Espectador continua vendo quadros atualizados enquanto a janela está
  atrás de outra, ou o Palco congela / fica preto? Se WGC estiver ativo
  (`apps/desktop/src/main/wgcFlags.ts`), deve continuar atualizando.

## 2. Encode

**FPS sustentado com janela ocluída.** Ainda com a janela ocluída do passo anterior, abra o
painel de diagnóstico (clique no indicador de qualidade) do lado do Espectador e observe a
coluna FPS por 15–20 segundos.

- **O que observar:** os quadros por segundo ficam perto de 30 de forma sustentada, não só em
  picos isolados.

**Encoder de hardware sob carga.** Suba a malha até 7 Participantes (o máximo,
`MAX_PARTICIPANTES`) com 2 Transmissores simultâneos (o máximo, `MAX_TRANSMISSORES`) — isso
gera até 6 `RTCPeerConnection` de saída na máquina de cada Transmissor. No painel de
diagnóstico de cada Transmissor, olhe a coluna Encoder.

- **O que observar:** `encoderImplementation` mostra um encoder de hardware (não `OpenH264`) em
  todas as conexões. Se cair para software sem você ter forçado isso, anote — é o limite da spec
  0003 se manifestando, e pode ser artefato de rodar tudo numa GPU só (ver advertência acima).

**Queda forçada para software.** Fixe uma instância Transmissora com a variável de ambiente:

```bash
SCRN_BROADCAST_DISABLE_HW_ACCEL=1 npx electron out/main/index.js --user-data-dir=/tmp/scrn-broadcast-p1
```

Transmita a partir dela.

- **O que observar:** o indicador de qualidade do Espectador (ou o painel expandido) acusa a
  mudança — `encoderImplementation` muda para `OpenH264` e o indicador sai do estado normal
  (verde) para o de alerta (âmbar), já que é exatamente esse aviso silencioso que a spec 0003
  exige capturar.

## 3. Exibição / Palco

**Ponta a ponta.** Criar Sessão numa instância, entrar de outra, aprovar a entrada, transmitir e
assistir — confirme que os quatro passos funcionam em sequência sem travar em nenhum.

**Dois Transmissores e troca de Palco.** Com dois Transmissores simultâneos, confirme que o
primeiro ocupa o Palco e o segundo aparece como miniatura. Clique na miniatura.

- **O que observar:** a miniatura assume o Palco e o que estava no Palco vira miniatura. Duplo
  clique no Palco deve entrar em tela cheia.

**Começar a transmitir com outro Transmissor no ar.** É o caso que já escapou três vezes, e escapa
porque exige olhar a tela de quem *começa*, não a de quem assiste. Com A transmitindo, na tela de
**B**: transmitir. Repita com o modo preferido de B em Foco e em Grade.

- **O que observar:** a Fonte de A continua com imagem em movimento **no instante em que o layout
  muda** para acomodar a Fonte de B. Um quadro preto aqui é o defeito.

**Parar de transmitir com outro Transmissor no ar.** O mesmo defeito pelo outro lado. Com A e B
transmitindo, faça as duas variantes na tela de **A**, e depois repita as duas em Grade:

1. A clica na Fonte de B para promovê-la ao Palco (A vira miniatura) e então para de transmitir.
2. A deixa a própria Fonte no Palco, com B como miniatura, e então para de transmitir.

- **O que observar:** a Fonte de B continua com imagem em movimento na tela de A, nas quatro
  combinações. Repita a variante 1 uma vez com A parando pela barra nativa do Chromium em vez do
  botão do app.
- **Se falhar:** o `main.log` traz `video-surface-reattached` com o `msSinceLastFrame`. Ele
  aparecendo significa que o elemento parou de receber quadros e o vigia
  (`shared/media/videoRecovery.ts`) tentou consertar — o defeito voltou por um caminho que não é o
  remonte, que foi a causa das vezes anteriores. Ele faltando, com a tela preta do mesmo jeito,
  significa que os quadros estão chegando e o que falha é a pintura.

**Terceiro pedido de transmissão.** Com as duas vagas de Transmissor ocupadas, tente transmitir
de uma terceira instância admitida.

- **O que observar:** o botão de transmitir aparece desabilitado mostrando "2/2 transmitindo",
  sem fila e sem erro.

**Indicador de qualidade sob banda reduzida.** Durante uma transmissão, throttle a rede de um
Espectador (ferramentas do sistema operacional, ou um limitador de banda) o suficiente para
provocar congestionamento.

- **O que observar:** o indicador de qualidade sai do estado normal (ponto verde) para o de
  alerta (ponto âmbar), refletindo a queda induzida — sem que isso pareça um defeito para quem
  está olhando.

## 4. Reconexão

Estes passos **precisam de duas máquinas**. O defeito de 09/09/2026 (perna congelada em
`disconnected` por quatro minutos) não reproduz com instâncias na mesma máquina: o loopback não
tem NAT para remapear, e é o remapeamento que mata o caminho `srflx↔srflx`.

**Espectador cai e volta.** Com uma Sessão em andamento, derrube a rede de um Espectador (Wi-Fi
off, ou desconecte o cabo) por ~15 segundos e restaure.

- **O que observar:** a conexão se recupera sozinha sem que ninguém precise colar o Código de
  Sessão de novo. No `main.log` do Espectador: `mesh-ice-state … disconnected, action: 'wait'`,
  seguido em 6–8 s de `mesh-ice-recovery { action: 'restart-ice', trigger: 'ice' }`, e a volta a
  `connected`. No log do Transmissor, o pedido chegando e a oferta saindo.
- **Se falhar:** um `wait` sem nenhum `mesh-ice-recovery` atrás dele é o defeito de 09/09/2026
  de volta — a escada parou de escalar.

**Transporte quebrado com a sinalização de pé.** É a variante fiel ao defeito original, e a que o
teste anterior não cobre: a queda de Wi-Fi derruba o WebSocket junto. Bloqueie só o UDP de saída
da máquina do Espectador por ~30 segundos (regra de saída no firewall do Windows), deixando o
WebSocket em TCP/443 intacto.

- **O que observar:** ninguém sai da Sessão (o roster não muda, não aparece `signaling-close`), e
  ainda assim a escada sobe: `restart-ice` primeiro e, se o bloqueio continuar, `action:
  'recreate'` depois de duas tentativas, seguido de uma perna nova conectando quando o bloqueio
  sai.

**Mídia parada com o ICE conectado.** Suspenda o processo do Transmissor por ~15 segundos
(Process Explorer, botão direito → Suspend) e retome.

- **O que observar:** `mesh-ice-recovery { trigger: 'media' }` no log do Espectador. É a metade do
  congelamento que o ICE não enxerga — o `iceConnectionState` fica em `connected` o tempo todo.

**Sem falso positivo ao parar de transmitir.** Com A e B transmitindo, A para pelo botão do app,
normalmente.

- **O que observar:** nenhum `mesh-ice-recovery` no log de ninguém. A perna do Espectador tem que
  fechar por `transmissores-changed`, não pelo watchdog. Se aparecer, o watchdog está recriando
  conexões que iam morrer de qualquer jeito.

**Sessão longa.** Deixe uma Sessão de duas máquinas transmitindo por ~40 minutos — a duração em
que o defeito original apareceu. Ao final, exporte o diagnóstico.

- **O que observar:** a coluna Recuperação. Tudo em `—` significa que nada quebrou; um número de
  tentativas com a conexão em `connected` é a prova de que a escada trabalhou sem ninguém notar.
  Uma perna com `msUnhealthy` crescendo e o vídeo congelado é o defeito ainda vivo.

**Anfitrião sai.** Encerre a instância do Anfitrião (feche a janela).

- **O que observar:** a Sessão termina para todo mundo — as demais instâncias voltam para a tela
  de Entrada ou mostram que a Sessão acabou, não ficam penduradas esperando.

## 5. Som

Valida a [spec 0009](./specs/0009-som.md) e a [ADR 0011](./adr/0011-som-do-aplicativo-pelo-chromium.md).
Roda a cada troca de versão do Electron: o Som depende de um valor não documentado e quebra sem
erro. Todos os eventos citados estão no `main.log` (Diagnóstico → "Abrir pasta de logs"); os do
renderer aparecem com o prefixo `[renderer]`.

**Portão.** Os casos 3 e 7 são registrados na ADR 0011 — o 6 ficou parado com o Windows 10 —,
trocando "Validação pendente" pelo que foi observado e quando. Se contrariarem a ADR, ela é
revista antes de a spec 0010 começar.

**1. Janela com Som (Windows 11).** Transmita a janela de um player tocando áudio enquanto outro app
toca outra coisa ao mesmo tempo.

- **O que observar:** o Espectador ouve só a janela transmitida. No log do Transmissor,
  `som-capture-requested { mode: 'applicationLoopback' }` com `pid` não nulo, seguido de
  `som-capture-started` com `echoCancellation`, `noiseSuppression` e `autoGainControl` em `false`
  nas `settings`.
- **Se falhar:** `som-capture-unavailable { reason: 'capture-failed' }` com a mensagem é o Chromium
  recusando a string `applicationLoopback:<pid>`. `reason: 'pid-not-found'` com
  `window-process-lookup-failed` antes é o `koffi`. `som-processing-not-disabled` é qualidade, não
  invariante: a track segue, mas o som sai destruído. O outro app vazando é a árvore de processos
  errada — anote o `pid` e confira no Gerenciador de Tarefas.

**2. Estéreo.** Transmita a janela de um vídeo de teste de canal esquerdo e direito e ouça de fone no
Espectador.

- **O que observar:** o esquerdo sai só no ouvido esquerdo, e o direito só no direito.
- **Se falhar:** saindo nos dois ouvidos, o encoder ficou mono. Confirme que os dois lados estão na
  versão nova (um Espectador antigo não aplica o `withOpusStereo` e recebe mono) e que a resposta
  dele leva `stereo=1` no `a=fmtp` do Opus (`shared/media/opusStereo.ts`).

**3. Monitor sem o próprio Telinha. Duas máquinas.** Pendente — veja o TODO no fim. Na mesma
máquina não serve: a instância B é outro processo, e o som dela entra legitimamente no Som do
sistema de A. A e B transmitem monitor, e A põe B no Palco, de modo que o Som de B toca na máquina
de A.

- **O que observar:** B não ouve o próprio Som voltando pela transmissão de A. No log de A,
  `som-capture-requested { mode: 'loopback' }` e `som-capture-started` com `restrictOwnAudio: true`
  nas `settings`.
- **Se falhar:** o eco em B com `restrictOwnAudio: true` é o Chromium remixando outro `WebContents`
  — confira se `disable-features=RestrictOwnAudioAddChromiumBack` ainda é anexada
  (`main/somFlags.ts`). `som-capture-unavailable { reason: 'own-audio-not-excluded' }` significa que
  a defesa funcionou, e a Fonte foi sem Som.

**4. Janela do próprio Telinha.** Numa instância, transmita a janela dela mesma.

- **O que observar:** vai sem Som, com `som-capture-requested { reason: 'own-app' }` e
  `som-capture-unavailable { reason: 'own-app' }`. O Espectador não recebe track de áudio (a coluna
  Som kbps fica em `—`).
- **Se falhar:** `mode: 'applicationLoopback'` com o `pid` igual ao do próprio processo é a regra de
  `decideSomCapture` quebrada. A janela de **outra** instância leva Som, e isso é correto: é outro
  processo.

**5. Windows 10, sem válvula.** _Parado: o Windows 10 saiu do suporte (TODO no fim)._ Transmita uma
janela e um monitor numa máquina com Windows 10.

- **O que observar:** as duas Fontes vão sem Som, com `som-capture-requested { reason: 'windows-10' }`
  e `windowsBuild` abaixo de 22000. Nenhuma track de áudio chega ao Espectador.
- **Se falhar:** `windowsBuild: 0` é `os.release()` ilegível. Uma track de áudio aqui viola a
  invariante: o Chromium do Windows 10 descarta o `restrictOwnAudio` em silêncio.

**6. Windows 10, com `SCRN_BROADCAST_FORCE_SOM=1`.** _Parado, pelo mesmo motivo do caso 5._ Repita 1
e 3 com a válvula:

```powershell
$env:SCRN_BROADCAST_FORCE_SOM = '1'; npx electron out/main/index.js --user-data-dir=$env:TEMP\scrn-broadcast-p1
```

- **O que observar e registrar na ADR 0011:** se há Som; se o Discord ou outro app vaza na janela; e
  se o som do Telinha vaza no monitor. O log mostra `forced: true`, e o monitor pede
  `mode: 'loopbackWithoutChrome'`.
- **Se falhar:** não é falha, é o dado. Se as capturas funcionarem sem vazamento, a mudança é
  `MIN_WINDOWS_BUILD_FOR_SOM` e a ADR 0011; a válvula continua como está.

**7. App da Loja.** Transmita a janela de um app da Microsoft Store tocando áudio por mais de um
minuto.

- **O que observar e registrar na ADR 0011:** se chega Som ou silêncio ao Espectador, e se
  `som-capture-silent { silentForMs }` aparece no log do Transmissor depois de 60 s.
- **Se falhar:** silêncio sem `som-capture-silent` significa que o `media-source` não reporta
  `audioLevel` (coluna Som kbps baixa e constante) — o rastreador nunca vê nível nenhum.

**8. Palco.** Com dois Transmissores tocando Sons diferentes, num Espectador:

- **O que observar:**
  - no Foco, só se ouve quem está no Palco;
  - promover a miniatura troca o Som;
  - na Grade, ouvem-se os dois;
  - a própria Fonte de quem transmite nunca toca na máquina dele, nem no Palco nem na Grade.
- **Se falhar:** `som-playback-blocked { id }` é o autoplay recusando áudio. Sem ele, a regra está em
  `shared/somSelection.ts`, e quem a aplica é o efeito da `SessaoScreen`.

**9. Versão antiga.** Um Espectador com o instalador anterior entra numa Sessão em que um Transmissor
na versão nova transmite com Som.

- **O que observar:** ele vê a Fonte, não quebra e não ouve.
- **Se falhar:** `mesh-signal-failed` no log do Transmissor ou do Espectador antigo é a oferta com
  áudio sendo recusada. A Fonte sumindo quando o Som acaba é o `ended` da track de áudio encerrando a
  Fonte no cliente antigo.

**10. Custo.** Com 6 Espectadores, abra o diagnóstico do Transmissor.

- **O que observar:** a coluna Som kbps fica perto de 128 em cada conexão. Anote a CPU do processo do
  Transmissor no Gerenciador de Tarefas com e sem Som (transmitir a janela de um app mudo conta como
  "sem"). A ADR 0002 contabiliza +0,77 Mbps; se a CPU passar de 10% de um núcleo, anote na ADR 0011.
- **Se falhar:** Som kbps muito acima de 128 é o teto de `MAX_SOM_BITRATE_BPS` não aplicado. Um
  `mesh-ice-recovery { trigger: 'media' }` com Som e vídeo fluindo é regressão: o watchdog deveria
  olhar só o vídeo.

**11. Empacotado.** No app instalado, transmita uma janela de outro app.

- **O que observar:** `som-capture-requested` traz `pid` não nulo. Isso prova que o `koffi` carregou
  de dentro do asar.
- **Se falhar:** `window-process-lookup-failed { message }` antes dele. Acrescente
  `asarUnpack: ["**/node_modules/koffi/**"]` ao `electron-builder.yml` (e, se a mensagem citar o
  pacote da plataforma, também `**/node_modules/@koromix/**`).

## TODO — validações pendentes

O que ainda não foi observado em máquina nenhuma, para quem tiver o cenário rodar e riscar daqui.

**Precisam de duas máquinas.** Uma instância por máquina, não duas na mesma: o loopback não tem NAT
para remapear, e o processo vizinho entra legitimamente no Som do sistema.

- [ ] Toda a seção **4. Reconexão** — já marcada lá.
- [ ] **5. Som, caso 3 (Monitor sem o próprio Telinha).** É o caso que prova a invariante do Som para
  monitores: B não pode ouvir o próprio Som voltando pela transmissão de A. Faz parte do **portão**
  da [spec 0009](./specs/0009-som.md) e vai para a
  [ADR 0011](./adr/0011-som-do-aplicativo-pelo-chromium.md).
- [ ] **5. Som, caso 9 (Versão antiga)** e **caso 10 (Custo)** rodam na mesma máquina, mas com várias
  instâncias concentrando encodes numa GPU só — confirme num par de máquinas antes de tratar número
  ruim como defeito (advertência do topo).

**Windows 10 está fora por enquanto.** Os casos **5** e **6** da seção "5. Som" ficam parados: o
Windows 10 saiu do suporte, e o código já manda a Fonte sem Som abaixo do build 22000. A válvula
`SCRN_BROADCAST_FORCE_SOM` continua existindo para quem quiser medir isso no futuro.

## Ao final

Se algum passo falhar, primeiro pergunte se é a máquina compartilhando GPU entre instâncias
(a advertência do topo) antes de tratar como bug — especialmente para os passos de Encode com a
malha cheia.
