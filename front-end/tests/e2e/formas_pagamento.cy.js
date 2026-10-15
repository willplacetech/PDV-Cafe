const product = { _id: 'produto-1', nome: 'Produto teste', codigo: '1', tipo: 'venda', categoria: 'Bebidas Quentes', preco: 100, estoque: 20, unidadeVenda: 'un' };
const profile = { id: 'payment-admin', role: 'admin', username: 'teste', tenantId: 'tenant-teste' };
const custom = { value: 'personalizado_000000000000000000000001', label: 'Vale Refeição', taxaPercentual: 3, personalizada: true };
const defaults = [
  { value: 'dinheiro', label: 'Dinheiro', taxaPercentual: 0 }, { value: 'pix', label: 'PIX', taxaPercentual: 0 },
  { value: 'cartao_credito', label: 'Cartão de Crédito', taxaPercentual: 2 }, { value: 'cartao_debito', label: 'Cartão de Débito', taxaPercentual: 1 },
  { value: 'credito_loja', label: 'Crédito na Loja', taxaPercentual: 0 },
];

describe('Formas de pagamento cadastradas', () => {
  let methods;
  let commands;
  let receipts;
  beforeEach(() => {
    methods = [...defaults]; commands = []; receipts = [];
    cy.intercept('POST', '**/api/auth/refresh', { token: 'test-token', user: profile });
    cy.intercept('GET', '**/api/**', req => {
      const path = new URL(req.url).pathname;
      if (path.endsWith('/payment-settings')) return req.reply({ formasPagamento: methods });
      if (path.endsWith('/products') || path.endsWith('/products/pdv')) return req.reply([product]);
      if (path.endsWith('/comandas') || path.endsWith('/comandas/a-receber')) return req.reply(commands);
      if (path.endsWith('/mesas')) return req.reply({ mesas: [] });
      if (path.endsWith('/dashboard/delivery')) return req.reply({ totalPedidos: 0, receitaTotal: 0, freteTotal: 0, ticketMedio: 0, porEntregador: [] });
      if (path.endsWith('/dashboard/comparar-vendas')) {
        const periodo = { rotulo: 'Teste', total: 0, pedidos: 0, itens: 0, ticketMedio: 0 };
        return req.reply({ periodoA: periodo, periodoB: periodo });
      }
      if (path.endsWith('/dashboard')) return req.reply({ formasPagamento: methods, taxasCartao: {}, periodos: Object.fromEntries(['dia', 'semana', 'mes'].map(periodo => [periodo, { pedidos: receipts.length, total: receipts.length * 100, recebido: receipts.length * 100, pendente: 0, itens: receipts.length, ticketMedio: 100, maisVendidos: [], produtos: [] }])), relatorioMes: { total: receipts.length * 100, recebido: receipts.length * 100, pendente: 0, pedidos: receipts.length, produtos: [], pagamentos: receipts, status: {}, vendasPorDia: [], clientes: 0 } });
      return req.reply([]);
    });
    cy.intercept('POST', '**/api/payment-settings', req => {
      expect(req.body).to.include({ nome: custom.label, taxaPercentual: 3 });
      methods = [...defaults, { ...custom }];
      req.reply({ statusCode: 201, body: { formaPagamento: custom, formasPagamento: methods } });
    }).as('newMethod');
    cy.intercept('POST', '**/api/comandas', req => {
      const command = { ...req.body, _id: 'comanda-1', numero: '1', status: 'aberta', valorTotal: 100, historicoPagamentos: [], itens: req.body.itens.map((item, index) => ({ ...item, _id: `item-${index}`, nome: product.nome, precoUnitario: 100 })) };
      commands.push(command);
      req.reply({ statusCode: 201, body: command });
    }).as('saveCommand');
    cy.visit('/configuracoes/pagamentos', { onBeforeLoad(win) { win.localStorage.setItem('pdv_user', JSON.stringify(profile)); } });
  });
  const addMethod = () => {
    cy.get('input[placeholder="Nome da forma de pagamento"]').type(custom.label);
    cy.get('input[aria-label="Taxa da nova forma de pagamento"]').clear().type('3');
    cy.contains('button', 'Adicionar forma de pagamento').click();
    cy.wait('@newMethod');
  };

  it('cadastro salvo aparece no encerramento e no dashboard com taxa e líquido', () => {
    addMethod();
    cy.get('.payment-settings-grid article').contains(custom.label).should('be.visible');
    cy.get('#sidebar-desktop').contains('PDV · Nova venda').click();
    cy.get('.product-card').contains(product.nome).click();
    cy.get('.pdv-cart-panel').contains('button', 'Fechar venda').click();
    cy.get('.pdv-payment-dialog').contains('label', 'Forma de pagamento').find('[role="combobox"]').should('not.be.disabled').type(`${custom.label}{enter}`);
    cy.intercept('POST', '**/api/comandas/*/fechar', req => {
      expect(req.body.metodoPagamento).to.equal(custom.value);
      receipts = [{ tipo: custom.value, rotuloPagamento: custom.label, bruto: 100, taxa: 3, total: 97 }];
      req.reply({ comanda: { ...commands[0], status: 'fechada' }, pedido: { _id: 'pedido-1', numero: '1', total: 100 } });
      commands = [];
    }).as('close');
    cy.get('.pdv-payment-dialog').contains('button', 'Confirmar Fechamento').click();
    cy.wait('@close');
    cy.get('.pdv-success-dialog').contains('button', /^Fechar$/).click();
    cy.visit('/dashboard');
    cy.get('.dashboard-monthly').contains('button', 'Mostrar').click();
    cy.get('.dashboard-monthly-row').contains(custom.label).parent().should('contain', '3,00%').and('contain', '97,00');
  });

  it('opção cadastrada permite receber comanda em aberto', () => {
    addMethod();
    cy.visit('/pdv');
    cy.get('.product-card').contains(product.nome).click();
    cy.get('.pdv-cart-panel').contains('button', 'Salvar em aberto').click();
    cy.wait('@saveCommand');
    cy.visit('/contas-receber');
    cy.contains('button', 'Comandas').click();
    cy.contains('button', /^💰 Receber$/).click();
    cy.get('[role="combobox"]').last().type(`${custom.label}{enter}`);
    cy.intercept('PATCH', '**/api/comandas/*/receber-parcial', req => {
      expect(req.body.formaPagamento).to.equal(custom.value);
      req.reply({ ...commands[0], statusPagamento: 'quitado', saldoDevedor: 0, historicoPagamentos: [{ formaPagamento: custom.value, valor: 100, taxaValor: 3, valorLiquido: 97 }] });
      commands = [];
    }).as('receive');
    cy.contains('button', 'Confirmar recebimento').click();
    cy.wait('@receive');
  });

  it('edita taxa da opção e atualiza o cadastro compartilhado', () => {
    addMethod();
    cy.intercept('PATCH', '**/api/contabil/taxas-cartao', req => {
      expect(req.body).to.include({ tipo: custom.value, taxaPercentual: 4 });
      methods = methods.map(method => method.value === custom.value ? { ...method, taxaPercentual: 4 } : method);
      req.reply({ pagamentosAtualizados: 0 });
    }).as('rate');
    cy.get('.payment-settings-grid article').contains(custom.label).closest('article').within(() => {
      cy.contains('button', 'Editar').click();
      cy.get('input[type="number"]').clear().type('4');
      cy.contains('button', 'Salvar alterações').click();
    });
    cy.wait('@rate');
    cy.reload();
    cy.get('.payment-settings-grid article').contains(custom.label).closest('article').should('contain', '4%');
  });

  it('edita nome no card, cancela edição e confirma exclusão', () => {
    addMethod();
    receipts = [{ tipo: custom.value, rotuloPagamento: custom.label, bruto: 100, taxa: 3, total: 97 }];
    const card = () => cy.get('.payment-settings-grid article').contains(custom.label).closest('article');
    card().contains('button', 'Editar').click();
    card().find('input[type="text"]').clear().type('Nome cancelado');
    card().contains('button', 'Cancelar').click();
    card().should('not.contain', 'Nome cancelado');
    cy.intercept('PATCH', '**/api/contabil/taxas-cartao', req => {
      methods = methods.map(method => method.value === custom.value ? { ...method, label: req.body.nome, taxaPercentual: req.body.taxaPercentual } : method);
      req.reply({ formasPagamento: methods });
    }).as('edit');
    card().contains('button', 'Editar').click();
    card().find('input[type="text"]').clear().type('Vale Alimentação');
    card().contains('button', 'Salvar alterações').click();
    cy.wait('@edit');
    const renamed = () => cy.get('.payment-settings-grid article').contains('Vale Alimentação').closest('article');
    renamed().should('contain', '3%');
    cy.on('window:confirm', () => false);
    renamed().contains('button', 'Excluir').click();
    renamed().should('exist');
    cy.removeAllListeners('window:confirm');
    cy.on('window:confirm', () => true);
    cy.intercept('DELETE', `**/api/payment-settings/${custom.value}`, req => {
      methods = methods.filter(method => method.value !== custom.value);
      req.reply({ formasPagamento: methods });
    }).as('delete');
    renamed().contains('button', 'Excluir').click();
    cy.wait('@delete');
    cy.get('.payment-settings-grid').should('not.contain', 'Vale Alimentação');
    cy.reload();
    cy.get('.payment-settings-grid').should('not.contain', 'Vale Alimentação');
    cy.get('.payment-settings-grid article').contains('Cartão de Crédito').closest('article').should('not.contain', 'Excluir');
    cy.visit('/dashboard');
    cy.get('.dashboard-monthly').contains('button', 'Mostrar').click();
    cy.get('.dashboard-monthly-row').contains(custom.label).parent().should('contain', '3,00%').and('contain', '97,00');
  });

  it('mantém o card e a edição quando a API recusa uma alteração ou exclusão', () => {
    addMethod();
    cy.intercept('PATCH', '**/api/contabil/taxas-cartao', { statusCode: 409, body: { msg: 'Nome já cadastrado.' } }).as('editError');
    cy.get('.payment-settings-grid article').contains(custom.label).closest('article').within(() => {
      cy.contains('button', 'Editar').click();
      cy.get('input[type="text"]').clear().type('PIX');
      cy.contains('button', 'Salvar alterações').click();
    });
    cy.wait('@editError');
    cy.get('.payment-settings-grid input[type="text"]').should('have.value', 'PIX');
    cy.get('.payment-settings-grid').contains('button', 'Cancelar').click();
    cy.intercept('DELETE', `**/api/payment-settings/${custom.value}`, { statusCode: 500, body: { msg: 'Falha ao excluir.' } }).as('deleteError');
    cy.on('window:confirm', () => true);
    cy.get('.payment-settings-grid article').contains(custom.label).closest('article').contains('button', 'Excluir').click();
    cy.wait('@deleteError');
    cy.get('.payment-settings-grid').should('contain', custom.label);
  });
});
