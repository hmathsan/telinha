# 0012 — Som de um aplicativo no monitor

Um monitor passa a poder levar o Som de **um aplicativo escolhido** em vez do sistema inteiro
(CONTEXT.md, **Som**). Isso resolve o caso que motivou a spec: o jogo em tela cheia transmitido
pelo monitor, sem o Discord junto. Esta spec também deixa "Ativar Som" recapturar o Som quando
não há track viva. Com isso, o jogo que crashou e reabriu volta a ter Som sem recriar a transmissão.

**Por que não "sistema inteiro menos o Discord".** O Windows exclui um único processo por captura,
e o Chromium usa essa vaga para excluir o Telinha. O detalhe está na seção "Por que não excluir o
Discord" da [ADR 0011](../adr/0011-som-do-aplicativo-pelo-chromium.md).

**Pré-requisito:** 0009 e 0010 implementadas. Pode sair antes da [0011](./0011-retomada.md), porque
não toca no protocolo nem no sinalizador.

## Comportamento

- **Monitor tem três escolhas de Som:** "Sem Som", "Sistema inteiro" e um item por aplicativo.
- **Janela não muda:** continua com o alternador "Transmitir com Som" da 0010, e o Som é sempre o do
  aplicativo dela.
- **A escolha pré-marcada** é o último aplicativo escolhido nesta execução do Telinha, desde que ele
  esteja na lista. A comparação é pelo nome do executável, porque o jogo que reabriu tem outro PID.
  Sem esse aplicativo na lista, a pré-marcada é "Sistema inteiro". A lembrança não é persistida: só
  dura até fechar o app.
- **O aviso de Discord** da 0010 aparece só com "Sistema inteiro" selecionado. Com um aplicativo, ele
  não se aplica.
- **Quando o Som acaba no meio da transmissão,** o Som fica silenciado sozinho, e os Espectadores veem
  o ícone "sem Som". A faixa da 0010 ("O Som deste aplicativo parou de chegar…") continua.
- **"Ativar Som" sem track viva recaptura o Som em vez de ficar desabilitado.** Vale para Som
  encerrado, para quem escolheu "Sem Som" e para `capture-failed`. Num monitor, abre o mesmo select
  do seletor. Numa janela, recaptura o aplicativo dela direto.
  - **Desabilitado, como hoje,** só no Windows 10 sem a válvula, com o título "Som exige Windows 11".
  - **Com track viva,** o botão silencia e reativa exatamente como na 0010. Trocar de aplicativo no
    meio da transmissão está fora desta spec.

## Lista de aplicativos

Ela sai das janelas que o `desktopCapturer` já enumera para o seletor, sem uma enumeração nova.

`main/windowProcess.ts` ganha `executableOfProcess(pid: number): string | null`, que devolve o
nome-base do executável (`"Discord.exe"`). A implementação usa `OpenProcess` com
`PROCESS_QUERY_LIMITED_INFORMATION`, `QueryFullProcessImageNameW` e `CloseHandle`, pelo mesmo `koffi`
e com as mesmas três regras de `processIdOfWindow`: carregamento preguiçoso e protegido, sem teste
unitário, e falha que loga `window-process-lookup-failed` e devolve `null`.

A regra de quais aplicativos entram é uma função pura, em `shared/media/somApps.ts`:

```ts
export interface SomApp {
  readonly pid: number;
  /** Nome-base do executável, a chave da lembrança. */
  readonly exe: string;
  /** O rótulo no select: o nome da primeira janela do processo. */
  readonly name: string;
}

export interface WindowProcess {
  readonly name: string;
  readonly pid: number | null;
  readonly exe: string | null;
}

/** Uma entrada por PID, na ordem das janelas; sem o próprio app, sem PID ou executável ilegível. */
export function listSomApps(windows: readonly WindowProcess[], ownPid: number): SomApp[];

/** O app da lembrança, se estiver na lista; senão `null` (a pré-marcada vira "Sistema inteiro"). */
export function preselectSomApp(apps: readonly SomApp[], lastExe: string | null): SomApp | null;
```

