# 0004 — Interface

Define as telas do app. A referência visual é o Discord em Go Live, sem a barra de servidores e
sem a lista de canais.

Esta spec descreve **comportamento**, e continua sendo a autoridade sobre ele. A aparência é a
[0007](./0007-sistema-visual.md) e a [0008](./0008-telas.md). As seções marcadas com
**_Emendado_** mudaram depois da v1 beta, e o parágrafo diz por quê.

## Telas

**Entrada.** Campo de nome, botão "Criar Sessão" e campo de Código de Sessão com botão "Entrar".
Nada mais. O nome fica salvo localmente.

**Sessão.** Uma área principal (o Palco), uma faixa de miniaturas e uma gaveta de Participantes.

**_Emendado._** A lista de Participantes era fixa na lateral; virou gaveta recolhível, fechada
por padrão. Numa janela de 1280px ela tomava 23% da largura que o Palco não tem, e serve a dois
momentos — aprovar alguém e expulsar alguém — não ao tempo todo.

## Palco

Com zero Transmissores, o Palco mostra um estado vazio e o botão de transmitir.

Com um ou dois Transmissores, o primeiro ocupa o Palco e o outro fica como miniatura. Clicar
numa miniatura a promove ao Palco e rebaixa a atual. Duplo clique no Palco entra em tela cheia.

**_Emendado._** A versão original desta spec dizia "Palco único, e não grade", com o argumento de
que 720p espremido em meia tela desperdiça exatamente a qualidade que o projeto foi buscar. O
argumento continua verdadeiro — e por isso **Foco segue sendo o modo padrão**. O que mudou foi a
conclusão: o alvo declarado do projeto é a paridade com o Go Live do Discord, e lá a grade existe.
Ela entra como **modo alternativo**, escolhido por quem assiste, e o alternador Foco/Grade só
aparece com dois ou mais Transmissores — com um só não há escolha a fazer. Escrever a lógica de
grade agora também deixa o caminho pronto para quando `MAX_TRANSMISSORES` crescer, em vez de
descobrir na hora que o layout foi construído supondo um vídeo.

Duplo clique numa célula da Grade promove aquele Transmissor ao Palco, volta para Foco e entra em
tela cheia: duplo clique já significa "quero ver isto grande", e sair da tela cheia devolve a
pessoa ao Transmissor que ela escolheu.

## Transmitir

O botão abre o seletor de Fonte: uma grade de miniaturas com monitores e janelas de aplicação,
atualizada enquanto está aberta.

**_Emendado._** O seletor era uma janela separada; virou modal dentro da própria janela. O motivo
declarado da janela separada era evitar um segundo entry point de Vite, e um modal elimina essa
necessidade em vez de contorná-la. Detalhes na [0008](./0008-telas.md).

Com `MAX_TRANSMISSORES` vagas ocupadas, o botão fica desabilitado exibindo "2/2 transmitindo".
Sem fila: quem quiser a vaga pede pela voz.

## Gaveta de Participantes

Nome de cada um, e um ponto indicando quem está transmitindo. Para o Anfitrião, cada linha tem
"expulsar". Recolhível, fechada por padrão, aberta pela contagem na barra superior.

## Aprovação de entrada

Só o Anfitrião vê: um aviso com o nome digitado e os botões aprovar e recusar. O nome não
autentica ninguém e não precisa — veja a
[ADR 0004](../adr/0004-codigo-efemero-sem-identidade.md).

## Indicador de qualidade

Sempre visível, discreto: resolução e FPS atuais do Palco, e um sinal de conexão degradada.
Entrou na v1 porque com bitrate adaptativo é ele que distingue congestionamento de defeito.

Quando este Participante está passando por relay, o indicador diz "sua rede exige um servidor de
retransmissão". Sem esse aviso, o amigo afetado só percebe que a experiência dele é pior que a
dos outros, sem saber por quê. A redação evita afirmar CGNAT, que o app não tem como diagnosticar
(spec 0003).

Um painel expandido mostra as métricas por conexão da spec 0003, e é de onde sai o botão
"exportar diagnóstico".

## Fora da v1

Atalho global de transmitir, bandeja do sistema, e escolha manual de qualidade ficam para depois.
Chat de texto, gravação, controle remoto e reações não estão no projeto.

## Pronto quando

- Criar uma Sessão, entrar de outra instância, aprovar, transmitir e assistir funciona ponta a
  ponta.
- Dois Transmissores simultâneos, com troca de Palco por clique.
- O terceiro pedido de transmissão encontra o botão desabilitado.
- O indicador de qualidade reflete uma queda de banda induzida.
