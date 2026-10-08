# Formas de pagamento personalizadas

Administradores podem acessar **Configurações → Pagamentos**, preencher nome e taxa percentual e clicar em **Adicionar forma de pagamento**. O catálogo salvo aparece no fechamento de vendas e comandas, no recebimento de faturas e comandas em aberto e no dashboard. Operadores consultam o catálogo, mas não podem cadastrar ou editar taxas.

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
