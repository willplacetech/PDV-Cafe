describe('novo pedido em Entregas', () => {
  it('encaminha para o fluxo de nova venda do PDV', () => {
    cy.intercept('GET', '**/api/**', { statusCode: 200, body: [] });
    cy.visit('/entregas', { onBeforeLoad(win) {
      win.localStorage.setItem('pdv_token', 'fake');
      win.localStorage.setItem('pdv_user', JSON.stringify({ username: 'operador', role: 'admin' }));
    } });

    cy.contains('button', 'Novo pedido').click();
    cy.location('pathname').should('eq', '/pdv');
    cy.get('.pdv-grid').should('be.visible');
  });
});
