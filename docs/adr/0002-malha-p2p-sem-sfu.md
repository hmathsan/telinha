# Malha P2P com teto rígido, sem SFU

Cada Transmissor abre uma conexão por Espectador e envia uma cópia do fluxo para cada um.
Com 7 Participantes e 720p30 (~2,5 Mbps), isso são ~15 Mbps de upload sustentado por
Transmissor. Aceitamos esse custo porque a alternativa — um SFU — exige uma máquina que não é
de nenhum Participante, o que contradiz a premissa central do projeto.

## Consequências

- Os limites de **7 Participantes** e **2 Transmissores simultâneos** não são metas de
  performance: são constantes explícitas no código. Passar deles exige rever esta decisão.
- 720p30 é teto, não piso. A qualidade cai sozinha sob congestionamento, e a interface precisa
  comunicar isso — senão oscilação de qualidade vai ser lida como defeito.
- Retransmissão por peer (um Participante servindo de relay para os outros) foi considerada e
  rejeitada por especulação. Se a conta de upload não fechar na prática, é a primeira coisa a
  reconsiderar.

## Verificado (setembro de 2026)

Cada `RTCPeerConnection` do Chromium mantém o próprio encoder — são mesmo **6 encodes de 720p30
simultâneos na máquina de quem transmite**. Isso é deliberado e não tem como desligar: cada peer
tem estimativa de banda própria, então um encoder compartilhado não teria a que se adaptar
([RFC 8834](https://datatracker.ietf.org/doc/rfc8834/), e a resposta de Harald Alvestrand na
[discuss-webrtc](https://groups.google.com/g/discuss-webrtc/c/SZAngREoysk)).

A malha sobrevive porque o teto do NVENC subiu: são **12 sessões concorrentes** em GeForce desde
o driver 591.44 (dezembro de 2025), contra 8 em 2024 e 3 antes de março de 2023. Seis cabe
com folga. Intel QuickSync e AMD AMF não têm limite imposto por driver.

**O risco virou outro: driver velho.** Um amigo em driver anterior a março de 2023 tem teto de 3
sessões, e o Chromium cai para OpenH264 por software **em silêncio** — sem exceção, sem evento.
O sintoma é queda de FPS no jogo dele, que ninguém vai associar a este app. E o limite é do
sistema, não do processo: OBS, ShadowPlay ou o próprio Discord consomem sessões junto.

Por isso `encoderImplementation` e `qualityLimitationReason` do `getStats()` entram no
diagnóstico desde o primeiro dia — são a única forma de ver isso acontecer.
