before(() => {
  cy.visit('/login');
});

Cypress.Commands.add('login', (username = 'admin', password = 'SaborAbra26') => {
  cy.get('input[placeholder*="usuário"], input[name="usuario"]').type(username);
  cy.get('input[placeholder*="senha"], input[name="senha"]').type(password);
  cy.get('button[type="submit"]').click();
  cy.url().should('include', '/pdv');
});

Cypress.Commands.add('loginAsCustomer', (username = 'operador', password = 'SaborAbra26') => {
  cy.get('input[placeholder*="usuário"], input[name="usuario"]').type(username);
  cy.get('input[placeholder*="senha"], input[name="senha"]').type(password);
  cy.get('button[type="submit"]').click();
  cy.url().should('include', '/pdv');
});

Cypress.Commands.add('checkPWAInstallButton', () => {
  cy.get('button[title*="Instalar"], button[title*="instalar"]').should('exist');
});
