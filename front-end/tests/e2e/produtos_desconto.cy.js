describe('Produtos e Grupo de Desconto', () => {
  beforeEach(() => {
    cy.login('admin', 'SaborAbra26');
  });

  it('Cadastro de produto com grupo de desconto', () => {
    cy.visit('/produtos');
    cy.contains('Novo Produto').click();
    cy.get('input[name="nome"], input[placeholder*="nome"]').type('Bolinho de Carne');
    cy.get('input[name="preco"], input[placeholder*="preço"]').type('16');
    cy.get('input[name="categoria"], select[name="categoria"]').then(($el) => {
      if ($el.is('select')) cy.wrap($el).select('Salgados');
    });
    cy.get('input[name="grupoDesconto.nome"], input[placeholder*="Cookies"]').type('Salgados Especiais');
    cy.get('input[name="grupoDesconto.quantidadeMinima"]').type('3');
    cy.get('input[name="grupoDesconto.precoPromocional"]').type('14');
    cy.get('input[name="grupoDesconto.ativo"]').check();
    cy.get('button[type="submit"]').click();
    cy.url().should('include', '/produtos');
  });

  it('PDV aplica desconto por grupo ao adicionar 3+ unidades do mesmo grupo', () => {
    cy.visit('/pdv');
    cy.contains('Café').first().click();
    cy.contains('Café').first().click();
    cy.contains('Café').first().click();
    cy.get('.carrinho').should(($carrinho) => {
      expect($carrinho.text()).to.match(/DESCONTO POR GRUPO|GROUP DISCOUNT|r\$ 14/);
    });
  });
});
