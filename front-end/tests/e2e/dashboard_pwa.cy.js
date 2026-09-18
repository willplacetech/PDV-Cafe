describe('Dashboard e PWA', () => {
  beforeEach(() => {
    cy.login('admin', 'SaborAbra26');
  });

  it('Dashboard carrega corretamente', () => {
    cy.visit('/dashboard');
    cy.contains('Painel de Controle').should('exist');
    cy.contains('INSIGHTS DE GESTÃO').should('exist');
  });

  it('Dashboard mostra apenas produtos de venda (não insumos)', () => {
    cy.visit('/dashboard');
    cy.contains('button', 'Consultar').click();
    cy.get('select').find('option').each(($option) => {
      const text = $option.text();
      if (text.includes('Farinha') || text.includes('Açúcar') || text.includes('Insumo')) {
        cy.wrap($option).should('not.be.selected');
      }
    });
  });

  it('Botão PWA visível no login', () => {
    cy.visit('/login');
    cy.get('button[title*="Instalar"]').should('exist');
  });

  it('App instalado via PWA mostra toast de sucesso', () => {
    cy.visit('/login');
    cy.get('button[title*="Instalar"]').click();
    cy.contains('Instalação').should('exist');
  });
});
