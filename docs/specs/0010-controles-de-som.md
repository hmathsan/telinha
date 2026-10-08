# 0010 — Controles de Som

Os controles sobre o Som que a [0009](./0009-som.md) passou a transmitir: o que o Transmissor escolhe
e silencia, e o que quem assiste ouve e ajusta.

**Pré-requisito.** A 0009 implementada **e** o portão dela cumprido: a seção "5. Som" do roteiro
rodou, e a [ADR 0011](../adr/0011-som-do-aplicativo-pelo-chromium.md) registra o resultado. Se a ADR
foi revista, esta spec é lida à luz da revisão.

Esta spec faz o papel da [0004](./0004-interface.md) e da [0008](./0008-telas.md) para o Som:
descreve comportamento e aparência juntos, porque são poucos elementos. Onde tocar num elemento que a
0008 descreve, a regra da [0007](./0007-sistema-visual.md) continua valendo: sem estilo inline, sem
hex, com anel de foco em todo controle.

## Transmissor

### Seletor de Fonte

Abaixo das abas **Monitores** e **Janelas**, e acima da grade:

- **Alternador "Transmitir com Som"**, ligado a cada abertura do seletor. Não persiste: é uma
  escolha por transmissão.
- **Desabilitado quando não há Som possível para a aba atual.** Nesse caso o rótulo de apoio diz
  **"Som exige Windows 11"**.
  - O renderer pergunta ao principal por um IPC novo, `getSomSupport(): Promise<{ window: boolean;
    screen: boolean }>`.
  - A resposta sai de `decideSomCapture` com um PID fictício diferente de `ownPid`. Assim a regra de
    build e a válvula `SCRN_BROADCAST_FORCE_SOM` continuam num lugar só, em vez de duplicadas no
    renderer.
- **Aviso fixo** (`card-warn`), visível sempre que a aba é **Monitores**, o alternador está ligado e
  o Som é possível. O texto:
  > O Som do sistema leva tudo o que toca neste computador. Se você está no Discord ou em outro app
  > de voz, quem fala pode se ouvir de volta — nesse caso, transmita a janela do jogo.

  É uma linha fixa, sem diálogo de confirmação e sem "não mostrar de novo". Ela aparece toda vez sem
  interromper ninguém.
- O subtítulo provisório da 0009 ("Janelas levam o Som do aplicativo…") sai, porque o alternador e
  o aviso dizem o mesmo com mais precisão.

`picker.choose(sourceId)` vira `picker.choose(sourceId, { som: boolean })`, e o principal repassa o
valor como `somRequested`. Desligado vira o motivo `som-off`, que já existe na 0009.

O Nocturne não tem alternador nem controle deslizante. Crie `.switch` e `.range` em
`styles/nocturne/components.css`, com tokens, estado desabilitado e o anel de foco de 2px. O
alternador é um `<button role="switch" aria-checked>`, não um checkbox restilizado.

### Quando a Fonte vai sem Som contra a vontade

Se o Transmissor pediu Som (alternador ligado) e a captura voltou sem Som, aparece uma faixa
`card-warn` dispensável no topo da coluna principal da Sessão, acima do Palco. O `useSessao` já
guarda o `somStatus` da 0009. A faixa não vai para a lista de avisos do diagnóstico, que fica
escondida na gaveta. Os textos:

| `reason` | Texto |
| --- | --- |
| `capture-failed`, `pid-not-found` | Não foi possível capturar o Som deste aplicativo. A Fonte está sendo transmitida sem Som. |
| `own-app` | O Telinha não transmite o próprio som. A Fonte está sendo transmitida sem Som. |
| `own-audio-not-excluded` | Não foi possível tirar o som do Telinha do Som do sistema, então a Fonte está sendo transmitida sem Som. |

`som-off` e `windows-10` não geram faixa: a pessoa já viu o alternador desligado ou desabilitado.

