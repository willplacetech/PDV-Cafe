const product = { _id: 'cafe-1', nome: 'Café de teste', codigo: '1', tipo: 'venda', categoria: 'Bebidas Quentes', preco: 6, estoque: 20, unidadeVenda: 'un' };
const profile = { id: 'admin-teste', role: 'admin', username: 'teste', tenantId: 'tenant-teste' };
const token = () => `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 300 }))}.signature`;

describe('Cancelar comanda no PDV', () => {
  let command;
  beforeEach(() => {
    command = null;
    cy.intercept('POST', '**/api/auth/refresh', { token: 'test-token', user: profile });
    cy.intercept('GET', '**/api/**', req => {
      const path = new URL(req.url).pathname;
      if (path.endsWith('/products') || path.endsWith('/products/pdv')) return req.reply([product]);
      if (path.endsWith('/comandas')) return req.reply(command ? [command] : []);
      if (path.endsWith('/mesas')) return req.reply({ mesas: [] });
      return req.reply([]);
    });
    cy.intercept('POST', '**/api/comandas', req => {
      command = { ...req.body, _id: 'comanda-1', numero: '1', status: 'aberta', valorTotal: 6, itens: req.body.itens.map((item, index) => ({ ...item, _id: `item-${index}`, nome: product.nome, precoUnitario: 6 })) };
      req.reply({ statusCode: 201, body: command });
    }).as('save');
    cy.visit('/pdv', { onBeforeLoad(win) { win.localStorage.setItem('pdv_user', JSON.stringify(profile)); } });
    cy.get('.product-card').contains(product.nome).click();
  });
  const panel = () => cy.get('.pdv-cart-panel');
  const save = () => {
    panel().contains('button', 'Salvar em aberto').click();
    cy.wait('@save');
  };
  const reopenSavedCommand = () => {
    cy.get('.pdv-mesas-trigger').click();
    cy.get('.mesas-drawer-orders').contains('button', '#1').click();
  };

  it('cancela comanda salva na API e limpa o atendimento', () => {
    save();
    reopenSavedCommand();
    cy.intercept('PATCH', '**/api/comandas/comanda-1/cancelar', req => {
      req.reply({ ...command, status: 'cancelada' });
      command = null;
    }).as('cancel');
    panel().contains('button', 'Cancelar comanda').click();
    cy.get('[role="dialog"][aria-modal="true"]').should('contain.text', 'Cancelar a comanda #1?');
    cy.get('[role="dialog"]').contains('button', 'Cancelar').click();
    cy.get('@cancel.all').should('have.length', 0);

    panel().contains('button', 'Cancelar comanda').click();
    cy.get('[role="dialog"]').contains('button', 'Cancelar comanda').click();
    cy.wait('@cancel');
    cy.get('@cancel.all').should('have.length', 1);
    panel().contains('Comanda sem itens').should('be.visible');
    cy.contains('Comanda cancelada.').should('be.visible');
  });

  it('preserva a comanda quando o servidor rejeita o cancelamento', () => {
    save();
    reopenSavedCommand();
    cy.intercept('PATCH', '**/api/comandas/comanda-1/cancelar', { statusCode: 409, body: { msg: 'Comanda possui pagamentos' } }).as('cancel');
    panel().contains('button', 'Cancelar comanda').click();
    cy.get('[role="dialog"]').contains('button', 'Cancelar comanda').click();
    cy.wait('@cancel');
    cy.contains('Comanda possui pagamentos').should('be.visible');
    panel().contains('Subtotal: R$ 6,00').should('be.visible');
    panel().contains('button', 'Cancelar comanda').should('be.enabled');
  });

  it('mantém os itens ao desistir e descarta rascunho sem criar comanda', () => {
    let saves = 0;
    cy.intercept('POST', '**/api/comandas', () => { saves++; });
    cy.intercept('POST', '**/api/auth/autorizar', { tokenAutorizacao: token(), autorizado: true });
    panel().contains('button', 'Cancelar comanda').click();
    cy.get('[role="dialog"]').contains('button', 'Cancelar').click();
    panel().contains('Subtotal: R$ 6,00').should('be.visible');
    panel().contains('button', 'Cancelar comanda').click();
    cy.get('[role="dialog"]').contains('button', 'Cancelar comanda').click();
    cy.get('[role="dialog"] input[type="password"]').type('senha-gerente');
    cy.get('[role="dialog"]').contains('button', 'Confirmar').click();
    panel().contains('Comanda sem itens').should('be.visible');
    cy.then(() => expect(saves).to.equal(0));
  });
});
