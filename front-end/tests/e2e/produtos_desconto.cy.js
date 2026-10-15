describe('Produtos e grupo de desconto', () => {
  beforeEach(() => cy.login());

  it('persiste os campos do grupo de desconto no cadastro', () => {
    cy.intercept('POST', '**/api/products').as('produto');
    cy.visit('/produtos');
    cy.contains('label', 'Nome *').find('input').type('Bolinho de Carne');
    cy.contains('label', 'Preço de venda').find('input').clear().type('16');
    cy.contains('.product-discount-panel summary', 'Desconto por Grupo').click();
    cy.contains('label', 'Nome do grupo').find('input').type('Salgados Especiais');
    cy.contains('label', 'Quantidade mínima').find('input').type('3');
    cy.contains('label', 'Preço promocional').find('input').type('14');
    cy.get('.product-discount-active input').check();
    cy.get('.product-submit-button').click();
    cy.wait('@produto').its('request.body.grupoDesconto').should('deep.equal', {
      nome: 'Salgados Especiais', quantidadeMinima: 3, precoPromocional: 14, ativo: true,
    });
    cy.contains('.product-card', 'Bolinho de Carne').should('be.visible');
  });

  it('aplica desconto ao atingir três unidades do grupo', () => {
    cy.addToCart('Café');
    cy.addToCart('Café');
    cy.addToCart('Café');
    cy.get('.pdv-cart-items input[type="number"]').should('have.value', '3');
    cy.get('.pdv-cart-panel').should('contain', '42,00');
    cy.get('.pdv-cart-items').should('contain', '14,00');
  });
});
