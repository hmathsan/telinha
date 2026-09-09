# Repositório público, por causa do auto-update

O `electron-updater` apontado para GitHub Releases em um repositório privado exige um token de
acesso embutido no binário distribuído — que qualquer usuário extrai. As alternativas eram
manter o repositório privado e construir um proxy de download (mais um Servidor para operar) ou
abandonar o auto-update.

Optamos por deixar o repositório público. Não há nada secreto no código: os únicos segredos do
sistema são o Código de Sessão, que é efêmero, e a URL do sinalizador.

## A restrição virou intenção

O parágrafo acima descreve como a decisão foi tomada, e ele deixou de ser o motivo pelo qual ela
se sustenta. O repositório é público também — hoje, principalmente — porque o app se destina a
quem tem o mesmo problema que ele resolve, e não apenas ao grupo de amigos que o originou. Se o
auto-update deixasse de exigir repositório público amanhã, a decisão não mudaria.

Isso tem consequências que a versão original desta ADR não previa: o sinalizador oficial atende
desconhecidos numa conta gratuita, o canal de suporte são as issues deste repositório, e a
licença passou a ser uma escolha ([ADR 0009](./0009-licenca-agpl-3.md)) em vez de uma formalidade.

## Correção: a URL do sinalizador nunca foi um segredo

O último parágrafo original diz que os únicos segredos do sistema são o Código de Sessão e a URL
do sinalizador. A segunda metade está errada, e vale corrigir porque ela induz a decisões ruins
(como tentar proteger a URL escondendo o DevTools).

A URL é injetada em build time e vai inteira dentro do `app.asar`, de onde sai em segundos; o
processo principal ainda a entrega ao renderer por IPC, e qualquer captura de rede vê o `wss://`.
Ela é um endereço público, e o que protege o sinalizador de abuso é limite de taxa no próprio
Worker — não obscuridade no cliente.

O Código de Sessão continua sendo o único segredo do sistema.
