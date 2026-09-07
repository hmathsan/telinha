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
- Falta confirmar com o suporte da Cloudflare, por escrito, o que acontece ao estourar a cota em
  conta sem meio de pagamento. A documentação é silenciosa, e a arquitetura de cobrança é
  registrar-e-cobrar, não barrar-antes.
