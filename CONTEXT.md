# pvt-broadcast

Compartilhamento de tela P2P entre um pequeno grupo de amigos. Existe para resolver bem
a única coisa que o Discord resolve mal — a qualidade da tela transmitida — e nada além disso.

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
A área principal da janela, ocupada pela Fonte de um único Transmissor por vez. Os demais
Transmissores aparecem como miniaturas, e clicar em uma delas a promove ao Palco.
_Avoid_: Foco, destaque, tela principal, spotlight
