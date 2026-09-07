# 0006 — Testes

Define como validar uma malha de sete pessoas sem juntar sete pessoas.

## Núcleo da Sessão: automatizado

A máquina de estados de `packages/protocol` é uma função pura e roda em `node --test`, sem
Electron, sem React e sem WebRTC. Os Participantes são objetos simulados.

Cobre: admissão e recusa, o oitavo Participante, o terceiro pedido de Palco, expulsão, saída do
Anfitrião, e a recusa por versão incompatível. Estes são os bugs que aparecem só com a malha
cheia, e são exatamente os que você não conseguiria reproduzir chamando amigos.

Isso só continua possível enquanto a lógica de roster ficar fora dos componentes React — veja a
[ADR 0003](../adr/0003-monorepo-com-nucleo-sem-ui.md).

## Sinalizador: automatizado

Testes de integração contra `wrangler dev` com clientes WebSocket simulados. Mesmos cenários,
agora atravessando o Durable Object.

## Mídia: manual

Múltiplas instâncias do app na mesma máquina contra um sinalizador local. Valida captura,
encode, exibição, troca de Palco e reconexão.

Uma advertência: rodar sete instâncias na sua máquina concentra todos os encodes numa GPU só, o
que pode ser justamente o limite investigado na spec 0003. Trate um resultado ruim como possível
artefato do teste até confirmar com máquinas separadas.

## Pronto quando

- `npm test` roda o núcleo e o sinalizador sem instalar Electron e sem rede externa.
- Existe um roteiro escrito para a validação manual de mídia, com o que observar em cada passo.
