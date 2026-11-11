const product = {
  _id: 'produto-role-e2e',
  nome: 'Café operacional',
  categoria: 'Bebidas Quentes',
  tipo: 'venda',
  tipoProduto: 'revenda',
  preco: 12,
  estoque: 20,
  unidadeVenda: 'un',
};
const kitchenProduct = {
  _id: product._id,
  nome: product.nome,
  categoria: product.categoria,
  tipo: product.tipo,
  tipoProduto: product.tipoProduto,
  unidadeVenda: product.unidadeVenda,
};
const tables = { mesas: [{ id: 'mesa-1', numero: 1, nome: 'Mesa 1', ativa: true }], oferecerBalcao: true };
const kitchenCommand = {
  _id: 'comanda-cozinha-e2e',
  numero: '0001',
  tipoAtendimento: 'mesa',
  mesa: '1',
  status: 'aberta',
  itens: [{ _id: 'item-cozinha-e2e', produtoId: product._id, nome: product.nome, quantidade: 1, tipoVenda: 'unidade', unidadeVenda: 'un', modificadores: [], aFazer: true }],
};
const paymentCommand = {
  _id: 'comanda-garcom-e2e',
  numero: '0002',
  tipoAtendimento: 'balcao',
  status: 'aberta',
  valorTotal: 12,
  statusPagamento: 'pendente',
  clienteNome: 'Cliente teste',
  historicoPagamentos: [],
  itens: [{ _id: 'item-garcom-e2e', produtoId: product._id, nome: product.nome, quantidade: 1, precoUnitario: 12, tipoVenda: 'unidade', unidadeVenda: 'un', modificadores: [] }],
};

const visitComandas = (role, commands = []) => {
  const profile = { id: `user-${role}-e2e`, username: `${role}-e2e`, role, tenantId: null };
  cy.intercept('POST', '**/api/auth/refresh', { token: 'role-test-token', user: profile });
  cy.intercept('GET', '**/api/comandas?status=aberta', commands).as('openCommands');
  cy.intercept('GET', '**/api/products', [product]).as('fullCatalog');
  cy.intercept('GET', '**/api/products/pdv', [role === 'cozinha' ? kitchenProduct : product]).as('pdvCatalog');
  cy.intercept('GET', '**/api/mesas', tables).as('tables');
  cy.visit('/comandas', { onBeforeLoad(win) { win.localStorage.setItem('pdv_user', JSON.stringify(profile)); } });
  cy.wait('@openCommands');
  cy.get('.comandas-page').should('be.visible');
};

