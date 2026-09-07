# 0004 — Interface

Define as telas do app. A referência visual é o Discord em Go Live, sem a barra de servidores e
sem a lista de canais.

## Telas

**Entrada.** Campo de nome, botão "Criar Sessão" e campo de Código de Sessão com botão "Entrar".
Nada mais. O nome fica salvo localmente.

**Sessão.** Uma área principal (o Palco), uma faixa de miniaturas e uma lista lateral de
Participantes.

## Palco

Com zero Transmissores, o Palco mostra um estado vazio e o botão de transmitir.

Com um ou dois Transmissores, o primeiro ocupa o Palco e o outro fica como miniatura. Clicar
numa miniatura a promove ao Palco e rebaixa a atual. Duplo clique no Palco entra em tela cheia.

720p espremido em meia tela desperdiça exatamente a qualidade que o projeto foi buscar — por
isso Palco único, e não grade.

## Transmitir

O botão abre o seletor de Fonte: uma grade de miniaturas com monitores e janelas de aplicação,
atualizada enquanto está aberta.

Com `MAX_TRANSMISSORES` vagas ocupadas, o botão fica desabilitado exibindo "2/2 transmitindo".
Sem fila: quem quiser a vaga pede pela voz.

## Lista de Participantes

Nome de cada um, e um ponto indicando quem está transmitindo. Para o Anfitrião, cada linha tem
"expulsar".

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
