<div align="center">

# 📺 Telinha

**Compartilhamento de tela direto entre amigos: sem login, sem senha e sem intermediários.**

Abra o app, gere um código e envie no chat. Você aprova quem entra.  
Encerrou a sessão, sumiu tudo — sem rastros em nenhum servidor.

[![Download Windows](https://img.shields.io/github/v/release/hmathsan/telinha?label=Download%20Windows&logo=windows&style=for-the-badge&color=blue)](https://github.com/hmathsan/telinha/releases/latest)
[![Licença: AGPL v3](https://img.shields.io/badge/licen%C3%A7a-AGPL_v3-blue?style=for-the-badge)](LICENSE)

<br/>

<!-- ![O Telinha em uso](docs/assets/telinha.gif) -->

</div>

## 💡 Por que o Telinha existe?

O Discord bloqueou o compartilhamento de tela no Brasil e, de repente, a coisa mais simples do mundo — mostrar a sua tela para alguns amigos — virou um problema.

As alternativas disponíveis pedem conta: cadastro, e-mail, confirmação e senha. Você acaba criando mais um login em um serviço qualquer que nem sabe se vai usar de novo, só para mostrar a tela por vinte minutos. Esse registro fica lá, parado em mais um banco de dados sujeito a vazamentos. Além disso, boa parte dessas ferramentas passa o seu vídeo por um servidor no meio do caminho, o que derruba a qualidade e ainda levanta dúvidas sobre quem pode estar assistindo.

O Telinha faz uma coisa só e faz bem: **a sua tela, com qualidade, direto na máquina de quem está assistindo.**

* **Sem conta, sem senha, sem histórico:** você não precisa de cadastro nenhum.
* **100% P2P:** o vídeo vai direto de ponta a ponta entre vocês.
* **Efêmero:** a sessão acaba e não sobra nenhum rastro.

---

## 💻 Instalação

Compatível com **Windows 10 e 11**.

1. Baixe o instalador na [página de versões mais recentes (Releases)](https://github.com/hmathsan/telinha/releases/latest).
2. Execute o arquivo baixado.
3. Concluída a instalação, **as próximas atualizações serão automáticas**.

> [!NOTE]
> **Aviso "O Windows protegeu o seu computador":**  
> Esse alerta é esperado. A Microsoft cobra mais de US$ 150 por ano para emitir certificados que removem esse aviso, o que é inviável para um projeto gratuito e independente.  
> 
> Não há nada malicioso aqui. Para continuar:
> 1. Clique em **Mais informações**.
> 2. Clique em **Executar assim mesmo**.
> 
> *O código-fonte inteiro está aberto neste repositório caso você queira conferir antes de instalar.*



## ⚡ Como usar em 30 segundos

1. Abra o Telinha e clique em **Criar Sessão**. Um código de 6 dígitos (ex.: `K4M-9TX`) será gerado no topo da tela.
2. Compartilhe o código com os participantes via WhatsApp, Discord ou onde preferir.
3. Cada convidado abre o Telinha, insere o código e solicita entrada. **Você aprova cada participante individualmente.**
4. Clique em **Transmitir** e selecione sua fonte: um monitor inteiro ou a janela de um aplicativo específico.

#### Capacidade e layout:

* **Até 7 pessoas por sessão**, com **até 2 transmissões simultâneas** (ideal para comparar dois jogos ou fluxos de trabalho lado a lado).
* Quem assiste pode alternar livremente entre o **Modo Foco** (uma tela principal em destaque com miniaturas abaixo) ou o **Modo Grade** (todas as telas com o mesmo tamanho).
* **Encerramento:** quando o criador da sala sai, a sessão se encerra para todos. O controle da sessão pertence sempre ao anfitrião. Uma queda de conexão de até um minuto, dele ou de qualquer outra pessoa, não encerra nada: quem caiu volta sozinho, como a mesma pessoa.

![O Palco com uma transmissão](docs/assets/palco.png)

---

## 🛑 O que o Telinha não faz (ainda)

Para alinhar expectativas antes do download:

* **Exclusivo para Windows (por enquanto):** o suporte a macOS e Linux está em desenvolvimento. Acompanhe o [roadmap](#roadmap).
* **Som só no Windows 11:** a Fonte vai com o Som do aplicativo (janela) ou do sistema (monitor) apenas no Windows 11. No Windows 10 ela é transmitida sem Som, e o alternador "Transmitir com Som" aparece desabilitado.
* **Sem chat integrado, gravação ou contas:** o foco do Telinha é exclusivamente o compartilhamento de tela leve e direto. Use seu app de comunicação habitual para conversar por voz ou texto, como o Discord.
* **Limite rígido de 7 pessoas (2 transmitindo):** a arquitetura é 100% P2P direta via WebRTC mesh, sem servidor central intermediando o tráfego de mídia. Cada máquina transmite seus pacotes diretamente a todos os outros participantes. Aumentar esse limite multiplicaria o uso de banda e CPU, exigindo um servidor dedicado (SFU), o que vai contra a proposta de independência da ferramenta.

## 🔒 Privacidade

* **Vídeo 100% ponto a ponto:** o fluxo de vídeo sai diretamente do seu computador para o de quem assiste via WebRTC. Nenhum servidor intermediário armazena ou processa a imagem.
* **Sem cadastro ou contas:** sem e-mail, senha ou banco de dados de usuários. Não há risco de vazamento de credenciais, pois nada é salvo. O código da sessão é efêmero e deixa de existir no instante em que a sala é encerrada.
* **Servidor de sinalização cego e temporário:** o servidor de sinalização atua apenas como um "apresentador" inicial para conectar os participantes. Ele não enxerga a sua tela, não armazena logs de tráfego e encerra seu papel assim que a negociação P2P termina.

> [!IMPORTANT]
> **Visibilidade de IP em conexões diretas:**  
> Como a conexão é feita diretamente entre dispositivos, o seu endereço IP fica visível para os outros participantes da sessão — exatamente como em qualquer protocolo P2P (como torrents ou chamadas diretas).
> 
> O Telinha parte do princípio de que você **só deve compartilhar o código de acesso com pessoas de sua total confiança**.

### 📡 Sobre o sinalizador oficial

O servidor de sinalização padrão pré-configurado no instalador roda em uma conta pessoal da Cloudflare (plano gratuito) e é disponibilizado como cortesia, **sem garantias de disponibilidade**.

* **Limites de uso:** a infraestrutura comporta algumas centenas de sessões diárias. Caso atinja a cota gratuita da Cloudflare, o serviço pausa até a virada do dia (nenhum custo é gerado, mas novas conexões não serão abertas).
* **Quer independência ou estabilidade garantida?** Suba a sua própria instância:
  * O código do sinalizador está disponível em [`apps/signaler`](apps/signaler) e pode ser hospedado em um Cloudflare Worker dentro do plano gratuito.
  * *Observação:* no momento, usar um servidor próprio exige recompilar a aplicação, pois o endpoint é fixado em tempo de build. Tornar esse endereço configurável diretamente pela interface [está planejado no roadmap](#roadmap).

## 🩺 Solução de Problemas (Troubleshooting)

Encontrou algum comportamento inesperado? Veja como resolver os cenários mais comuns:

<details>
  <summary><b>"O Windows protegeu o seu computador" durante a instalação</b></summary>

  O instalador ainda não possui um certificado digital pago (a Microsoft cobra uma anuidade considerável para remover esse aviso).
  
  O código é totalmente aberto e seguro. Para prosseguir:
  1. Clique em **Mais informações**.
  2. Selecione **Executar assim mesmo**.
</details>

<details>
  <summary><b>A janela capturada fica preta ou congelada</b></summary>

  Isso geralmente ocorre com jogos ou programas rodando em **Tela Cheia Exclusiva (Exclusive Fullscreen)**.
  
  **Soluções:**
  - Altere a configuração de vídeo do jogo para **Janela sem Bordas (Borderless Windowed)**.
  - Ou opte por compartilhar a **tela inteira** em vez de selecionar apenas a janela da aplicação.
</details>

<details>
  <summary><b>O amigo se ouve de volta quando eu transmito o monitor</b></summary>

  O Som de um monitor é o Som do sistema inteiro, e isso inclui a voz de quem fala com você no Discord ou em outro app de voz. Ela volta para quem falou pela sua transmissão.

  **Solução:** transmita a **janela do jogo** em vez do monitor. A janela leva só o Som daquele aplicativo. Se não precisar de Som, desligue **Transmitir com Som** no seletor, ou use **Silenciar Som** na barra durante a transmissão.
</details>

<details>
  <summary><b>Transmissão travando, pixelada ou com baixa qualidade</b></summary>

  Abra o painel de **Diagnóstico** dentro do app e verifique o **Encoder** em uso:
  
  - **Encoder em Software (ex.: `OpenH264`):** Sua placa de vídeo não está sendo usada; a CPU está fazendo todo o processamento de codificação.
  - **Encoder em Hardware (ex.: `NVIDIA H.264 Encoder MFT`):** Se mesmo via GPU a imagem estiver ruim, o gargalo é a conexão. Confira o indicador de **perda de pacotes (packet loss)** no diagnóstico.
  
  > ⚠️ **Problemas visuais (telas verdes/artefatos)?**  
  > Em GPUs mais antigas ou com drivers instáveis, a aceleração gráfica pode falhar. Você pode forçar a desativação da aceleração de hardware (válido para quem transmite e assiste) definindo a variável de ambiente:
  > ```bash
  > SCRN_BROADCAST_DISABLE_HW_ACCEL=1
  > ```
  > *Nota: Mantenha ativado se possível, pois desativar sobrecarregará o uso de CPU da máquina.*
</details>

<details>
  <summary><b>"Atualize o aplicativo para entrar nesta Sessão"</b></summary>

  O anfitrião da sessão está utilizando uma versão mais recente do Telinha.
  
  **Como resolver:** Feche o aplicativo completamente e abra-o novamente. A atualização será baixada e aplicada automaticamente.
</details>

<details>
  <summary><b>Falha ao conectar à sessão (não conecta de jeito nenhum)</b></summary>

  Algumas redes (como 4G/5G, CGNAT de provedores de fibra ou redes corporativas restritas) impedem conexões diretas via P2P.
  
  Nesses casos, a conexão depende de um servidor intermediário (*relay/TURN*). Como esse serviço possui uma **cota mensal gratuita limitada**, caso o limite tenha sido atingido, conexões indiretas ficarão indisponíveis temporariamente. Você pode checar no painel de **Diagnóstico** se a sua rota está tentando usar relay.
</details>

<details>
  <summary><b>A sessão encerrou inesperadamente</b></summary>

  O Telinha armazena relatórios locais de execução para depuração:
  
  1. No app, vá em **Diagnóstico** → **Abrir pasta de logs** (ou acesse diretamente pelo Windows: `%APPDATA%\Telinha\logs`).
  2. O arquivo `main.log` registra quedas de conexão, códigos de erro e falhas de negociação de rede (ICE).
  
  🔒 *Privacidade: Nenhum log é enviado para a nuvem. Os dados ficam exclusivamente na sua máquina.*
</details>

---

### 💬 Ainda precisa de ajuda?
Se nenhuma das soluções acima resolveu o problema:
1. Exporte os dados da tela de **Diagnóstico**.
2. Colete o arquivo `main.log`.
3. [abra uma nova issue](https://github.com/hmathsan/telinha/issues/new/choose) descrevendo o ocorrido e anexe ambos os arquivos.

## 🗺️ Roadmap

> Itens organizados por ordem aproximada de prioridade (sem prazos rígidos).

| Status | Funcionalidade | Descrição | Versão Prevista |
| :---: | :--- | :--- | :---: |
| ✅ | **Transmissão P2P** | Streaming direto de vídeo ponto a ponto, sem necessidade de servidor central. | `v1.0.0` |
| ✅ | **Sessões sem autenticação** | Acesso rápido a salas apenas com código de convite, sem necessidade de login. | `v1.0.0` |
| ✅ | **Suporte a áudio** | Transmissão de áudio do sistema operacional ou de janelas específicas junto ao vídeo (Windows 11). | `v1.0.0` |
| 🚧 | **Multiplataforma (macOS & Linux)** | Compatibilidade e empacotamento nativo para macOS e distribuições Linux. | `v1.1.0` |
| 🚧 | **Indicador de conexão relay (TURN)** | Alerta visual explícito quando uma conexão direta P2P falhar (NAT restrito) e exigir intermediário. | `v1.x` |
| 🚧 | **Notificações de atualização** | Alerta visual no app para novas versões disponíveis em vez de updates silenciosos. | `v1.x` |
| 🚧 | **Alternar aceleração por hardware** | Opção nas configurações para ativar/desativar aceleração de GPU facilmente. | `v1.x` |
| 💡 | **Servidor de sinalização customizável** | Possibilidade de configurar URLs de *signaling servers* privados diretamente pela interface. | `v2.x` |
| 🔬 | **Múltiplos participantes por sessão** | *Em pesquisa:* Suporte a múltiplos pares/transmissões por sala (investigando viabilidade via topologia mesh vs. SFU). | `TBD` |

<details>
  <summary><b>Legenda de Status</b></summary>

  - ✅ **Concluído:** Disponível na versão estável.
  - 🚧 **Em desenvolvimento / Próximo:** Planejado ou em implementação ativa.
  - 💡 **Backlog:** Ideia mapeada para versões futuras.
  - 🔬 **Em pesquisa:** Estudo de viabilidade técnica.
</details>

---

<div align="center">

[English](README.en.md)

</div>
