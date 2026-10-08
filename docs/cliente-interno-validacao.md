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

## Restauração do fechamento da comanda — 08/10/2026

O fechamento normal no PDV voltou a mostrar os itens, subtotal, taxa de entrega, desconto em reais, total a receber, forma de pagamento, nome e telefone opcionais. O comprovante usa o telefone informado ao acionar “Enviar pelo WhatsApp”. A opção manual “Utilização interna” foi removida do fechamento legado; Cliente Interno continua identificado automaticamente.

Desconto e contato são preservados na retomada de confirmação incerta, junto com a mesma operação financeira. O nome informado é salvo na comanda mesmo quando não há telefone.

Validação: três testes Cypress de fechamento normal e três de consumo interno passaram, com API simulada. Foram conferidos o desconto e destino do WhatsApp, retomada com payload idêntico, nome sem telefone e os fluxos automáticos do Cliente Interno. ESLint de PDV.jsx/Comandas.jsx, build de produção e `git diff --check` passaram. O teste simula a abertura do WhatsApp; não envia mensagens reais. As limitações gerais acima continuam registradas e a suíte completa não foi repetida nesta correção.

## Restauração do cancelamento da comanda — 08/10/2026

A ação “Cancelar comanda” foi recolocada na comanda atual do PDV, com confirmação. Comandas salvas usam a rota existente de cancelamento, que valida pagamentos e devolve estoque; rascunhos são descartados localmente. A interface preserva os itens quando a API rejeita o cancelamento e bloqueia a ação enquanto um fechamento aguarda confirmação.

Validação: três testes Cypress de cancelamento passaram (salva, rejeição e desistência/descarte de rascunho), assim como os três testes de fechamento e os três de consumo interno. Os dez testes de integração existentes em `cancellationFinancial.test.js` passaram com MongoDB isolado, incluindo proteção de recebimentos e devolução de estoque. ESLint de PDV.jsx, build e `git diff --check` passaram. Não houve alteração no backend nem acesso à produção.

## Fluxo de encerramento baseado na branch Compras — 08/10/2026

Referência consultada: `Compras:front-end/src/pages/Comandas.jsx`, commit `3d284d818b150afd89b4ff2874ff6dc9dcbd6f0a`, igual à referência local `origin/Compras` na consulta. O fluxo foi adaptado à tela atual do PDV, sem trocar a branch nem mesclar módulos de compras.

O modal segue o modelo de identificação da comanda, resumo com modificadores, desconto ao lado do total ou saldo recebido, seleção explícita de pagamento e confirmação do fechamento. O sucesso identifica comanda e pedido; permite completar nome/telefone e salvar o cadastro ao compartilhar o comprovante, imprimir cupom com número da comanda, emitir NFC-e e abrir DANFE PDF. Emissão fiscal continua sendo uma ação explícita na API existente. Cliente Interno fecha automaticamente sem opções fiscais; o cancelamento restaurado permanece disponível antes do fechamento.

Na revisão, foram corrigidos dois casos: respostas fiscais atrasadas não alteram o modal de outra venda e descontos não podem reduzir o total abaixo dos pagamentos reais recebidos. A segunda regra também foi aplicada à API, preservando comanda e estoque na rejeição.

Validação: 13 testes Cypress passaram (7 de fechamento, 3 de cancelamento e 3 de consumo interno), incluindo contato após fechar, fluxo fiscal simulado, resposta fiscal atrasada, seleção obrigatória de pagamento e desconto em comanda parcialmente recebida. Os 18 testes de integração de cancelamento financeiro e Cliente Interno passaram com MongoDB isolado. ESLint dos arquivos React modificados, build de produção e `git diff --check` passaram. Não houve publicação, emissão fiscal real, envio de WhatsApp real nem repetição da suíte geral.
