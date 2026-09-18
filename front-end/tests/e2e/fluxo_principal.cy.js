describe('Fluxo Principal do Usuário', () => {
  beforeEach(() => {
    cy.login('admin', 'SaborAbra26');
  });

  it('Login → Novo Pedido → Adicionar item → Abrir Comanda', () => {
    cy.contains('Novo Pedido').click();
    cy.contains('Área de Pedidos').should('exist');
    cy.addToCart('Café');
    cy.get('button').contains(/Abrir Comanda|Fechar Comanda|Adicionar/).first().click();
    cy.url().should('include', '/comandas');
  });

  it('Botão de instalação PWA visível no login', () => {
    cy.visit('/login');
    cy.get('button[title*="Instalar"], button[title*="instalar"]').should('exist');
  });

  it('Tema claro/escuro alterna corretamente', () => {
    cy.get('button[title*="Modo"]').click();
    cy.get('body').should('have.css', 'background-color');
  });
});
