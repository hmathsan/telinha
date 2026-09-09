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

**Espectador cai e volta.** Com uma Sessão em andamento, derrube a rede de um Espectador (Wi-Fi
off, ou desconecte o cabo) por alguns segundos e restaure.

- **O que observar:** a conexão se recupera sozinha sem que ninguém precise colar o Código de
  Sessão de novo. Se `iceconnectionstate` foi só a `disconnected`, deve resolver sozinho; se foi
  a `failed`, o app deve chamar `restartIce()` e renegociar — em ambos os casos, sem
  intervenção manual.

**Anfitrião sai.** Encerre a instância do Anfitrião (feche a janela).

- **O que observar:** a Sessão termina para todo mundo — as demais instâncias voltam para a tela
  de Entrada ou mostram que a Sessão acabou, não ficam penduradas esperando.

## Ao final

Se algum passo falhar, primeiro pergunte se é a máquina compartilhando GPU entre instâncias
(a advertência do topo) antes de tratar como bug — especialmente para os passos de Encode com a
malha cheia.
