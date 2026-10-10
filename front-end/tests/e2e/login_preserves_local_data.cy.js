describe('Login e dados locais', () => {
  const profile = { id: 'login-user', username: 'operador', role: 'operador' };
  const session = { token: 'login-access-token', user: profile };
  let refreshRequests;

  beforeEach(() => {
    refreshRequests = 0;
    cy.intercept('POST', '**/api/auth/refresh', req => {
      refreshRequests += 1;
      if (refreshRequests === 1) {
        req.reply({ statusCode: 401, body: { msg: 'Sessão inválida ou expirada' } });
      } else {
        req.reply(session);
      }
    });
    cy.intercept('POST', '**/api/auth/login', { body: session });
    cy.visit('/login', {
      onBeforeLoad(win) {
        win.localStorage.setItem('pdv_fila_offline', '[{"id":"pending-sale"}]');
      },
    });
  });

  it('preserves queued offline sales after successful login', () => {
    cy.get('input[placeholder*="usuário"]').type('operador');
    cy.get('input[placeholder*="senha"]').type('senha-de-teste');
    cy.get('button[type="submit"]').click();

    cy.url().should('include', '/pdv');
    cy.window().its('localStorage.pdv_fila_offline').should('eq', '[{"id":"pending-sale"}]');
  });
});
