# 0008 — Telas

Redesenha as quatro telas sobre a fundação da [0007](./0007-sistema-visual.md).

**O comportamento continua sendo o da [0004](./0004-interface.md)** — o que o Palco faz, quando o
botão de transmitir desabilita, o que o indicador de qualidade diz. Esta spec descreve o que se
vê e o que responde ao clique. Onde as duas divergirem, a 0004 manda; onde a 0004 mudou, a mudança
está escrita lá, com o motivo.

A referência visual é o mock `Transmissao.dc.html`. Ele é ilustrativo: foi desenhado sem saber
que o app é Electron, que `MAX_TRANSMISSORES` é 2 e que 720p30 é teto. A seção final lista o que
dele **não** entra, para ninguém reintroduzir por engano ao consultar o mock.

## Barra superior

Um elemento comum no topo do conteúdo — **não** a moldura da janela. A janela continua com a
barra de título nativa do Windows, e nada em `mainWindow.ts` muda.

Da esquerda para a direita: marca **Telinha**, o **Código de Sessão** com botão de copiar, um
espaçador, o alternador Foco/Grade, o botão de transmitir, o botão com a contagem de Participantes
que abre a gaveta, e Sair.

## Entrada

Coluna única de 420px centrada. Marca, título, uma linha de apoio, campo **Seu nome**, campo
**Código de Sessão**, e os botões Criar Sessão e Entrar lado a lado.

O campo de código continua com 6 caracteres em maiúsculas — o mock mostra oito com hífen, e é o
mock que está errado (`z.string().length(6)` em `packages/protocol/src/messages.ts`). Exibido com
respiro (`ABC DEF`), rotulado **Código de Sessão**. Nunca "ID de sala", que o CONTEXT.md lista
como termo a evitar: o rótulo é a única coisa que ensina o vocabulário a quem usa o app.

Os quatro motivos de recusa da 0004 — versão incompatível, código inválido, Sessão cheia, recusado
pelo Anfitrião — e os motivos de desconexão continuam como estão, agora numa faixa de aviso do
Nocturne em vez de um `<p>` colorido.

## Sessão

### Palco

Dois modos, e o alternador entre eles só aparece com **dois ou mais Transmissores** — com um só
não há escolha de layout a fazer, e um controle que não muda nada visível parece defeito.

**Foco** é o modo da 0004: um Transmissor grande, os outros como miniaturas de 190px numa faixa
abaixo. Clicar numa miniatura promove.

**Grade** distribui os Transmissores em células de proporção 16/9. Duplo clique numa célula
promove aquele Transmissor ao Palco, volta para Foco **e** entra em tela cheia — duplo clique já
significa "quero ver isto grande", e sair da tela cheia devolve a pessoa ao Transmissor que ela
escolheu.

Cada célula e cada miniatura levam o nome do Transmissor e um ponto vermelho pulsante. O Palco em
Foco leva também resolução e taxa no canto oposto.

Com zero Transmissores, o estado vazio: moldura tracejada, ícone, "O Palco está vazio", uma linha
de explicação e o botão de transmitir.

### Regras de layout ficam fora do React

Visibilidade do alternador, ordem das células, qual Transmissor está no Palco e o que acontece com
o modo Grade quando um Transmissor sai e sobra um: tudo isso mora em
`apps/desktop/src/shared/palcoSelection.ts`, junto de `selectPalco`, e é testado sem React.

"Um Transmissor sai enquanto você está na Grade" é o caso que ninguém reproduz à mão e que quebra
em produção. Como função pura, ele custa três linhas de teste. Dentro de um componente, custa uma
sessão com amigos para descobrir. É a [ADR 0003](../adr/0003-monorepo-com-nucleo-sem-ui.md)
aplicada à interface.

### Gaveta de Participantes

Painel de 300px à direita, **recolhível e fechada por padrão**, aberta pelo botão de contagem na
barra superior. Cada linha: inicial em avatar circular, nome, ponto pulsante para quem transmite,
o papel abaixo (Anfitrião, Participante, você) e, só para o Anfitrião, o botão de expulsar.

Fechada por padrão porque numa janela de 1280px ela toma 23% da largura que o Palco não tem, e
importa em dois momentos — aprovar alguém e expulsar alguém — não o tempo todo.

### Aprovação de entrada

Pilha de cards no topo da área de conteúdo. **Um pedido por vez na frente**, com o nome digitado e
os botões Aprovar e Recusar; os seguintes ficam desenhados atrás, em leque, no máximo dois, e um
contador `+N esperando` diz quantos faltam. Responder o da frente traz o próximo, e a pilha
diminui.

Não modal, pelo motivo de sempre: dois pedidos simultâneos viram dois modais um sobre o outro, e aí
a pessoa aprova quem não queria. E não uma faixa por pedido, pelo motivo que só apareceu no teste
com várias pessoas: cinco pedidos viravam cinco faixas empilhadas empurrando o Palco para fora da
tela. A pilha inteira ocupa a altura de um card.

