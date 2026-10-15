describe('Renderização das rotas autenticadas', () => {
  it('mostra o dashboard dentro do layout após restaurar a sessão', () => {
    cy.intercept('POST', '**/api/auth/refresh', {
      token: 'isolated-access-token',
      user: { id: 'layout-test', username: 'teste', role: 'admin' },
    });
    cy.visit('/dashboard');
    cy.get('.dashboard-heading h1').should('be.visible');
  });
});