Quando a track de áudio termina no meio da transmissão (`som-capture-ended` da 0009), aparece a
faixa **"O Som deste aplicativo parou de chegar. A Fonte continua sem Som."**, e o Som conta como
encerrado para o botão abaixo e para a mensagem `som-state`.

### Botão na barra superior

Enquanto o Participante transmite, ao lado de "Parar de transmitir", aparece um botão com ícone:
- **Silenciar Som**, com `IconSpeakerHigh`, quando o Som está ativo;
- **Ativar Som**, com `IconSpeakerSlash`, quando está silenciado.

Ele só silencia e reativa um Som que já existe. Sem track de áudio viva (alternador desligado,
captura indisponível ou Som encerrado), o botão fica **desabilitado**, com o título "Escolha a Fonte
de novo para transmitir com Som".

A mecânica fica em `MeshManager.setSomAtivo(ativo: boolean)`:

- Cada `ManagedConnection` de papel `transmissor` guarda a referência do seu transceiver de áudio,
  porque depois de `replaceTrack(null)` o `sender.track` é `null` e não serve mais para achá-lo.
- Silenciar é `replaceTrack(null)` em todos os senders de áudio: nada é codificado nem enviado, e os
  6 encodes Opus param. Reativar é `replaceTrack(audioTrack)`. Nenhum dos dois renegocia.
- Uma conexão criada enquanto o Som está silenciado recebe `replaceTrack(null)` logo depois do
  `addTransceiver`.
- O estado volta a ativo em `startTransmitting`.
- Toda mudança loga `som-ativo-changed` (info, com `ativo`) e envia `som-state` (abaixo).

### Mensagem `som-state`

Silenciar não é visível no fio: silêncio e "sem pacotes" não dizem ao Espectador que foi de
propósito. Em `shared/media/meshSignal.ts`, acrescente ao `meshSignalPayloadSchema`:

```ts
z.object({
  kind: z.literal("som-state"),
  transmissorId: z.string(),
  espectadorId: z.string(),
  ativo: z.boolean(),
}),
```

Regras de envio e recebimento:

- **Sentido:** Transmissor → Espectador. Enviada em toda mudança de `setSomAtivo`, quando o Som
  encerra (`ativo: false`), e logo depois de **toda** oferta que `negotiate` emite (primeira conexão,
  `iceRestart`, `recreate`), sempre que a stream local tiver track de áudio. Isso cobre quem entra
  depois e quem teve a perna refeita, sem estado extra.
- **Validação:** o Espectador só aceita se `payload.transmissorId === fromParticipanteId`. Qualquer
  outra combinação loga `mesh-signal-rejected` e é descartada.
- **Entrega ao estado:** um handler novo, `onSomState(transmissorId, ativo)`, alimenta um
  `Map<transmissorId, boolean>` no `useSessao`. A entrada é apagada em `onRemoteStreamEnded`.
- **Compatibilidade:** é payload da malha, opaco ao sinalizador. **Não sobe `PROTOCOL_VERSION`**,
  pelo mesmo raciocínio do `recovery-request` na spec 0003. Um cliente antigo loga
  `mesh-signal-rejected` a cada oferta com Som. Isso é esperado e não é defeito.

## Espectador

### Quem se ouve

`selectSomAudivel` (`shared/somSelection.ts`, criada na 0009) ganha as escolhas manuais:

```ts
export interface SomAudivelInput {
  readonly modo: ModoPalco;
  readonly stagedId: string | null;
  readonly cellIds: readonly string[];
  readonly myId: string | null;
  /** id → true (ouvir) ou false (silenciar). Ausente = segue o Palco. */
  readonly escolhas: ReadonlyMap<string, boolean>;
}

/** O conjunto da 0009, com cada escolha manual por cima. O próprio Participante nunca entra. */
export function selectSomAudivel(input: SomAudivelInput): ReadonlySet<string>;

/** Clique no mudo de uma Fonte: grava o oposto do que ela está agora. */
export function toggleSomEscolha(
  escolhas: ReadonlyMap<string, boolean>,
  id: string,
  audivelAgora: boolean,
): ReadonlyMap<string, boolean>;

/** Descarta escolhas e volumes de quem não transmite mais. */
export function pruneSomPorTransmissor<T>(
  porId: ReadonlyMap<string, T>,
  transmissorIds: readonly string[],
): ReadonlyMap<string, T>;
```

