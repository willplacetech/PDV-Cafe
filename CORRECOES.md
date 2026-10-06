# Correções da revisão — 03/10/2026

As correções foram feitas no código local. Nenhum deploy foi realizado e nenhum banco de produção foi acessado. O relatório `REVISAO_GERAL.md` registra os achados anteriores às correções; suas referências de linha são históricas.

## Problemas tratados

| Achados | Correção | Arquivos principais |
|---|---|---|
| 1–2 | Remoção da chave JWT pública e da senha administrativa padrão. Chave configurada é preservada; sem configuração, uma chave aleatória é persistida no banco. Provisionamento administrativo centralizado, sem alterar contas existentes. | `back-end/utils/authConfig.js`, `back-end/utils/provisionarAdmin.js`, `back-end/server.js`, `back-end/db.js`, `back-end/middleware/auth.js` |
| 3–4 | Escape de campos em documentos de impressão; validação de login e tratamento de erros assíncronos em autenticação e emissão fiscal. | `front-end/src/pages/PDV.jsx`, `Dashboard.jsx`, `ContasReceber.jsx`, `utils/notaVenda.js`; `back-end/routes/auth.js`, `fiscal.js` |
| 5–6 | Pagamento parcial vazio ou zero é rejeitado em Contas a Receber, conforme o fluxo atualizado do remoto. Exclusão, edição e transferência recalculam totais e saldo; alterações que reduzem a comanda abaixo do já recebido são rejeitadas. | `front-end/src/pages/ContasReceber.jsx`, `back-end/routes/comandas.js` |
| 7–13 | Peso zero permanece esgotado; movimentos preservam peso, peças e ingredientes efetivamente consumidos. Cancelamentos devolvem esse consumo. Compra rejeita alteração de embalagem incompatível com saldo existente. Acréscimos usam os mesmos cálculos da criação. | `back-end/utils/movimentarEstoqueVenda.js`, `estoqueProduto.js`, `estoqueInsumo.js`; `routes/comandas.js`, `orders.js`, `purchases.js`; modelos |
| 14 | Botão bloqueado durante envio; chave de idempotência com índice único impede repetir a mesma abertura e baixa de estoque. | `front-end/src/pages/PDV.jsx`, `back-end/routes/comandas.js`, `back-end/models/Comanda.js` |
| 15 | Autorização fiscal exige resposta completa, chave e protocolo. Reserva atômica impede emissão simultânea; respostas pendentes ou incertas permanecem em processamento. | `back-end/routes/fiscal.js`, `back-end/utils/nfce.js`, `back-end/models/Order.js` |
| 16–19 | Taxas usam o campo persistido correto; imposto deixa de ser deduzido duas vezes; recebido líquido subtrai taxas; remover item recalcula promoção de grupo. | `back-end/routes/contabil.js`, `front-end/src/pages/Dashboard.jsx`, `PDV.jsx` |
| 20 | Mesas persistidas por API autenticada e compartilhadas com atendimento; sucesso somente após confirmação do servidor. | `back-end/routes/mesas.js`, `back-end/models/MesasSettings.js`, `front-end/src/pages/MesasCadastro.jsx`, `Comandas.jsx` |

Também foram restringidas as origens CORS, desativado cache de respostas autenticadas no PWA, registrados custos históricos para novas vendas, ajustadas recorrências para meses curtos, incluídos os testes antes excluídos e corrigidos problemas apontados pelo lint. Dependências transitivas foram atualizadas; Jest foi atualizado apenas como ferramenta de desenvolvimento.

## Verificação

- `npm test`: 66 testes unitários e 66 testes Jest, em sete suítes, aprovados. Integrações usam MongoDB temporário com transações reais, sem conexão ao banco operacional.
- `npm run test:frontend:unit`: nove regressões aprovadas, incluindo impressão, pagamento parcial, promoções, idempotência e persistência de mesas.
- `npm run lint`: aprovado.
- `npm --prefix front-end run build`: aprovado; permanece aviso de tamanho do bundle JavaScript, sem falha na compilação.
- `npm --prefix back-end audit` e `npm --prefix front-end audit`: zero vulnerabilidades conhecidas nas dependências instaladas, incluindo desenvolvimento, na data da verificação.
- A especificação `front-end/tests/e2e/regressao_segura.cy.js`: três testes aprovados no navegador, com chamadas de API interceptadas. As demais especificações dependem de ambiente e credenciais próprios.

## Cuidados ao aplicar

Contas e senhas existentes foram preservadas. Uma instalação que ainda use a antiga chave JWT pública exigirá novo login após a atualização. Um banco novo exige `ADMIN_PASSWORD` de pelo menos 12 caracteres; consulte `back-end/.env.example`. Senhas fracas já existentes não foram rotacionadas automaticamente.

Notas com resultado pendente ou incerto precisam ser consultadas no provedor antes de qualquer nova emissão. A integração não dispõe de contrato universal para conciliação automática. Documentos antigos marcados como autorizados sem chave/protocolo também exigem conciliação.

Custos e consumo históricos ausentes em vendas antigas não podem ser reconstruídos com certeza. Esses registros mantêm o tratamento de compatibilidade; novas vendas registram os dados necessários. Não foi executada migração em massa ou reescrita de dados operacionais.

Os testes locais reduzem o risco de regressão; não substituem homologação com o provedor fiscal real, a configuração de hospedagem e uma cópia isolada dos dados usados na operação.

## Integração com origin/Compras

Integrados os dez commits remotos até `d58d736`, preservando o commit local de correções `483568e`. Resolvidos conflitos em `back-end/server.js` e nos componentes/páginas `Toast.jsx`, `Caixa.jsx`, `Comandas.jsx` e `PDV.jsx`. Foram mantidas as mudanças remotas de caixa, monitoramento e edição de quantidades, junto às correções locais de autenticação, estoque, mesas, impressão e idempotência. O pagamento parcial permanece em Contas a Receber; os testes foram adaptados para esse fluxo. Validação após integração: 144 testes aprovados, lint e build aprovados.
