
Cypress.Commands.add('login', (username, password) => {
  cy.visit('/login');
  cy.get('input[placeholder*="usuário"], input[name="usuario"]').type(username);
  cy.get('input[placeholder*="senha"], input[name="senha"]').type(password);
  cy.get('button[type="submit"]').click();
  cy.url().should('include', '/pdv');
});

Cypress.Commands.add('navigateTo', (path) => {
  cy.visit(path);
  cy.url().should('include', path);
});

Cypress.Commands.add('searchProduct', (name) => {
  cy.get('input[placeholder*="buscar"], input[placeholder*="Buscar"], input[placeholder*="Produto"], input[type="search"]').type(name);
});

Cypress.Commands.add('addToCart', (productName) => {
  cy.contains(productName).click();
  cy.get('.carrinho, [data-cy="carrinho"]').should('contain', productName);
});
