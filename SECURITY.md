# Segurança

## Como reportar

**Não abra uma issue pública.** Use o
[reporte privado de vulnerabilidade](https://github.com/hmathsan/scrn-broadcast/security/advisories/new)
do GitHub. Só quem mantém o projeto vê o relato.

Inclua o que for possível:

- o que um atacante consegue fazer, e de onde (outro Participante, alguém com o Código de Sessão,
  qualquer um na internet);
- os passos para reproduzir;
- a versão do Telinha, ou o commit, se o problema for no sinalizador.

O Telinha é um projeto mantido por uma pessoa no tempo livre. A resposta inicial deve sair em
até uma semana. A correção depende da gravidade, e você recebe o crédito no aviso publicado, se
quiser.

## Versões cobertas

Só a última release. O app se atualiza sozinho, e o sinalizador recusa versões antigas do
protocolo, então não há correção para versões anteriores.

## O que interessa

- **Sinalizador** ([`apps/signaler`](apps/signaler)): entrar numa Sessão sem a aprovação do
  Anfitrião, adivinhar ou enumerar Códigos de Sessão, se passar por outro Participante,
  derrubar a Sessão de outra pessoa, ou contornar o limite de taxa.
- **Protocolo** ([`packages/protocol`](packages/protocol)): mensagens que escapam da validação
  e levam a estado inválido.
- **App desktop** ([`apps/desktop`](apps/desktop)): um Participante executando código, lendo
  arquivos ou capturando algo além da Fonte escolhida na máquina de outro; abuso do IPC ou do
  preload; o auto-update instalando algo que não veio das releases deste repositório.

## O que não é vulnerabilidade

Estas coisas são conhecidas e decididas. Não precisa reportar:

- **O seu IP fica visível para os outros Participantes.** É o preço da conexão direta, e o
  [README](README.md#-privacidade) avisa. Compartilhe o Código só com quem você confia.
- **O instalador não tem assinatura de código** e dispara o aviso do SmartScreen. É questão de
  custo, não de segurança.
- **Quem tem o Código consegue pedir para entrar.** É o desenho: o Código não é senha, e quem
  decide é o Anfitrião, que aprova cada pedido
  ([ADR 0004](docs/adr/0004-codigo-efemero-sem-identidade.md)).
- **O sinalizador oficial pode ficar fora do ar** quando a cota gratuita da Cloudflare acaba.
