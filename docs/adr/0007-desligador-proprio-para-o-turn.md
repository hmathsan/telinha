# Desligador próprio para o TURN

O Cloudflare Realtime TURN cobre relay com 1.000 GB por mês grátis — folgado para o consumo
estimado de 40 a 100 GB. Mas **a Cloudflare não tem teto de gasto**: os alertas de orçamento são
explicitamente informativos e não pausam nada. Acima da cota, são US$ 0,05 por GB de egresso, e o
que segura isso é código nosso.

O sinalizador emite as credenciais TURN e é onde o desligador vive: ele consulta o dataset
GraphQL `callsTurnUsageAdaptiveGroups` (latência de ~30 segundos) para o egresso acumulado do
mês e, passando do limite configurado, para de emitir credenciais e devolve só STUN. Quem precisa
de relay deixa de conectar, e isso é preferível a uma fatura surpresa.

## Consequências

- O token da API TURN vive só no sinalizador. Embutido no app, sai de um `.asar` em segundos.
- Credenciais são de vida curta (minutos, não as 48 horas máximas) e carregam `customIdentifier`
  por Participante, que é o que permite ver quem consumiu o quê nas análises.
- A conta que hospeda o sinalizador oficial **não tem meio de pagamento cadastrado**. Essa é a
  única coisa nesta arquitetura que a Cloudflare respeita como teto de gasto de verdade: sem
  cartão, o pior caso do estouro é o serviço parar, não uma fatura. O desligador deste ADR
  continua valendo como primeira linha, e deixa de ser a única.
- O limite passou de 80 para **900 GB/mês**. Os 80 foram calibrados para sete amigos e um consumo
  estimado de 40 a 100 GB; com o app distribuído publicamente ([ADR 0005](./0005-repositorio-publico-por-causa-do-auto-update.md)),
  eles desligariam o relay para todo mundo a 8% de uma franquia gratuita de 1.000 GB — sem nenhum
  centavo gasto. Os 900 usam a franquia e mantêm margem para a latência de ~30 segundos do dataset
  de analytics.
