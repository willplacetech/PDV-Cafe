describe('Clientes e Aniversário', () => {
  beforeEach(() => {
    cy.login('admin', 'SaborAbra26');
  });

  it('Cadastrar cliente com aniversário no formato DD/MM', () => {
    cy.visit('/clientes');
    cy.contains('Novo Cliente').click();
    cy.get('input[name="nome"], input[placeholder*="nome"]').type('_cliente_teste_e2e');
    cy.get('input[name="telefone"], input[placeholder*="telefone"]').type('11999887766');
    cy.get('input[name="aniversario"], input[placeholder="DD/MM/AAAA"]').type('15061990');
    cy.get('button[type="submit"]').click();
    cy.url().should('include', '/clientes');
  });

  it('Campo Endereço foi substituído por Aniversário', () => {
    cy.visit('/clientes');
    cy.contains('Novo Cliente').click();
    cy.get('label').contains('Aniversário').should('exist');
    cy.get('label').contains('Endereço').should('not.exist');
  });

  it('Clientes exibem coluna Aniv. no invés de Endereço', () => {
    cy.get('th').contains('Aniv.').should('exist');
    cy.get('th').contains('Endereço').should('not.exist');
  });
});
