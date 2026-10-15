describe('Dashboard e PWA', () => {
  beforeEach(() => cy.login());

  it('carrega métricas e abas do dashboard', () => {
    cy.visit('/dashboard');
    cy.get('.dashboard-heading h1').should('be.visible');
    cy.get('.dashboard-period').should('have.length', 3);
    cy.get('.dashboard-tabs').should('contain', 'Vendas').and('contain', 'Produção');
  });

  it('oferece apenas produtos de venda no histórico', () => {
    cy.visit('/dashboard');
    cy.get('.product-sales-history').contains('button', 'Consultar').click();
    cy.get('.product-history-filters [role="combobox"]').click();
    cy.get('[role="option"]').should('contain', 'Café').and('not.contain', 'Farinha');
  });

  it('exibe instalação quando o navegador disponibiliza o prompt', () => {
    cy.clearLocalStorage();
    cy.visit('/login');
    cy.get('input[autocomplete="username"]').should('be.visible');
    cy.window().then(win => {
      const event = new win.Event('beforeinstallprompt', { cancelable: true });
      event.prompt = cy.stub().as('installPrompt');
      event.userChoice = Promise.resolve({ outcome: 'accepted' });
      win.dispatchEvent(event);
    });
    cy.get('button[title="Instalar app"]').click();
    cy.get('@installPrompt').should('have.been.calledOnce');
    cy.contains('Instalação iniciada!').should('be.visible');
  });

  it('confirma instalação ao receber o evento do navegador', () => {
    cy.clearLocalStorage();
    cy.visit('/login');
    cy.get('input[autocomplete="username"]').should('be.visible');
    cy.window().then(win => win.dispatchEvent(new win.Event('appinstalled')));
    cy.contains('App instalado com sucesso!').should('be.visible');
  });
});