Regras:

- **A escolha manual vence o Palco** e dura até a pessoa mudar de novo, apertar "Som segue o Palco"
  ou aquele Transmissor parar de transmitir.
  - Cenário: silencio X, que está no Palco, e promovo Y. Quando volto a promover X, X continua mudo.
  - Cenário: no Foco, ligo o som da miniatura Y. Ouço X e Y juntos.
- **Parar de transmitir descarta a escolha e o volume.** O `SessaoScreen` aplica
  `pruneSomPorTransmissor` sempre que `state.transmissores` muda. Quem para e volta começa seguindo o
  Palco, com volume cheio.
- **O volume não é escolha manual.**
  - Cenário: no automático, abaixo o volume de X e promovo Y. X silencia, porque a regra do Palco
    continua valendo para ele.
  - O volume fica guardado num `Map<id, number>` separado, de 0 a 1, com padrão 1.
- **Não há identidade entre Sessões** (ADR 0004), então nada disso é salvo em `localStorage`.

Os testes em `somSelection.test.ts` cobrem os dois cenários de escolha e o de volume acima, mais estes:
- o próprio Participante nunca entra, mesmo com escolha `true`;
- `pruneSomPorTransmissor` remove quem saiu e mantém quem ficou;
- na Grade com uma escolha `false`, todos menos aquele se ouvem.

O efeito da 0009 no `SessaoScreen` passa a aplicar também `element.volume`.

### Controles na Fonte

Hoje o `VideoTile` é um `<button>`, e botão dentro de botão não é HTML válido. Reestruture:

- **Moldura:** a `.video-frame` vira um `<div>`.
- **Camada de clique:** um `<button>` que cobre a moldura inteira. Recebe clique, duplo clique e o
  anel de foco, preservando a regra da 0007 de que miniaturas e células são botões.
- **Controles de Som:** ficam num contêiner **irmão** dessa camada, posicionado por cima. Cliques e
  duplos cliques neles chamam `stopPropagation`, para nunca promover nem abrir tela cheia.

O que cada Fonte mostra:

| Onde | Com Som | Sem Som |
| --- | --- | --- |
| Palco (Foco) e célula da Grade | botão de mudo + controle de volume (`.range`, 0–100) | ícone "sem Som" |
| Miniatura | botão de mudo | ícone "sem Som" |
| A própria Fonte de quem transmite | nada | nada |

- **Com Som** significa que a stream remota tem track de áudio **e** o último `som-state` daquele
  Transmissor não é `ativo: false`.
- **Sem Som** cobre, igual, três casos:
  - Transmissor sem Som;
  - Som silenciado por ele;
  - Transmissor em versão antiga.
- **Botão de mudo:** mostra `IconSpeakerHigh` quando a Fonte está audível e `IconSpeakerSlash`
  quando não está. O ícone reflete o resultado de `selectSomAudivel`, não a escolha gravada. Clicar
  chama `toggleSomEscolha`. O `aria-label` é "Silenciar {nome}" ou "Ouvir {nome}".
- **Ícone "sem Som":** `IconSpeakerSlash` na cor muted, com rótulo acessível "sem Som", ao lado do
  nome.
- **Visibilidade:** o controle de volume aparece em `:hover` e `:focus-within` da moldura. O botão
  de mudo e o ícone "sem Som" ficam sempre visíveis, porque a regra do Palco muda o que se ouve sem
  clique nenhum, e isso precisa estar à vista.

