describe('Dashboard e PWA', () => {
  beforeEach(() => cy.login());

  it('carrega métricas e abas do dashboard', () => {
    cy.visit('/dashboard');
    cy.get('.dashboard-heading h1').should('be.visible');
    cy.get('.dashboard-period').should('have.length', 3);
    cy.get('.dashboard-tabs').should('contain', 'Vendas').and('contain', 'Produção');
  });

  it('exibe skeletons locais enquanto o dashboard inicial carrega', () => {
    cy.intercept('GET', '**/api/dashboard', request => {
      request.on('response', response => response.setDelay(500));
    }).as('dashboardPayload');
    cy.visit('/dashboard');
    cy.get('[data-testid="dashboard-loading"]').should('be.visible');
    cy.wait('@dashboardPayload');
    cy.get('.dashboard-heading h1').should('be.visible');
  });

  it('exibe o dashboard principal sem aguardar o catálogo auxiliar', () => {
    cy.intercept('GET', '**/api/products', {
      delay: 2000,
      body: [],
    }).as('dashboardProducts');

    cy.visit('/dashboard');
    cy.get('.dashboard-heading h1').should('be.visible');
    cy.get('@dashboardProducts.all').should('have.length', 1);
    cy.get('[data-testid="dashboard-loading"]').should('not.exist');
    cy.wait('@dashboardProducts');
  });

  it('exibe skeletons nos indicadores de Delivery enquanto a consulta está pendente', () => {
    cy.clearLocalStorage();
    cy.intercept('POST', '**/api/auth/login', {
      user: { id: 'user-e2e', username: 'admin-e2e', role: 'admin', tenantId: 'tenant-e2e' },
      token: 'isolated-access-token',
    }).as('tenantLogin');
    cy.intercept('GET', '**/dashboard/delivery*', request => {
      request.on('response', response => response.setDelay(500));
    }).as('deliverySummary');
    cy.visit('/login');
    cy.get('input[autocomplete="username"]').type('admin-e2e');
    cy.get('input[autocomplete="current-password"]').type('isolated-test-password');
    cy.get('button[type="submit"]').click();
    cy.wait('@tenantLogin');
    cy.visit('/dashboard');
    cy.get('[aria-label="Carregando indicadores de Delivery"]').should('be.visible');
    cy.wait('@deliverySummary');
    cy.get('.delivery-summary-grid').should('be.visible');
  });

  it('pagina produtos na lista de estoque do dashboard', () => {
    const products = Array.from({ length: 30 }, (_, index) => ({
      _id: `dashboard-product-${index + 1}`,
      nome: `Produto ${index + 1}`,
      codigo: `P${index + 1}`,
      categoria: 'Bebidas',
      estoque: index,
      tipo: 'venda',
    }));
    cy.intercept('GET', '**/api/products', { statusCode: 200, body: products }).as('dashboardProducts');
    cy.visit('/dashboard');
    cy.wait('@dashboardProducts');
    cy.contains('.dashboard-stock .dashboard-toggle-button', 'Mostrar').click();
    cy.get('.dashboard-stock-item').should('have.length', 25);
    cy.get('.dashboard-stock .paginacao').contains('button', '2').click();
    cy.get('.dashboard-stock-item').should('have.length', 5);
  });

  it('mantém o carregamento do gráfico até receber uma resposta vazia', () => {
    cy.intercept('GET', '**/dashboard/receita-7-dias', { delay: 500, body: [] }).as('weeklyRevenue');
    cy.visit('/dashboard');
    cy.get('[data-testid="delivery-chart-loading"]').should('be.visible');
    cy.contains('Nenhum dado de receita nos últimos 7 dias.').should('not.exist');
    cy.wait('@weeklyRevenue');
    cy.contains('Nenhum dado de receita nos últimos 7 dias.').should('be.visible');
  });

  it('permite tentar novamente após erro no gráfico de receita', () => {
    cy.intercept('GET', '**/dashboard/receita-7-dias', { statusCode: 503, body: { msg: 'Indisponível' } }).as('weeklyRevenue');
    cy.visit('/dashboard');
    cy.wait('@weeklyRevenue');
    cy.get('.delivery-chart-card [role="alert"]').should('be.visible');
    cy.contains('.delivery-chart-card button', 'Tentar novamente').click();
    cy.wait('@weeklyRevenue');
    cy.get('.delivery-chart-card [role="alert"]').should('be.visible');
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