Os testes, em `somApps.test.ts`, cobrem:

- duas janelas do mesmo processo viram um item só, com o nome da primeira;
- o próprio app não aparece;
- janela com `pid` ou `exe` nulos fica fora;
- a lembrança acha o app pelo `exe` mesmo com PID diferente;
- a lembrança de um `exe` ausente devolve `null`.

`sourcePicker.ts` resolve PID e executável de cada janela no mesmo `refresh` de 1 s, e manda a lista
junto com as Fontes. O payload de `pickerSources` passa de `FontePickerItem[]` a
`{ items: FontePickerItem[]; somApps: SomApp[]; preselected: number | null }`, em que `preselected` é o
PID de `preselectSomApp`. A lembrança (`lastSomAppExe`) vive no principal, ao lado de `lastSomCapture`.

## Escolha de Som

Em `shared/ipc.ts`:

```ts
/** O Som pedido para a Fonte. Janela só usa "nenhum" e "fonte". */
export type SomEscolha =
  | { readonly kind: "nenhum" }
  | { readonly kind: "fonte" }                       // janela: o app dela; monitor: o sistema inteiro
  | { readonly kind: "app"; readonly pid: number };  // só monitor

export interface PickerChooseOptions {
  readonly som: SomEscolha;
}
```

`FonteChoice.somRequested` vira `FonteChoice.som: SomEscolha`. Na aba **Janelas**, o alternador
ligado é `fonte` e desligado é `nenhum`.

Na aba **Monitores**, o alternador dá lugar a um `<select>` nativo, estilizado no Nocturne como os
campos de texto:

| Opção | Valor |
| --- | --- |
| Sem Som | `nenhum` |
| Sistema inteiro | `fonte` |
| Um item por `SomApp`, com o `name` | `app` com o `pid` |

O select fica desabilitado nas mesmas condições do alternador, com o mesmo "Som exige Windows 11".
Quando a escolha é um aplicativo, o principal grava `lastSomAppExe` com o `exe` dele.

### `decideSomCapture`

`SomCaptureInput` troca `somRequested: boolean` por `som: SomEscolha`, e as regras ganham uma linha:

| Condição | Resultado |
| --- | --- |
| `som.kind === "nenhum"` | `som-off` |
| `windowsBuild < MIN_WINDOWS_BUILD_FOR_SOM` e `!forced` | `windows-10` |
| monitor, `som.kind === "app"`, `som.pid === ownPid` | `own-app`, **mesmo com `forced`** |
| monitor, `som.kind === "app"` | `applicationLoopback:<pid>`, modo `applicationLoopback` |
| (as regras da 0009 para janela e para monitor com `fonte`, inalteradas) | |

O `own-app` de monitor não acontece pela UI, porque a lista já exclui o próprio app. A regra existe
porque o PID chega por IPC, e a invariante não pode depender de a lista estar certa. Os testes novos
vão em `somCapture.test.ts`. O `somSupport` passa `som: { kind: "fonte" }`.

**No renderer não muda nada.** Com `applicationLoopback`, o modo devolvido já não passa pela checagem
de `restrictOwnAudio`, que continua só para `loopback`.

`som-capture-requested` ganha `somKind` (`nenhum`, `fonte` ou `app`) no lugar de `somRequested`. O
`pid` do log passa a ser o do aplicativo escolhido também para monitor.

## Transceiver de áudio sempre presente

Para "Ativar Som" funcionar em quem começou sem Som, toda conexão de Transmissor nasce com um
transceiver de áudio. Em `MeshManager.createOutgoingConnection`, se a `localStream` não tem track de
áudio, crie `pc.addTransceiver("audio", { direction: "sendonly", streams: [this.localStream] })` e
guarde-o em `entry.somTransceiver`, com o mesmo teto `MAX_SOM_BITRATE_BPS`. Sem track, nada é
codificado. O custo é uma linha `m=audio` ociosa no SDP.

