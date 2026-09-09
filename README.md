<div align="center">

# Telinha

**Compartilhamento de tela entre amigos, direto, sem conta e sem senha.**

Você abre, gera um código de seis dígitos, manda no chat. Quem chegar, você aprova.
Acabou a Sessão, acabou tudo — não sobra nada em servidor nenhum.

</div>

![O Telinha em uso](docs/assets/telinha.gif)

## Por que isto existe

O Discord bloqueou o compartilhamento de tela no Brasil, e de repente a coisa mais simples do
mundo — mostrar a sua tela para quatro amigos — virou um problema.

As alternativas pedem conta. Cadastro, e-mail, senha, às vezes cartão. Você cria mais um login
para mostrar uma tela por vinte minutos, e esse login fica lá, num banco de dados que um dia
vaza. Já vazou tantos. E boa parte delas ainda passa o seu vídeo por um servidor no meio do
caminho, o que significa que a qualidade piora e alguém, em tese, poderia estar olhando.

O Telinha faz uma coisa só e faz bem: **a sua tela, com qualidade, direto na máquina de quem
está assistindo.** Sem conta, sem senha, sem histórico. O vídeo vai ponto a ponto entre vocês.

## Instalar

Baixe o instalador da [última release](https://github.com/hmathsan/scrn-broadcast/releases/latest)
e execute. Windows 10 ou 11.

> **O Windows vai dizer "O Windows protegeu o seu computador".**
> É esperado. O instalador não é assinado — um certificado custa algumas centenas de dólares por
> ano, e este projeto é gratuito e não gera receita. Clique em **Mais informações** e depois em
> **Executar assim mesmo**. O código-fonte inteiro está neste repositório, se você quiser
> conferir antes.

Depois da primeira instalação, as atualizações são silenciosas: chegam sozinhas e valem no
próximo início.

## Usar, em trinta segundos

1. Abra o Telinha e clique em **Criar Sessão**. Você recebe um código de seis dígitos, tipo
   `K4M 9TX`.
2. Mande o código para quem você quer chamar — WhatsApp, Discord, onde for.
3. Cada pessoa abre o Telinha, digita o código e pede para entrar. **Você aprova, uma por uma.**
4. Clique em **Transmitir** e escolha o que mostrar: um monitor inteiro ou a janela de um
   programa só.

Até **sete pessoas** por Sessão, e **duas transmitindo ao mesmo tempo** — dá para mostrar dois
jogos lado a lado. Quem assiste escolhe entre ver uma tela grande com miniaturas embaixo, ou
todas do mesmo tamanho numa grade.

Quando você, que criou a Sessão, sai, a Sessão acaba para todo mundo. É de propósito.

![O Palco com uma transmissão](docs/assets/palco.png)

## O que ele não faz

Vale dizer antes de você baixar:

- **Windows apenas.** macOS e Linux estão no roteiro, não no presente.
- **Vídeo, sem áudio.** O som ainda vai pelo Discord, ou por onde vocês já conversam. É a
  próxima coisa a ser feita.
- **Sem chat, sem gravação, sem contas.** Não é esquecimento: é escopo. Chat vocês já têm.
- **Sete pessoas, duas transmitindo.** Não é um número tímido — é o limite do desenho ponto a
  ponto, onde cada máquina fala direto com todas as outras. Passar disso exigiria um servidor de
  vídeo no meio, que é exatamente o que este projeto não quer ter.

## Privacidade, concretamente

- **O vídeo nunca passa por um servidor.** É WebRTC ponto a ponto: sai da sua máquina e chega na
  de quem assiste.
- **Não existe conta.** Nada para vazar, porque nada é guardado. O único segredo do sistema é o
  código da Sessão, e ele morre junto com ela.
- **O sinalizador** — o servidorzinho que apresenta os participantes uns aos outros no começo —
  **não vê a sua tela.** Ele repassa mensagens de negociação e some quando a Sessão termina. Não
  guarda histórico e não persiste nada.
- A única coisa que os participantes veem uns dos outros é o endereço IP, o que é inerente a
  qualquer conexão direta.

### Sobre o sinalizador oficial

O sinalizador que vem configurado no instalador roda na minha conta da Cloudflare, no plano
gratuito, e é oferecido sem garantia nenhuma. Ele aguenta algumas centenas de Sessões por dia; se
passar disso, para até o dia seguinte — não gera cobrança para ninguém, mas também não abre
Sessão.

Se você quiser garantia, **suba o seu**: [`apps/signaler`](apps/signaler) é um Cloudflare Worker
que roda no plano gratuito. Por enquanto isso exige recompilar o app, porque o endereço do
sinalizador é definido em tempo de build — deixar isso configurável está no roteiro.

## Quando algo dá errado

**Uma borda amarela em volta da janela transmitida.**
Não é bug e não sai. É o Windows avisando que a janela está sendo capturada; o Telinha usa a API
que o Windows exige para capturar janelas de jogo corretamente, e ela vem com essa borda. Em
alguns sistemas ela não aparece.

**"O Windows protegeu o seu computador" na instalação.**
Instalador não assinado. Mais informações → Executar assim mesmo. Veja a seção de instalação.

**A janela que escolhi aparece preta ou congelada.**
Costuma ser jogo em tela cheia exclusiva. Mude o jogo para "janela sem bordas", ou transmita o
monitor inteiro em vez da janela.

**A transmissão trava, fica pixelada ou embaçada.**
Abra o diagnóstico no app e olhe o **encoder em uso**. Se estiver em software (algo como
`OpenH264`), a sua placa de vídeo não está ajudando e o processador está codificando no braço —
o resultado é exatamente esse. Se estiver em hardware e ainda assim ruim, o gargalo é a rede: o
diagnóstico mostra a perda de pacotes.

Em placas antigas ou com driver problemático, a aceleração por hardware às vezes atrapalha mais
do que ajuda — quadros verdes, artefatos, imagem congelada. Dá para desligá-la definindo a
variável de ambiente `SCRN_BROADCAST_DISABLE_HW_ACCEL=1` antes de abrir o app; ela vale para os
dois lados, quem transmite e quem assiste. Deixar a aceleração ligada é quase sempre melhor: sem
ela, o processador faz todo o trabalho e o computador esquenta.

**"Atualize o aplicativo para entrar nesta Sessão".**
Alguém está numa versão mais nova. Feche o Telinha e abra de novo — a atualização baixa sozinha e
se aplica no início.

**Não conecta de jeito nenhum.**
Algumas redes (principalmente internet móvel e certos provedores de fibra) não deixam duas
máquinas se acharem diretamente, e a conexão precisa de um intermediário. O Telinha usa um, mas
ele tem cota mensal. Se ela acabar, essas redes param de conectar até virar o mês. O diagnóstico
mostra se a sua conexão está passando por esse caminho.

**A Sessão terminou sozinha, e ninguém sabe por quê.**
O Telinha grava um log local do que aconteceu. Abra o diagnóstico e clique em **Abrir pasta de
logs** — ou vá direto a `%APPDATA%\Telinha\logs`. O arquivo `main.log` tem as quedas de
conexão com código e motivo, as falhas de ICE e os erros que o app não conseguiu mostrar na tela.
Nada dele sai da sua máquina: quem manda o arquivo para alguém é você.

Se nada disso resolveu, [abra uma issue](https://github.com/hmathsan/scrn-broadcast/issues/new/choose)
e **anexe o diagnóstico exportado e o `main.log`** — sem eles, quase todo problema vira adivinhação.

## Roteiro

Em ordem aproximada de importância, sem prazo:

- **Áudio na transmissão.** Tela de jogo sem som é meia solução, e para muita gente é o que
  decide entre usar e não usar.
- **macOS e Linux.**
- **Dizer na tela quando a conexão precisa de intermediário e ele não está disponível**, em vez
  de simplesmente não conectar.
- **Avisar que uma atualização chegou**, em vez de aplicá-la em silêncio.
- **Ligar e desligar a aceleração por hardware pelo app**, sem variável de ambiente.
- **Escolher o sinalizador dentro do app**, para quem sobe o seu não precisar recompilar.
- **Instalador assinado**, se um dia o número de pessoas justificar o custo.
- **Mais gente por Sessão** — em estudo, e honestamente difícil: como cada máquina fala direto
  com todas as outras, o custo cresce depressa. Passar de sete exigiria um servidor de vídeo no
  meio, que muda a natureza do projeto.

---

<div align="center">

[English](README.en.md)

</div>
