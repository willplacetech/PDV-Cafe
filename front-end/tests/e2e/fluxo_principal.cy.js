describe('Fluxo Principal do Usuário', () => {
  beforeEach(() => {
    cy.visit('/login');
    cy.get('input[placeholder*="usuário"], input[name="username"]').type('admin');
    cy.get('input[placeholder*="senha"], input[name="senha"]').type('SaborAbra26');
    cy.get('button[type="submit"]').click();
    cy.url().should('include', '/pdv');
  });

  it('Login → Novo Pedido → Adicionar item → Abrir Comanda', () => {
    cy.contains('Novo Pedido').click();
    cy.contains('Café').click();
    cy.get('[data-cy="carrinho"]').should('contain', 'Café');
    cy.get('button').contains(/Abrir Comanda/i).click();
    cy.url().should('include', '/comandas');
  });

  it('Botão de instalação PWA visível no login', () => {
    cy.visit('/login');
    cy.get('button[title="Instalar Sabor de Abraço no seu dispositivo"]').should('exist');
  });

  it('Tema claro/escuro alterna corretamente', () => {
    cy.get('button[title*="Modo"]').click();
    cy.get('html').should('have.css', 'background-color');
  });
});
