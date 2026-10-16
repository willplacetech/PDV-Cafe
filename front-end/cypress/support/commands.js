
Cypress.Commands.add('login', (username = 'admin-e2e', password = 'isolated-test-password', role = 'admin') => {
  const user = { id: 'user-e2e', username, role };
  cy.intercept('POST', '**/api/auth/login', { user, token: 'isolated-access-token' }).as('login');
  cy.visit('/login');
  cy.get('input[autocomplete="username"]').type(username);
  cy.get('input[autocomplete="current-password"]').type(password);
  cy.get('button[type="submit"]').click();
  cy.wait('@login').its('request.body').should('deep.equal', { username, password });
  cy.location('pathname').should('equal', role === 'admin' ? '/dashboard' : '/pdv');
  cy.visit('/pdv');
  cy.get('.product-card').should('be.visible');
});

Cypress.Commands.add('navigateTo', (path) => {
  cy.visit(path);
  cy.url().should('include', path);
});

Cypress.Commands.add('searchProduct', (name) => {
  cy.get('input[placeholder*="buscar"], input[placeholder*="Buscar"], input[placeholder*="Produto"], input[type="search"]').type(name);
});

Cypress.Commands.add('addToCart', (productName) => {
  cy.contains('.product-card', productName).click();
  cy.get('.pdv-cart-items').should('contain', productName);
});

Cypress.Commands.add('chooseOption', (selector, label) => {
  cy.get(selector).click();
  cy.contains('[role="option"]', label).click();
});
