const product = { _id: 'cafe-1', nome: 'Café de teste', codigo: '1', tipo: 'venda', categoria: 'Bebidas Quentes', preco: 6, estoque: 20, unidadeVenda: 'un' };
const customer = { _id: 'interno-1', nome: 'Cliente Interno', clienteInterno: true };
const profile = { id: 'admin-teste', role: 'admin', username: 'teste', tenantId: 'tenant-teste' };
const tables = { mesas: [1, 2].map(numero => ({ id: numero, numero, nome: `Mesa ${numero}`, lugares: 2, ativa: true })) };

describe('Consumo da equipe', () => {
  let commands;
  beforeEach(() => {
    commands = [];
    cy.intercept('POST', '**/api/auth/refresh', { token: 'test-token', user: profile });
    cy.intercept('GET', '**/api/**', req => {
      const path = new URL(req.url).pathname;
      if (path.endsWith('/mesas')) return req.reply(tables);
      if (path.endsWith('/customers')) return req.reply([customer]);
      if (path.endsWith('/comandas')) return req.reply(commands);
      if (path.endsWith('/products') || path.endsWith('/products/pdv')) return req.reply([product]);
      if (path.endsWith('/entregas/estatisticas')) return req.reply({ prontos: 0, despachados: 0 });
      return req.reply([]);
    });
    cy.intercept('POST', '**/api/comandas', req => {
      const itens = req.body.itens.map((item, index) => ({ ...item, _id: `item-${index}`, nome: product.nome, precoUnitario: product.preco }));
      const command = { ...req.body, _id: 'comanda-1', numero: '1', status: 'aberta', itens, utilizacaoInterna: true, createdAt: new Date().toISOString(), valorTotal: 0, saldoDevedor: 0, historicoPagamentos: [] };
      commands.push(command);
      req.reply({ statusCode: 201, body: command });
    }).as('save');
    cy.intercept('PATCH', '**/api/comandas/*/detalhes', req => {
      Object.assign(commands[0], req.body);
      req.reply(commands[0]);
    });
    cy.intercept('POST', '**/api/comandas/*/fechar', req => {
      expect(req.body.operacaoId).to.be.a('string').and.not.be.empty;
      expect(req.body.utilizacaoInterna).to.equal(true);
      expect(req.body.metodoPagamento).to.equal(undefined);
      const command = commands[0];
      req.reply({ comanda: { ...command, status: 'fechada' }, pedido: { ...command, total: 0, status: 'pago', pagamentos: [] } });
      commands = [];
    }).as('close');
    cy.visit('/pdv', { onBeforeLoad(win) { win.localStorage.setItem('pdv_user', JSON.stringify(profile)); cy.stub(win, 'open'); } });
    cy.get('.product-card').contains(product.nome).click();
    cy.get('.pdv-cart-panel [role="combobox"]').first().type(`${customer.nome}{enter}`);
  });

  const panel = () => cy.get('.pdv-cart-panel');

  it('fecha no PDV sem abrir pagamento', () => {
    panel().contains('button', 'Registrar consumo interno').click();
    cy.wait('@save').its('request.body.clienteId').should('equal', customer._id);
    cy.wait('@close');
    cy.get('.pdv-payment-dialog').should('not.exist');
    cy.contains('Consumo interno registrado!').should('be.visible');
    panel().contains('Comanda sem itens').should('be.visible');
  });

  it('retoma resposta incerta com a mesma operação sem abrir pagamento ao trocar de mesa', () => {
    let operation;
    let attempts = 0;
    cy.intercept('PATCH', '**/api/comandas/*/detalhes', { statusCode: 400, body: { msg: 'Comanda já fechada' } });
    cy.intercept('POST', '**/api/comandas/*/fechar', req => {
      attempts++;
      if (attempts === 1) {
        operation = req.body.operacaoId;
        return req.reply({ statusCode: 503, body: { msg: 'Falha temporária na confirmação' } });
      }
      expect(req.body.operacaoId).to.equal(operation);
      req.reply({ comanda: { _id: 'comanda-1', status: 'fechada' }, pedido: { numero: '1', total: 0, utilizacaoInterna: true } });
    });
    panel().contains('button', 'Registrar consumo interno').click();
    cy.contains('O servidor encontrou um problema.').should('be.visible');
    cy.get('.pdv-mesas-trigger').click();
    cy.get('.mesas-drawer-table').contains('Mesa 2').click();
    cy.get('.pdv-payment-dialog').should('not.exist');
    cy.get('#sidebar-desktop').contains('Mesas / Comandas').click();
    cy.get('.mesas-drawer-table').contains('Mesa 2').click();
    cy.location('pathname').should('equal', '/pdv');
    panel().contains('button', 'Retomar consumo interno').click();
    cy.contains('Consumo interno registrado!').should('be.visible');
    cy.then(() => expect(attempts).to.equal(2));
  });

  it('comanda salva como consumo interno fecha sem escolher pagamento', () => {
    panel().contains('button', 'Salvar em aberto').click();
    cy.wait('@save');
    cy.visit('/comandas');
    cy.get('.mesas-overview').contains('button', '#1').click();
    cy.location('pathname').should('equal', '/pdv');
    panel().contains('button', 'Registrar consumo interno').click();
    cy.wait('@close');
    cy.contains('Forma de pagamento').should('not.exist');
  });
});