A ordem é a de chegada — quem pediu primeiro é respondido primeiro. Os cards de trás são
profundidade, não conteúdo: quem usa leitor de tela recebe o pedido da frente e o contador.

### Entrada, esperando aprovação

Depois de "Entrar", a Entrada mostra uma faixa de acento — *"Pedido enviado. O Anfitrião precisa
aceitar sua entrada — aguarde."* — e os campos e os dois botões dão lugar a **Cancelar pedido**.

Sem isso, a tela ficava idêntica depois do clique, ninguém sabia que havia uma aprovação no
caminho, e as pessoas clicavam de novo — cada clique um pedido a mais na fila do Anfitrião.
Cancelar retira o pedido da fila dele em vez de deixá-lo pendurado.

### Indicador de qualidade

Como na 0004: sempre visível, discreto, com **resolução, FPS e o sinal de conexão degradada** do
Palco. Sem Mbps — o mock põe um, mas o número por conexão continua só no diagnóstico.

O aviso de relay ("sua rede exige um servidor de retransmissão") continua aqui, e não some no
redesenho: sem ele, o amigo afetado só percebe que a experiência dele é pior que a dos outros.

Clicar abre o painel de diagnóstico.

## Seletor de Fonte

Vira **modal dentro da própria janela** (`.dialog-backdrop` + `.dialog`), no lugar da
`BrowserWindow` separada com rota `#/picker`. Isso apaga `openFontePicker`, o roteamento por hash
do `Root.tsx` e o comentário que explicava a janela separada — o motivo declarado dela era evitar
um segundo entry point de Vite, e um modal elimina a necessidade em vez de contorná-la.

O processo principal continua dono da enumeração: `desktopCapturer.getSources()` roda lá, e o
renderer recebe a lista por IPC (spec 0003, "Captura"). A atualização a cada segundo enquanto o
seletor está aberto continua.

Duas abas: **Monitores** e **Janelas** — o vocabulário do CONTEXT.md, não o "Aplicativos / Tela
inteira" do Discord. Grade de miniaturas com sobreposição no hover trazendo "Transmitir".

Monitores são rotulados **Monitor 1**, **Monitor 2** — o `desktopCapturer` devolve "Screen 1" no
Windows, então o rótulo é reescrito de qualquer forma, e "Tela" está na lista de termos a evitar
para Fonte. Janelas levam o nome que o sistema dá. Sem linha de resolução: para monitores ela
seria obtível via `screen.getAllDisplays()`, mas para janelas exigiria chamada nativa do Windows,
e uma assimetria dessas confunde mais do que a informação ajuda.

**_Emendado._** O subtítulo dizia que **o áudio do sistema não é compartilhado**, o que era verdade
enquanto `capture.ts` passava `audio: false`. Com o Som, ele dá lugar ao alternador "Transmitir com
Som" e ao aviso do Som do sistema — veja a [0009](./0009-som.md) e a [0010](./0010-controles-de-som.md).

## Diagnóstico

Gaveta inferior sobre a Sessão. Cabeçalho com título e o botão "Exportar .json" da 0004, e a
tabela `.table` do Nocturne com uma linha por conexão: Participante, Mbps, fps, perda e RTT. Os
avisos de qualidade acumulados ficam acima da tabela, cada um dispensável.

## Do mock, descartado

Registrado para não voltar por engano em consulta futura:

- **Rodapé "Servidor sa-east-1 · N conectados"** — falso. A [ADR 0002](../adr/0002-malha-p2p-sem-sfu.md)
  é malha P2P sem SFU, e o CONTEXT.md reserva "Servidor" para o sentido literal.
- **"Convidar por ID"** — não existe convite. Vira o botão de copiar o Código de Sessão.
- **Código `XXXX-XXXX` de 8 caracteres** e o rótulo **"ID da sessão"**.
- **Mbps na barra superior.**
- **`1920 × 1080`, `60 fps`, `165 Hz`** — a 0003 põe teto em 720p30. São valores de ilustração.
- **Quatro Transmissores simultâneos** — `MAX_TRANSMISSORES` é 2.
- **Barra de qualidade só quando você transmite** — ela reflete o Palco, sempre.
- **`<link>` do Google Fonts** — bloqueado pela CSP; ver a [0007](./0007-sistema-visual.md).
- **Barra superior fazendo as vezes de barra de título.**

## Pronto quando

- Os quatro critérios da [0004](./0004-interface.md) continuam passando no app redesenhado.
- Com dois Transmissores, o alternador aparece; com um, não. Alternar Foco/Grade não derruba
  nenhuma conexão.
- Um Transmissor sai enquanto a Grade está aberta com dois: o app volta para Foco sem tela preta,
  e há teste em `palcoSelection.test.ts` cobrindo o caso.
- Duplo clique numa célula da Grade termina em tela cheia, e sair dela deixa aquele Transmissor
  no Palco em modo Foco.
- O seletor de Fonte abre como modal, lista monitores e janelas em abas separadas, atualiza
  sozinho e não abre nenhuma janela nova.
- O aviso de relay e o de conexão degradada aparecem no lugar certo sob banda induzida.
