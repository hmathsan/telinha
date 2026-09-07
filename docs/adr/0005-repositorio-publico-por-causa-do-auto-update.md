# Repositório público, por causa do auto-update

O `electron-updater` apontado para GitHub Releases em um repositório privado exige um token de
acesso embutido no binário distribuído — que qualquer usuário extrai. As alternativas eram
manter o repositório privado e construir um proxy de download (mais um Servidor para operar) ou
abandonar o auto-update.

Optamos por deixar o repositório público. Não há nada secreto no código: os únicos segredos do
sistema são o Código de Sessão, que é efêmero, e a URL do sinalizador.
