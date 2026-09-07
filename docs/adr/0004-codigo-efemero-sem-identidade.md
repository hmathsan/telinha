# Código de Sessão efêmero, e nenhuma identidade persistente

O Código de Sessão nasce quando o Anfitrião abre a Sessão e morre com ela. Não há contas, senhas,
chaves nem lista de amigos: o Participante digita um nome livre, e o Anfitrião aprova a entrada
olhando para ele.

O nome digitado não autentica nada — e não precisa. Quem gate a entrada são o código (um segredo
de curta duração) e a aprovação manual. Para se passar por um amigo, um atacante precisaria
interceptar o código dentro da janela em que a Sessão existe, e o Anfitrião ainda consegue
simplesmente contar quantas pessoas convidou.

## Considerado e rejeitado

- **Nome do PC (hostname)** em vez de nome digitado: igualmente falsificável em um cliente
  modificado, vaza o nome real das pessoas para toda a malha, e metade dos PCs se chama
  `DESKTOP-K3J8F2`.
- **Par de chaves local com confiança no primeiro uso**, mostrando "dispositivo conhecido" na
  aprovação: ~40 linhas com WebCrypto e não exige Servidor nem contatos persistentes. Rejeitado
  apenas porque o código é efêmero. **Se um dia o Código de Sessão virar reutilizável, esta
  decisão precisa ser revista — aí a identidade passa a importar de verdade.**