No Espectador, isso faz toda Fonte remota ter track de áudio. Então o "sem Som" deixa de poder vir de
"não há track". Duas mudanças acompanham:

- `sendSomState` perde o retorno antecipado de "sem track de áudio" e sempre envia, com
  `ativo: this.somAtivo && this.liveSomTrack() !== null`.
- `somOf` (`SessaoScreen.tsx`) mostra "sem Som" a menos que `somStates.get(id) === true`. Até o
  primeiro `som-state` chegar, a Fonte aparece sem Som, o que é o erro do lado seguro. Um Transmissor
  em versão anterior a esta já envia `som-state` sempre que tem Som, então continua correto.

## Recaptura

**Principal.** O reenvio de uso único da 0009 (`retryWithoutSom`) vira um **reenvio armado**
genérico: `armedReply: { streams: Streams; expiresAt: number } | null`, consumido pelo handler antes
de abrir o seletor, com o mesmo prazo de 10 s. `retryCaptureWithoutSom` passa a armá-lo com
`{ video: source }`, sem mudar o comportamento.

IPC novo (`shared/ipc.ts`, `preload/index.ts`):

- `listSomApps(): Promise<{ somApps: SomApp[]; preselected: number | null }>` enumera as janelas como
  o seletor faz. O menu da barra usa isso.
- `armSomRecapture(som: SomEscolha): Promise<SomCaptureReport | null>` pega a Fonte da última
  escolha, roda `streamsWithSom(source, som)` e arma o reenvio com o resultado. Devolve o relatório da
  decisão. Sem Fonte anterior, devolve `null`. Loga `som-recapture-armed` (info) com `fonteKind`,
  `somKind` e `mode` ou `reason`.

`lastSomCapture` hoje guarda a Fonte. Ela precisa continuar guardada enquanto a transmissão durar,
não só até o próximo seletor. Uma Fonte de janela fechada não chega aqui, porque o fim do vídeo já
libera o Palco.

**Renderer.** Em `media/capture.ts`, a parte de `captureFonte` que valida a track de áudio (sem track,
track encerrada, `restrictOwnAudio`, `contentHint`, logs) é extraída para
`checkSomTrack(stream): Promise<SomStatus>`. `captureFonte` passa a chamá-la. A função nova:

```ts
/** Pede de novo a mesma Fonte com o Som escolhido, e devolve só a track de áudio validada. */
export async function recaptureSom(som: SomEscolha): Promise<{ track: MediaStreamTrack | null; som: SomStatus }>;
```

Ela faz quatro coisas, em ordem:

1. Chama `armSomRecapture(som)`. Se o relatório já disser `audio: null`, devolve o `reason` sem chamar
   `getDisplayMedia`.
2. Chama `getDisplayMedia` com as mesmas constraints.
3. Para e remove a track de vídeo dessa segunda captura, porque o vídeo transmitido continua sendo o
   original.
4. Passa a stream por `checkSomTrack`.

Uma rejeição do `getDisplayMedia` vira `capture-failed`, sem reenvio.

**Malha.** `MeshManager.replaceSomTrack(track: MediaStreamTrack)`:

1. remove da `localStream` a track de áudio antiga, se houver, e acrescenta a nova;
2. `somAtivo = true` e `somSilence.reset()`;
3. `replaceTrack(track)` em todo `somTransceiver`, sem renegociar;
4. loga `som-track-replaced` (info) e envia `som-state`.

**`useSessao`.** `ativarSom()` decide entre os dois caminhos:

- **Com track viva:** `setSomAtivo(true)`, como hoje.
- **Sem track viva:** a UI coleta a `SomEscolha` e chama `recaptureSom(escolha)`.
  - Com track, ela vai para `replaceSomTrack`, o `somStatus` é atualizado e o listener de `ended` da
    0010 é reanexado à track nova.
  - Sem track, a faixa da 0010 mostra o `reason` como na captura original.

