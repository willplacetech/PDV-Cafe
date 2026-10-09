# Formas de pagamento personalizadas

Administradores podem acessar **Configurações → Pagamentos**, preencher nome e taxa percentual e clicar em **Adicionar forma de pagamento**. O catálogo salvo aparece no fechamento de vendas e comandas, no recebimento de faturas e comandas em aberto e no dashboard. Operadores consultam o catálogo, mas não podem cadastrar ou editar taxas.

Cada card de forma personalizada permite **Editar** o nome e a taxa, **Salvar alterações**, **Cancelar** ou **Excluir** após confirmação. A edição salva nome e taxa na mesma transação; nomes repetidos são recusados sem alterar a taxa. A exclusão retira a opção dos próximos recebimentos e preserva os pagamentos já registrados, incluindo seu nome e valores históricos. Cartões de crédito e débito são formas fixas e continuam permitindo somente **Salvar taxa**.

Históricos de comandas, contas a receber e o relatório mensal (inclusive impressão) priorizam o nome registrado no recebimento. Após excluir uma forma, o dashboard recupera o percentual a partir dos valores históricos de taxa e bruto.

Exemplo: Vale Refeição com taxa de 3% registra R$100 de recebimento bruto, R$3 de taxa e R$97 líquidos. O caixa mostra também a composição desses valores. O nome da forma é preservado nos pagamentos e comprovantes.

**Salvar taxa** altera a configuração para os próximos recebimentos e reprocessa os recebimentos do mês atual, no fuso de São Paulo. A configuração e o reprocessamento são transacionais. Meses anteriores mantêm seus valores. Pagamentos de comandas usam seu histórico como fonte única, evitando duplicação no pedido vinculado.

O cadastro valida nomes repetidos sem distinguir maiúsculas ou acentos, taxas de 0% a 100% e limite de 50 formas personalizadas. Códigos personalizados inexistentes são rejeitados no recebimento.

## Verificação

- Integração: 37 testes aprovados nos arquivos `customPaymentMethods`, `paymentIdempotency`, `cancellationFinancial` e `internalCustomer`, com MongoDB de teste em replica set.
- Testes de cálculo financeiro, pagamentos parciais e impressão: 19 aprovados.
- Regressões de interface do fechamento anterior, cancelamento e Cliente Interno: 13 aprovadas com APIs simuladas.
- Nova interface: 3 testes Cypress aprovados para cadastrar, fechar venda com taxa no dashboard, receber comanda e editar taxa.
- ESLint aprovado nos 12 arquivos React e utilitários envolvidos; `git diff --check` sem erros.
- Build de produção aprovado. Testes Cypress de cadastro, recebimento e edição usam APIs simuladas; não substituem a integração real com banco ou uma impressora física.

Nenhuma publicação ou alteração de dados de produção foi executada.

## Validação do CRUD — 09/10/2026

- Sete testes de integração de formas personalizadas passaram, incluindo edição transacional de nome/taxa, nomes duplicados, permissão de administrador, exclusão e preservação do histórico.
- Cinco testes Cypress passaram para cadastro, fechamento, recebimento, edição, cancelamento, confirmação de exclusão e manutenção do card em caso de erro da API. As requisições são simuladas nestes testes de interface.
- Sete regressões Cypress do fechamento de comanda também passaram; 12 testes de interface aprovados no total.
- ESLint de `PaymentSettings.jsx`, `Dashboard.jsx`, `Comandas.jsx` e `ContasReceber.jsx`, build de produção e `git diff --check` passaram.
- A suíte unitária geral teve 86 aprovações e uma falha: `test/deliveryService.test.js` usa `describe` sem defini-lo no executor do Node. O arquivo não foi alterado nesta tarefa.
- A execução geral de integração também encontrou falhas fora do CRUD: `deliveryRoutes.test.js` nos casos “PDV persiste entrega na venda e processa idempotentemente sem bloquear em erro”, “integração da comanda fechada aguarda preparo para produtos A Fazer” e “KDS pode marcar entrega em preparo como pronta antes de fechar a venda”; `reviewRegression.test.js` em “acrescentar e editar fatia conserva peças”; e erro de sintaxe na linha 498 de `api.test.js`. Esses arquivos não foram alterados nesta tarefa.
- Resultado geral de integração: 18 suítes aprovadas, três com falhas; 227 testes aprovados e quatro com falha. A suíte com erro de sintaxe não executou seus testes.