describe('Comandas por perfil', () => {
  it('cozinha acessa o KDS ao abrir o PDV por URL sem carregar APIs de venda', () => {
    const profile = { id: 'user-cozinha-pdv-e2e', username: 'cozinha-pdv-e2e', role: 'cozinha', tenantId: null };
    cy.intercept('POST', '**/api/auth/refresh', { token: 'role-test-token', user: profile });
    cy.intercept('GET', '**/api/comandas/cozinha', []).as('kitchenOrders');
    cy.intercept('GET', '**/api/products/pdv', [kitchenProduct]).as('pdvCatalog');
    cy.intercept('GET', '**/api/customers/pdv', { statusCode: 403, body: { msg: 'Acesso não autorizado' } }).as('pdvCustomers');
    cy.intercept('GET', '**/api/products/mais-vendidos*', { statusCode: 403, body: { msg: 'Acesso não autorizado' } }).as('bestSellers');

    cy.visit('/pdv', { onBeforeLoad(win) { win.localStorage.setItem('pdv_user', JSON.stringify(profile)); } });

    cy.location('pathname').should('eq', '/cozinha');
    cy.get('.kitchen-heading h1').should('be.visible');
    cy.wait('@kitchenOrders');
    cy.get('@pdvCatalog.all').should('have.length', 0);
    cy.get('@pdvCustomers.all').should('have.length', 0);
    cy.get('@bestSellers.all').should('have.length', 0);
  });

  it('gerente abre Comandas em vez do PDV sem chamar APIs de venda negadas', () => {
    const profile = { id: 'user-gerente-pdv-e2e', username: 'gerente-pdv-e2e', role: 'gerente', tenantId: null };
    cy.intercept('POST', '**/api/auth/refresh', { token: 'role-test-token', user: profile });
    cy.intercept('GET', '**/api/comandas?status=aberta', []).as('openCommands');
    cy.intercept('GET', '**/api/products', [product]).as('fullCatalog');
    cy.intercept('GET', '**/api/products/pdv', { statusCode: 403, body: { msg: 'Acesso não autorizado' } }).as('pdvCatalog');
    cy.intercept('GET', '**/api/customers/pdv', { statusCode: 403, body: { msg: 'Acesso não autorizado' } }).as('pdvCustomers');
    cy.intercept('GET', '**/api/products/mais-vendidos*', { statusCode: 403, body: { msg: 'Acesso não autorizado' } }).as('bestSellers');

    cy.visit('/pdv', { onBeforeLoad(win) { win.localStorage.setItem('pdv_user', JSON.stringify(profile)); } });

    cy.location('pathname').should('eq', '/comandas');
    cy.get('.comandas-page').should('be.visible');
    cy.wait(['@openCommands', '@fullCatalog']);
    cy.get('@pdvCatalog.all').should('have.length', 0);
    cy.get('@pdvCustomers.all').should('have.length', 0);
    cy.get('@bestSellers.all').should('have.length', 0);
  });

  for (const role of ['admin', 'operador', 'garcom']) {
    it(`${role} mantém acesso ao PDV com preços do catálogo`, () => {
      const profile = { id: `user-${role}-pdv-e2e`, username: `${role}-pdv-e2e`, role, tenantId: null };
      cy.intercept('POST', '**/api/auth/refresh', { token: 'role-test-token', user: profile });
      cy.intercept('GET', '**/api/comandas?status=aberta', []);
      cy.intercept('GET', '**/api/products/pdv', [product]).as('pdvCatalog');
      cy.intercept('GET', '**/api/customers/pdv', []).as('pdvCustomers');
      cy.intercept('GET', '**/api/products/mais-vendidos*', []).as('bestSellers');

      cy.visit('/pdv', { onBeforeLoad(win) { win.localStorage.setItem('pdv_user', JSON.stringify(profile)); } });

      cy.wait(['@pdvCatalog', '@pdvCustomers', '@bestSellers']);
      cy.get('.product-card').should('contain', 'Café operacional').and('contain', 'R$ 12,00');
    });
  }

  for (const { role, catalog, tablesRequired } of [
    { role: 'admin', catalog: 'fullCatalog', tablesRequired: true },
    { role: 'gerente', catalog: 'fullCatalog', tablesRequired: false },
    { role: 'operador', catalog: 'pdvCatalog', tablesRequired: true },
    { role: 'garcom', catalog: 'pdvCatalog', tablesRequired: true },
    { role: 'cozinha', catalog: 'pdvCatalog', tablesRequired: false },
  ]) {
    it(`${role} carrega o catálogo e a configuração de mesas autorizados`, () => {
      visitComandas(role);
      cy.wait(`@${catalog}`);
      if (tablesRequired) cy.wait('@tables');
      cy.get(`@${catalog}.all`).should('have.length.greaterThan', 0);
      const otherCatalog = catalog === 'fullCatalog' ? 'pdvCatalog' : 'fullCatalog';
      cy.get(`@${otherCatalog}.all`).then((calls) => expect(calls).to.have.length(0));
      cy.get('@tables.all').then((calls) => {
        if (tablesRequired) expect(calls.length).to.be.greaterThan(0);
        else expect(calls).to.have.length(0);
      });
    });
  }

  it('cozinha vê e edita itens sem dados financeiros nem ações fora do escopo', () => {
    visitComandas('cozinha', [kitchenCommand]);
    cy.contains('Café operacional').should('be.visible');
    cy.contains('Novo Pedido').should('not.exist');
    cy.contains('Abrir mesa').should('not.exist');
    cy.contains('Fechar comanda').should('not.exist');
    cy.contains('Cancelar comanda').should('not.exist');
    cy.contains('Separar pagamento').should('not.exist');
    cy.get('.comandas-page').should('not.contain', 'R$');
    cy.get('@fullCatalog.all').should('have.length', 0);
    cy.get('@tables.all').should('have.length', 0);
  });

  it('cozinha adiciona e altera quantidade sem enviar preço', () => {
    const updatedCommand = {
      ...kitchenCommand,
      itens: [...kitchenCommand.itens, { _id: 'item-novo-e2e', produtoId: product._id, nome: product.nome, quantidade: 1, unidadeVenda: 'un', modificadores: [], aFazer: true }],
    };
    visitComandas('cozinha', [kitchenCommand]);
    cy.intercept('POST', `**/api/comandas/${kitchenCommand._id}/itens`, req => req.reply(updatedCommand)).as('addKitchenItem');
    cy.intercept('PATCH', `**/api/comandas/${kitchenCommand._id}/itens/item-novo-e2e`, req => req.reply(updatedCommand)).as('updateKitchenItem');
    cy.get('.comandas-add-form [role="combobox"]').click();
    cy.contains('[role="option"]', product.nome).click();
    cy.get('.comandas-add-form input[type="number"]').clear().type('1');
    cy.get('.comandas-add-form').contains('button', 'Adicionar').click();
    cy.wait('@addKitchenItem').its('request.body').should(body => {
      expect(body.produtoId).to.equal(product._id);
      expect(body.quantidade).to.equal(1);
      expect(body).not.to.have.property('precoUnitarioManual');
    });
    cy.get('[aria-label="Quantidade de Café operacional"]').last().clear().type('2').blur();
    cy.wait('@updateKitchenItem').its('request.body').should('deep.equal', { quantidade: 2 });
  });

  it('garçom consegue fechar a comanda pelo fluxo atual', () => {
    visitComandas('garcom', [paymentCommand]);
    cy.intercept('POST', `**/api/comandas/${paymentCommand._id}/fechar`, req => {
      expect(req.body.metodoPagamento).to.equal('dinheiro');
      req.reply({ pedido: { _id: 'pedido-e2e', numero: '10', total: paymentCommand.valorTotal, nfce: {} } });
    }).as('closeWaiterCommand');
    cy.contains('button', 'Fechar comanda').click();
    cy.get('.comandas-page input[role="combobox"]').last().click();
    cy.contains('[role="option"]', 'Dinheiro').click();
    cy.contains('button', 'Confirmar Fechamento').click();
    cy.wait('@closeWaiterCommand');
    cy.contains('Comanda Fechada!').should('be.visible');
  });

  it('gerente pode fechar e cancelar, mas não criar nem editar itens', () => {
    visitComandas('gerente', [paymentCommand]);
    cy.contains('button', /#0002/).click();
    cy.contains('Novo Pedido').should('not.exist');
    cy.contains('Abrir mesa').should('not.exist');
    cy.contains('button', 'Fechar comanda').should('be.visible');
    cy.contains('button', 'Cancelar').should('be.visible');
    cy.contains('button', 'Adicionar').should('not.exist');
    cy.get('[aria-label="Quantidade de Café operacional"]').should('not.exist');
  });

  it('cozinha consulta fichas sem visualizar custos nem controles de escrita', () => {
    const profile = { id: 'user-cozinha-fichas-e2e', username: 'cozinha-fichas-e2e', role: 'cozinha', tenantId: null };
    cy.intercept('POST', '**/api/auth/refresh', { token: 'role-test-token', user: profile });
    cy.intercept('GET', '**/api/products', [{
      _id: 'produto-ficha-e2e',
      nome: 'Bolo de preparo',
      tipo: 'venda',
      tipoProduto: 'coz',
      aFazer: true,
    }]).as('recipeProducts');
    cy.intercept('GET', '**/api/production/recipes', [{
      _id: 'receita-ficha-e2e',
      nome: 'Ficha do bolo',
      produtoId: { _id: 'produto-ficha-e2e', nome: 'Bolo de preparo', aFazer: true },
      rendimento: 1,
      unidadeRendimento: 'un',
      ingredientes: [{ quantidade: 1, unidade: 'kg' }],
      disponibilidade: { quantidade: 4, limitante: 'Farinha' },
      custoUnitario: 7.5,
    }]).as('recipes');
    cy.visit('/producao/fichas', { onBeforeLoad(win) { win.localStorage.setItem('pdv_user', JSON.stringify(profile)); } });
    cy.wait(['@recipeProducts', '@recipes']);
    cy.contains('Bolo de preparo').should('be.visible');
    cy.contains('Custo/unidade').should('not.exist');
    cy.get('.technical-table').should('not.contain', 'R$ 7,50');
    cy.get('.technical-actions').should('not.exist');
  });
});