**Fim do Som.** Quando a track de áudio encerra, além do que a 0010 já faz, o `useSessao` marca
`somAtivo = false`. O botão então mostra "Ativar Som", e é ele que leva à recaptura.

## Barra superior

- **Com track viva:** o botão de Som é o da 0010.
- **Sem track viva, Fonte de janela:** "Ativar Som" chama `ativarSom` com `{ kind: "fonte" }`.
- **Sem track viva, Fonte de monitor:** "Ativar Som" abre um popover ancorado no botão, com o mesmo
  select do seletor e o mesmo aviso de Discord. A lista e a pré-marcada vêm de `listSomApps`. Um botão
  **Ativar** confirma. Esc ou clique fora fecham sem fazer nada.
- **Durante a recaptura:** o botão fica desabilitado com `aria-busy`.

O popover segue a [0007](./0007-sistema-visual.md): sem estilo inline, sem hex, com anel de foco e
foco devolvido ao botão ao fechar.

## Log

| Evento | Onde | Nível | Campos |
| --- | --- | --- | --- |
| `som-capture-requested` | principal | info | como na 0009, com `somKind` no lugar de `somRequested` |
| `som-recapture-armed` | principal | info | `fonteKind`, `somKind`, `mode` ou `reason` |
| `som-recapture-failed` | renderer | warn | `reason`, `message?` |
| `som-track-replaced` | renderer | info | `mode`, `espectadores` |

O `som-capture-started` de `checkSomTrack` também aparece na recaptura, com as settings da track nova.

## Roteiro manual

Acrescente à seção "5. Som" do
[roteiro](../roteiro-de-testes-manuais-de-midia.md):

1. **Monitor com Som de um app.** Com um jogo e o Discord em chamada tocando ao mesmo tempo, transmita
   o monitor com o jogo escolhido. O Espectador ouve o jogo e não ouve o Discord. O log mostra
   `som-capture-requested { fonteKind: 'screen', somKind: 'app', mode: 'applicationLoopback' }`.
2. **Tela cheia exclusiva.** Abra um jogo em tela cheia exclusiva e verifique se ele aparece na lista
   de apps do seletor. Registre o resultado na ADR 0011. Se não aparecer, a lista precisa vir das
   sessões de áudio do Windows, e isso vira uma spec nova.
3. **Lembrança.** Transmita com o jogo escolhido, pare, feche e reabra o jogo, e transmita de novo. O
   jogo já vem marcado.
4. **Crash no meio.** Transmitindo o monitor com um app, feche o app. O Som silencia sozinho, e o
   Espectador vê "sem Som" em até 1 s. Reabra o app, clique "Ativar Som" e escolha-o. O Som volta sem
   o vídeo piscar, e o log mostra `som-track-replaced` sem nenhum `mesh-negotiate`.
5. **Começou sem Som.** Transmita o monitor com "Sem Som" e depois clique "Ativar Som" com
   "Sistema inteiro". O Som chega, o aviso de Discord apareceu no popover, e o log mostra
   `som-capture-started` com `restrictOwnAudio: true`.
6. **Versão anterior.** Um Espectador com o instalador anterior vê a Fonte de um Transmissor sem Som,
   e não quebra com a linha `m=audio` ociosa.

## Pronto quando

- `npm test` passa com `somApps.test.ts` e os casos novos de `somCapture.test.ts`.
- `npm run typecheck` passa, com o único cast continuando a ser o do `audio` no handler.
- Os casos 1, 3, 4, 5 e 6 do roteiro passam. O caso 2 está registrado na ADR 0011.
- Nenhuma escolha de aplicativo produz Som com o próprio Telinha dentro.
- Recapturar o Som nunca renegocia uma conexão.
