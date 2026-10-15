const product = { _id: 'cafe-mobile', nome: 'Café mobile', codigo: '1', tipo: 'venda', categoria: 'Bebidas Quentes', preco: 6, estoque: 20, unidadeVenda: 'un' };
const profile = { id: 'admin-mobile', role: 'admin', username: 'teste', tenantId: 'tenant-teste' };
const savedOrder = {
  _id: 'comanda-mobile',
  numero: '1',
  status: 'aberta',
  tipoAtendimento: 'balcao',
  itens: [{ _id: 'item-mobile', produtoId: product._id, nome: product.nome, quantidade: 1, precoUnitario: product.preco }],
  valorTotal: product.preco,
};

describe('Barra de comanda no mobile', () => {
  beforeEach(() => {
    cy.viewport(390, 844);
    cy.intercept('POST', '**/api/auth/refresh', { token: 'test-token', user: profile });
    cy.intercept('GET', '**/api/**', req => {
      const path = new URL(req.url).pathname;
      if (path.endsWith('/mesas')) return req.reply({ mesas: [] });
      if (path.endsWith('/products') || path.endsWith('/products/pdv')) return req.reply([product]);
      if (path.endsWith('/entregas/estatisticas')) return req.reply({ prontos: 0, despachados: 0 });
      return req.reply([]);
    });
    cy.intercept('POST', '**/api/comandas', req => req.reply({
      statusCode: 201,
      body: { ...req.body, _id: 'comanda-mobile', numero: '1', status: 'aberta', valorTotal: 6,
        itens: req.body.itens.map(item => ({ ...item, nome: product.nome, precoUnitario: product.preco })) },
    })).as('save');
    cy.visit('/pdv', { onBeforeLoad(win) { win.localStorage.setItem('pdv_user', JSON.stringify(profile)); } });
    cy.get('.product-card').contains(product.nome).should('be.visible');
  });

  it('não exibe comanda fantasma no pedido vazio nem depois de iniciar novo pedido', () => {
    cy.get('.pdv-mobile-cart-trigger').should('not.exist');
    cy.get('.product-card').contains(product.nome).click();
    cy.get('.pdv-cart-panel').should('have.class', 'mobile-open').and('be.visible');
    cy.get('.pdv-cart-panel').contains('button', '+ Novo pedido').click();
    cy.wait('@save');
    cy.get('.pdv-mobile-cart-trigger').should('not.exist');
    cy.get('.pdv-cart-panel').should('not.be.visible');
  });

  it('fecha ao tocar fora, mantém acesso à comanda com itens e não vaza para Comandas', () => {
    cy.get('.product-card').contains(product.nome).click();
    cy.get('.pdv-mobile-cart-backdrop').should('be.visible').click('topLeft');
    cy.get('.pdv-cart-panel').should('not.be.visible');
    cy.get('.pdv-mobile-cart-trigger').should('be.visible').and('contain', '1 item').click();
    cy.get('.pdv-cart-panel').should('be.visible');
    cy.get('.pdv-mobile-cart-backdrop').click('topLeft');
    cy.window().then(win => {
      win.history.pushState({}, '', '/atendimento/mesas');
      win.dispatchEvent(new win.PopStateEvent('popstate'));
    });
    cy.location('pathname').should('equal', '/comandas');
    cy.get('.pdv-mobile-cart-trigger, .pdv-cart-panel, .pdv-mobile-cart-backdrop').should('not.exist');
  });

  it('limpa a comanda após salvar em aberto para iniciar a próxima', () => {
    cy.get('.product-card').contains(product.nome).click();
    cy.get('.pdv-cart-panel').contains('button', 'Salvar em aberto').click();
    cy.wait('@save');
    cy.get('.pdv-cart-panel').should('not.be.visible');
    cy.get('.pdv-mobile-cart-backdrop').should('not.exist');
    cy.get('.pdv-mobile-mesas-trigger').should('be.visible');
    cy.get('.pdv-mobile-cart-trigger').should('not.exist');
    cy.get('.product-card').contains(product.nome).click();
    cy.get('.pdv-cart-panel').should('be.visible').and('contain', product.nome);
    cy.get('.pdv-cart-items input[type="number"]').first().should('have.value', '1');
  });

  it('mantém o painel aberto se não conseguir salvar a comanda', () => {
    cy.intercept('POST', '**/api/comandas', { statusCode: 500, body: { msg: 'Falha ao salvar.' } }).as('saveFailed');
    cy.get('.product-card').contains(product.nome).click();
    cy.get('.pdv-cart-panel').contains('button', 'Salvar em aberto').click();
    cy.wait('@saveFailed');
    cy.get('.pdv-cart-panel').should('be.visible').and('contain', product.nome);
    cy.get('.pdv-cart-items').contains(product.nome).should('be.visible');
    cy.get('.pdv-mobile-cart-backdrop').should('be.visible');
  });

  it('fecha o painel e remove o fundo ao cancelar uma comanda ainda não salva', () => {
    cy.on('window:confirm', () => true);
    cy.get('.product-card').contains(product.nome).click();
    cy.get('.pdv-cart-panel').contains('button', 'Cancelar comanda').click();
    cy.contains('Comanda cancelada.').should('be.visible');
    cy.get('.pdv-cart-panel').should('not.be.visible');
    cy.get('.pdv-mobile-cart-backdrop, .pdv-mobile-cart-trigger').should('not.exist');
    cy.get('.product-card').contains(product.nome).click();
    cy.get('.pdv-cart-panel').should('be.visible').and('contain', 'Café mobile');
  });

  it('fecha o painel somente depois de cancelar uma comanda salva', () => {
    cy.intercept('GET', '**/api/comandas*', [savedOrder]);
    cy.on('window:confirm', () => true);
    cy.intercept('PATCH', '**/api/comandas/comanda-mobile/cancelar', { statusCode: 200, body: { msg: 'Comanda cancelada.' } }).as('cancel');
    cy.get('.product-card').contains(product.nome).click();
    cy.get('.pdv-cart-panel').contains('button', 'Salvar em aberto').click();
    cy.wait('@save');
    cy.get('.pdv-mobile-cart-trigger').should('not.exist');
    cy.get('.pdv-mobile-mesas-trigger').click();
    cy.get('.mesas-drawer-orders').contains('button', '#1').click();
    cy.get('.pdv-cart-panel').contains('button', 'Cancelar comanda').click();
    cy.wait('@cancel');
    cy.get('.pdv-cart-panel').should('not.be.visible');
    cy.get('.pdv-mobile-cart-backdrop, .pdv-mobile-cart-trigger').should('not.exist');
  });

  it('preserva painel e itens ao desistir do cancelamento ou quando o servidor falha', () => {
    let confirmar = false;
    cy.intercept('GET', '**/api/comandas*', [savedOrder]);
    cy.on('window:confirm', () => confirmar);
    cy.intercept('PATCH', '**/api/comandas/comanda-mobile/cancelar', { statusCode: 500, body: { msg: 'Falha ao cancelar.' } }).as('cancelFailed');
    cy.get('.product-card').contains(product.nome).click();
    cy.get('.pdv-cart-panel').contains('button', 'Cancelar comanda').click();
    cy.get('.pdv-cart-panel').should('be.visible').and('contain', 'Café mobile');
    cy.get('.pdv-cart-items').contains(product.nome).should('be.visible');
    cy.get('.pdv-cart-panel').contains('button', 'Salvar em aberto').click();
    cy.wait('@save');
    cy.get('.pdv-mobile-mesas-trigger').click();
    cy.get('.mesas-drawer-orders').contains('button', '#1').click();
    cy.then(() => { confirmar = true; });
    cy.get('.pdv-cart-panel').contains('button', 'Cancelar comanda').click();
    cy.wait('@cancelFailed');
    cy.contains('Comanda cancelada.').should('not.exist');
    cy.get('.pdv-cart-panel').should('be.visible').and('contain', 'Café mobile');
    cy.get('.pdv-cart-items').contains(product.nome).should('be.visible');
    cy.get('.pdv-mobile-cart-backdrop').should('be.visible');
  });
});
