# AGPL-3.0, porque o repositório é público por vontade

O repositório nasceu público por restrição técnica ([ADR 0005](./0005-repositorio-publico-por-causa-do-auto-update.md)),
mas a intenção mudou: o app vai ser distribuído para quem tem o mesmo problema, não só para os
amigos do Anfitrião. Isso torna a licença uma decisão de verdade — antes, "o código está aí" teria
bastado.

Escolhemos a **AGPL-3.0** para o repositório inteiro, com um objetivo declarado: quem pegar este
trabalho e distribuir uma versão modificada precisa abrir o que modificou.

## Considerado e rejeitado

- **MIT.** A mais curta e a mais reconhecível, e a que menos serve aqui: permite exatamente o
  fork fechado que queremos impedir.
- **Apache-2.0.** Foi a primeira escolha, por engano nosso: ela protege a **marca** (§6, o fork
  não pode se chamar Telinha) e concede patentes, mas quanto a fechar o código ela é tão
  permissiva quanto a MIT. Marca, além disso, é protegida por direito de marca com ou sem
  licença.
- **GPL-3.0.** Cobre o app desktop, que é o que se distribui, e deixa `apps/signaler` descoberto:
  quem subisse o Worker como serviço para terceiros não deveria nada. Este repositório tem
  cliente **e** Servidor; uma licença só que cobre os dois custa o mesmo arquivo.

## Consequências

- Vale para o repositório todo: `apps/desktop`, `apps/signaler` e `packages/protocol`. Não há
  licenças diferentes por diretório.
- Autohospedar o sinalizador é um caminho previsto e desejado (é a saída quando a cota gratuita
  da conta que hospeda o sinalizador oficial acabar). Quem modificar o Worker e oferecê-lo a
  outras pessoas publica as modificações — que é precisamente o efeito da AGPL sobre software de
  rede, e o motivo de ela ter sido escolhida em vez da GPL.
- A AGPL não limita o autor: os direitos são de quem escreveu, e relicenciar depois continua
  possível. Ela limita terceiros.
- A licença não é um substituto de assinatura de código nem de qualquer garantia — o instalador
  não é assinado, e a AGPL, como toda licença livre, oferece o software "como está".
