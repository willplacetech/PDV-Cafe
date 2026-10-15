describe('Fluxo principal do usuário', () => {
  beforeEach(() => cy.login());

  it('adiciona item e persiste uma comanda aberta', () => {
    cy.intercept('POST', '**/api/comandas', req => {
      expect(req.body.itens).to.have.length(1);
      expect(req.body.itens[0].quantidade).to.equal(1);
      req.reply({ statusCode: 201, body: { ...req.body, _id: 'fluxo-1', numero: '1', status: 'aberta', valorTotal: 16 } });
    }).as('abrirComanda');
    cy.addToCart('Café');
    cy.get('.pdv-cart-panel').contains('button', 'Salvar em aberto').click();
    cy.wait('@abrirComanda');
    cy.get('.pdv-cart-panel').should('contain', 'Café');
  });

  it('mostra instruções de instalação quando o navegador não oferece instalação', () => {
    cy.clearLocalStorage();
    cy.visit('/login');
    cy.contains('Para instalar, use o menu do navegador').should('be.visible');
  });

  it('alterna o tema claro/escuro', () => {
    cy.get('html').invoke('attr', 'data-theme').then(theme => {
      cy.get('#sidebar-desktop button[title^="Modo"]').click();
      cy.get('html').should('not.have.attr', 'data-theme', theme);
    });
  });
});
