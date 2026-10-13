describe('Selects pesquisáveis compartilhados', () => {
  before(() => {
    // An existing PWA worker can serve the app shell instead of this test fixture.
    cy.visit('/tests/fixtures/searchable-select.html');
    cy.window().then(async win => {
      const registrations = await win.navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
      const keys = await win.caches.keys();
      await Promise.all(keys.map(key => win.caches.delete(key)));
    });
  });
  beforeEach(() => cy.visit('/tests/fixtures/searchable-select.html'));

  it('busca sem acentos, seleciona por clique e envia o valor original', () => {
    cy.get('#produto').click().type('CAFE');
    cy.get('[role="option"]').should('have.length', 1).and('contain', 'Café com leite').click();
    cy.get('#produto').should('have.value', 'Café com leite');
    cy.get('#value').should('have.text', 'cafe');
    cy.contains('button', 'Salvar').click();
    cy.get('#submitted').should('have.text', 'cafe');
  });

  it('seleciona com teclado, cancela a busca e informa resultado vazio', () => {
    cy.get('#produto').click().type('frances{downarrow}{enter}');
    cy.get('#value').should('have.text', 'pao');
    cy.get('#produto').click().type('inexistente');
    cy.contains('Nenhuma opção encontrada').should('be.visible');
    cy.get('#produto').type('{esc}').should('have.value', 'Pão francês');
    cy.get('[role="listbox"]').should('not.exist');
    cy.get('#produto').click().type('Indisponivel{enter}{esc}');
    cy.get('#value').should('have.text', 'pao');
  });

  it('mantém validação obrigatória, disabled e atualizações externas', () => {
    cy.contains('button', 'Salvar').click();
    cy.get('#submitted').should('be.empty');
    cy.get('#produto').should('be.focused');
    cy.get('[aria-label="Desabilitado"]').should('be.disabled');
    cy.get('#produto').type('{esc}');
    cy.contains('button', 'Atualizar opções').click();
    cy.get('#produto').should('have.value', 'Novo produto');
    cy.get('#produto').click().type('novo{enter}');
    cy.contains('button', 'Salvar').click();
    cy.get('#submitted').should('have.text', 'novo');
  });

  it('exibe a lista fora de contêineres com overflow e fecha ao clicar fora', () => {
    cy.viewport(375, 667);
    cy.get('#produto').click();
    cy.contains('[role="option"]', 'Pão francês').should('be.visible');
    cy.get('[role="listbox"]').then(list => {
      const rect = list[0].getBoundingClientRect();
      expect(rect.left).to.be.at.least(0);
      expect(rect.right).to.be.at.most(375);
    });
    cy.get('body').click(350, 500);
    cy.get('[role="listbox"]').should('not.exist');
  });
});
