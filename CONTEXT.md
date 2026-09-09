# scrn-broadcast

Compartilhamento de tela P2P entre um pequeno grupo de amigos. Existe para resolver bem
a única coisa que o Discord resolve mal — a qualidade da tela transmitida, som dela incluído —
e nada além disso.

"A tela transmitida" inclui o áudio que sai dela: tela de jogo sem som é a mesma coisa pela
metade, não uma coisa a mais. Já chat, gravação e contas são coisas a mais, e continuam fora —
é esta frase que decide isso quando a dúvida aparecer.

## Language

**Sessão**:
Um encontro efêmero entre Participantes que estão vendo as telas uns dos outros. Não persiste
após o último Participante sair, e não tem canais, salas ou subdivisões.
_Avoid_: Servidor, sala, canal, call, room

**Participante**:
Uma pessoa presente em uma Sessão. Todo Participante é Espectador; alguns também são Transmissores.
_Avoid_: Usuário, membro, peer, cliente

**Transmissor**:
O Participante que está enviando sua tela para os demais. Uma Sessão admite mais de um
Transmissor ao mesmo tempo, até um limite explícito.
_Avoid_: Host, broadcaster, streamer, apresentador

**Espectador**:
O Participante que está recebendo e assistindo à tela de um Transmissor.
_Avoid_: Viewer, receptor, ouvinte

**Fonte**:
O que um Transmissor escolheu enviar: um monitor inteiro ou a janela de uma única aplicação.
_Avoid_: Tela, captura, display, source

**Código de Sessão**:
O segredo curto que um Participante usa para entrar em uma Sessão existente. Nasce com a Sessão
e morre com ela. É a única credencial que existe — não há contas, senhas nem lista de amigos.
_Avoid_: Convite, link, token, ID de sala

**Servidor**:
Reservado exclusivamente para o sentido literal de "uma máquina que não é a de nenhum
Participante". Nunca usado no sentido do Discord (que aqui é Sessão).

**Anfitrião**:
O Participante que criou a Sessão. É a autoridade sobre quem está dentro: aprova as entradas e
detém a lista. Quando o Anfitrião sai, a Sessão deixa de existir.
_Avoid_: Dono, admin, moderador, owner

**Palco**:
A área principal da janela, onde as Fontes dos Transmissores são exibidas. Tem dois modos, Foco
e Grade. Estar "no Palco" é estar sendo exibido em tamanho grande.
_Avoid_: Destaque, tela principal, spotlight

**Foco**:
O modo padrão do Palco: a Fonte de um único Transmissor por vez, com os demais em miniaturas
abaixo. Clicar numa miniatura a promove ao Palco e rebaixa a atual.
_Avoid_: Solo, tela cheia, principal

**Grade**:
O modo alternativo do Palco: todos os Transmissores em células do mesmo tamanho. Quem assiste
escolhe entre Foco e Grade; o alternador só existe com dois ou mais Transmissores.
_Avoid_: Mosaico, tiles, galeria

**Telinha**:
O nome que o app mostra a quem o usa — na Entrada, no título da janela e no atalho instalado.
É só marca: o nome técnico, em toda parte do código e do repositório, é `scrn-broadcast`
(veja a [ADR 0008](./docs/adr/0008-nome-dividido-entre-repositorio-e-marca.md)). Não é sinônimo
de Sessão nem de Palco.
