describe('Navegação e Grupos de Menu', () => {
  beforeEach(() => {
    cy.login('admin', 'SaborAbra26');
  });

  it('Menu lateral contém Produção com emoji', () => {
    cy.get('a').contains('🧪 Produção').should('exist');
  });

  it('Menu lateral contém Atendimento', () => {
    cy.get('a').contains('🏪 Atendimento').should('exist');
  });

  it('Botão hamburguer funciona no mobile', () => {
    cy.viewport(375, 812);
    cy.get('button[aria-label="Toggle menu"], button svg').first().click();
    cy.get('[data-menu="mobile"], .mobile-menu').should('exist');
  });

  it('Todos os grupos de menu estão presentes', () => {
    cy.get('a').contains('COMPRAS').parent().should('exist');
    cy.get('a').contains('PRODUÇÃO').parent().should('exist');
    cy.get('a').contains('PESSOAS').parent().should('exist');
    cy.get('a').contains('DASHBOARD').parent().should('exist');
  });

  it('Dashboard → navega até a página', () => {
    cy.get('a[href="/dashboard"]').click();
    cy.url().should('include', '/dashboard');
    cy.contains('Painel de Controle').should('exist');
  });
});