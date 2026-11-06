describe('Produtos e grupo de desconto', () => {
  let products;

  beforeEach(() => {
    products = [{
      _id: 'cafe-desconto',
      codigo: 'cafe-1',
      nome: 'Café',
      tipo: 'venda',
      categoria: 'Bebidas Quentes',
      preco: 16,
      estoque: 20,
      unidadeVenda: 'un',
      grupoDesconto: { nome: 'Cafés', ativo: true, quantidadeMinima: 3, percentualDesconto: 12.5 },
    }];
    cy.intercept('GET', /\/api\/products\/pdv(?:\?|$)/, req => req.reply(products));
    cy.intercept('GET', /\/api\/products(?:\?.*)?$/, req => req.reply(products));
    cy.intercept('GET', '**/api/production/recipes', []);
    cy.intercept('GET', '**/api/products/mais-vendidos*', []);
    cy.intercept('GET', '**/api/customers/pdv', []);
    cy.intercept('POST', '**/api/products', req => {
      const saved = { ...req.body, _id: 'produto-desconto-novo' };
      products = [...products, saved];
      req.reply({ statusCode: 201, body: saved });
    }).as('produto');
    cy.login();
  });

  it('persiste os campos do grupo de desconto no cadastro', () => {
    cy.visit('/produtos');
    cy.contains('label', 'Nome *').find('input').type('Bolinho de Carne');
    cy.contains('label', 'Preço de venda').find('input').clear().type('16');
    cy.contains('.product-discount-panel summary', 'Desconto por Grupo').click();
    cy.contains('label', 'Nome do grupo').find('input').type('Salgados Especiais');
    cy.contains('label', 'Quantidade mínima').find('input').type('3');
    cy.contains('label', 'Percentual aplicado').find('input').type('12.5');
    cy.get('.product-discount-active input').check();
    cy.get('.product-submit-button').click();
    cy.wait('@produto').its('request.body.grupoDesconto').should('deep.equal', {
      nome: 'Salgados Especiais', quantidadeMinima: 3, percentualDesconto: 12.5, ativo: true,
    });
    cy.contains('.product-admin-card', 'Bolinho de Carne').should('be.visible');
  });

  it('aplica desconto ao atingir três unidades do grupo', () => {
    cy.addToCart('Café');
    cy.addToCart('Café');
    cy.addToCart('Café');
    cy.get('.pdv-cart-items input[type="number"]').should('have.value', '3');
    cy.get('.pdv-cart-panel').should('contain', '42,00');
    cy.get('.pdv-cart-panel').should('contain', 'DESCONTO POR GRUPO').and('contain', '6,00');
  });
});