A tela cheia vale para a raiz do Palco (`palcoRef`), então os controles continuam lá sem nada a mais.

### "Som segue o Palco"

- **Posição:** um botão na barra superior, colado ao alternador Foco/Grade.
- **Visibilidade:** a mesma regra do alternador, só com dois ou mais Transmissores.
- **Estado:** `aria-pressed` fica verdadeiro quando não há nenhuma escolha manual, e aí o botão fica
  desabilitado, porque não há nada a desfazer.
- **Clique:** apaga todas as escolhas manuais de uma vez. Os volumes ficam como estão.

Com um Transmissor só, o botão não existe, e uma escolha manual se desfaz no próprio botão de mudo.

### Ícones

Copie `SpeakerHigh` e `SpeakerSlash` do Phosphor, peso regular, para
`components/icons/index.tsx` como `IconSpeakerHigh` e `IconSpeakerSlash`, no padrão do arquivo:
traçado inline, `currentColor`, `1em`.

## Documentação que muda junto

O `AGENTS.md` manda o README mudar com o comportamento:

- **`README.md`:** a limitação "Transmissão sem áudio" sai. A linha **Suporte a áudio** do roadmap
  vira concluída. O Som exige Windows 11, e isso vai para a lista do que o app não faz. A
  troubleshooting ganha um item "O amigo se ouve de volta quando eu transmito o monitor", apontando
  para a transmissão por janela.
- **`README.en.md`:** tradução integral das mesmas mudanças.
- **`.github/RELEASE_TEMPLATE.md`:** a frase "A transmissão é de vídeo, sem áudio." muda.

## Roteiro manual

Acrescente à seção "5. Som" do roteiro:

1. **Alternador.** Ele abre ligado toda vez. Desligado, a Fonte vai sem Som, com
   `som-capture-requested { reason: 'som-off' }` e sem faixa de aviso.
2. **Aviso.** Aparece na aba Monitores com o Som ligado. Some na aba Janelas e com o Som desligado.
3. **Windows 10.** O alternador aparece desabilitado com "Som exige Windows 11". Com a válvula, fica
   habilitado.
4. **Silenciar no meio.** A silencia pela barra. Nos Espectadores, o ícone "sem Som" aparece em até
   um segundo. A coluna Som kbps de A cai a zero. Reativar desfaz as duas coisas. Um Espectador que
   entra enquanto A está silenciado já chega vendo o ícone.
5. **Escolha manual.** Execute os cenários da seção "Quem se ouve": X silenciado continua mudo ao
   voltar ao Palco, e a miniatura ligada toca junto. Depois aperte "Som segue o Palco" e tudo volta
   à regra.
6. **Volume.** No automático, abaixe o volume de X e promova Y. X silencia. Promova X de volta e o
   volume baixo continua.
7. **Parar e voltar.** Com X silenciado na mão, X para e volta a transmitir. Ele volta seguindo o
   Palco, com volume cheio.
8. **Controles não promovem.** Clicar e dar duplo clique no mudo e no volume de uma miniatura ou
   célula não promove nada nem abre tela cheia.
9. **Transmissor em versão antiga.** A Fonte dele mostra "sem Som". O cliente antigo, como
   Espectador de um novo, loga `mesh-signal-rejected` e segue funcionando.

## Pronto quando

- `npm test` passa com os casos novos de `somSelection` e do schema de `meshSignal`: `som-state`
  válido e `som-state` com `transmissorId` diferente do remetente.
- `npm run typecheck` passa.
- Os passos 1 a 9 acima passam no roteiro.
- Navegando só pelo teclado, o alternador do seletor, o botão da barra, o mudo, o volume e "Som
  segue o Palco" recebem o anel de foco do Nocturne.
- `grep -rn "style={{" apps/desktop/src/renderer` continua não retornando nada.
- README, README.en e o modelo de release descrevem o Som como ele é.
