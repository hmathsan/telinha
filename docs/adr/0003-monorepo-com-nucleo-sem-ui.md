# Monorepo, e o núcleo da Sessão não conhece o Electron

O repositório é um monorepo: `apps/desktop` (Electron), `apps/signaler` (Cloudflare Worker) e
`packages/protocol` (as mensagens trocadas entre os dois). O `protocol` compartilhado existe
para que o handshake de versão seja verificável em tempo de compilação — com dois repositórios,
as duas definições divergiriam e o sintoma apareceria como falha de rede entre amigos.

A restrição que sustenta isso: **a lógica de Sessão (roster, aprovação de entrada, ocupação do
palco, handshake) roda em Node puro, sem Electron, sem WebRTC e sem React.** Ela é uma camada
com peers simulados, não um componente de UI.

## Consequências

- Dá para testar a malha de 7 Participantes automaticamente, sem juntar 7 amigos e sem abrir 7
  processos Electron. Os bugs que importam (o quinto peer, o Anfitrião caindo, o handshake
  recusando) viram testes.
- Se a lógica de roster nascer dentro de um componente React, esta opção some para sempre. É por
  isso que a decisão é registrada agora, e não quando o teste for necessário.
- A camada de mídia (captura, encode, exibição) continua sendo validada à mão, com múltiplas
  instâncias na mesma máquina.
