# Cliente Interno — validação em 8 de outubro de 2026

O cadastro cria automaticamente um único Cliente Interno para consumo da equipe. A seleção no PDV permite registrar ou salvar o atendimento sem pagamento. O fechamento baixa estoque, preserva o custo histórico, não gera dívida nem fidelidade e fica fora dos indicadores de vendas e lucro. O DRE e o CSV apresentam o custo separado como Consumo da equipe. O registro pode ser retomado com a mesma operação após uma resposta incerta.

## Validação da alteração

- `npm --prefix back-end run test:integration -- --runTestsByPath tests/integration/internalCustomer.test.js`: 7 testes passaram. Cobrem cadastro único e protegido, bloqueio de pagamento, fechamento idempotente, troca de cliente, pedidos diretos, custos históricos no DRE e exclusão dos indicadores e rankings.
- `npm --prefix front-end run test:frontend -- --spec tests/e2e/consumo_interno.cy.js --config baseUrl=http://127.0.0.1:5173`: 3 testes passaram. Cobrem fechamento direto, retomada após falha com a mesma operação e sem abrir pagamento ao trocar de mesa, e salvar/reabrir uma comanda interna.
- ESLint dos arquivos React modificados: passou sem erros ou avisos.
- Build do frontend: passou.
- `git diff --check`: passou.
- Revisão independente do código: os problemas encontrados na retomada pelo painel e em dois indicadores de vendas foram corrigidos; revisão final sem novos problemas prioritários.

O Cypress foi executado com `ELECTRON_RUN_AS_NODE` removido somente do processo de teste e com os diretórios do Windows adicionados ao PATH desse processo. Nenhuma configuração global foi alterada.

## Limitações da verificação geral

As verificações gerais também foram executadas e não estão integralmente verdes. Os problemas fora do fluxo de consumo interno foram preservados para manter o escopo da alteração:

- `npm test`: 86 testes unitários passaram e `back-end/test/deliveryService.test.js` falhou porque usa `describe` sem defini-lo no runner do Node. O arquivo não foi alterado.
- Integração completa do backend: 219 testes passaram, 4 falharam, e 3 das 20 suítes falharam. `api.test.js` tem erro de sintaxe na linha 498, sem alterações neste trabalho. Em `deliveryRoutes.test.js`, falharam “PDV persiste entrega na venda e processa idempotentemente sem bloquear em erro”, “integração da comanda fechada aguarda preparo para produtos A Fazer” e “KDS pode marcar entrega em preparo como pronta antes de fechar a venda”. Em `reviewRegression.test.js`, falhou “acrescentar e editar fatia conserva peças”.
- Testes unitários do frontend: 67 passaram e 6 falharam em `regressions.test.js`: cliques repetidos ao abrir comanda, cupom escapado, vendas offline consecutivas, conexão normalizada com status 0 e 408, e preservação dos dados de entrega offline. As falhas incluem bindings ausentes (`subtotal` e `clienteTemEnderecoCadastrado`) e uma expectativa antiga de impressão.
- Lint completo do frontend: 9 erros e 1 aviso em arquivos fora da alteração, incluindo `CentralDoDia.jsx`, `Entregas.jsx` e `offlineStore.js`. O lint dos arquivos modificados passou.
- E2E geral de comanda: os cenários de fechamento e atendimento passaram; continuaram falhando os casos “Dashboard aparece primeiro no Atendimento e Produção permanece na mesma tela” e “Delivery mostra carregamento, permite repetir falha e troca o período”, que procuram links de Dashboard ausentes no menu.

Os testes usam MongoDB isolado e serviços simulados no navegador. Não houve publicação, acesso ao banco de produção ou validação de impressora física. Produtos sem custo cadastrado permanecem sinalizados pelo DRE; registros antigos sem custo histórico usam o cálculo legado.
