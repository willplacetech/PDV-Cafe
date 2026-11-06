describe('Navegação e grupos de menu', () => {
  beforeEach(() => cy.login());

  it('expande Produção e mostra seus destinos', () => {
    cy.get('#sidebar-desktop').contains('button', 'PRODUÇÃO').click();
    cy.get('#sidebar-desktop a[href="/producao"]').should('be.visible');
  });

  it('exibe os destinos de Atendimento', () => {
    cy.get('#sidebar-desktop').contains('button', 'ATENDIMENTO').should('have.attr', 'aria-expanded', 'true');
    cy.get('#sidebar-desktop a[href="/pdv"]').should('be.visible');
  });

  it('abre e fecha o menu no celular', () => {
    cy.viewport(375, 812);
    cy.get('button[aria-label="Abrir menu"]').click();
    cy.get('.mobile-menu-nav').should('be.visible');
    cy.get('button[aria-label="Fechar menu"]').click();
    cy.get('.mobile-menu-nav').should('not.exist');
  });

  it('apresenta os grupos de administração', () => {
    for (const group of ['COMPRAS', 'PRODUÇÃO', 'PESSOAS', 'GESTÃO']) {
      cy.get('#sidebar-desktop').contains('.nav-group-header', group).should('be.visible');
    }
  });

  it('navega para o dashboard pelo menu', () => {
    cy.get('#sidebar-desktop').contains('button', 'GESTÃO').click();
    cy.get('#sidebar-desktop a[href="/dashboard"]:visible').first().click();
    cy.location('pathname').should('equal', '/dashboard');
    cy.get('.dashboard-heading h1').should('be.visible');
  });
});
