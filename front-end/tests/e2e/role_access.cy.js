const manager = { id: 'manager-role-access-e2e', username: 'manager-role-access-e2e', role: 'gerente', tenantId: null };
const authorizationToken = () => `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 300 }))}.signature`;
const product = {
  _id: 'product-manager-access-e2e',
  codigo: 'M-1',
  nome: 'Produto de teste',
  tipo: 'venda',
  tipoProduto: 'revenda',
  preco: 12,
  estoque: 4,
  unidadeVenda: 'un',
};

const visitAsManager = (path) => {
  cy.intercept('POST', '**/api/auth/refresh', { token: 'role-test-token', user: manager });
  cy.visit(path, { onBeforeLoad(win) { win.localStorage.setItem('pdv_user', JSON.stringify(manager)); } });
};

describe('Acessos de leitura e escrita por perfil', () => {
  it('gerente lista e edita produtos, sem criar nem excluir', () => {
    cy.intercept('GET', '**/api/products*', [product]).as('products');
    cy.intercept('GET', '**/api/production/recipes', []).as('recipes');
    visitAsManager('/produtos');
    cy.wait(['@products', '@recipes']);
    cy.contains('Produto de teste').should('be.visible');
    cy.get('.product-form-card').should('not.exist');
    cy.contains('button', 'Editar').should('be.visible').click();
    cy.get('.product-form-card').should('be.visible');
    cy.contains('button', 'Excluir').should('not.exist');
  });

  it('gerente salva edição de produto após aprovação da API', () => {
    const approved = authorizationToken();
    cy.intercept('GET', '**/api/configuracoes', { exigirAutorizacaoGerente: true });
    cy.intercept('GET', '**/api/products*', [product]).as('products');
    cy.intercept('GET', '**/api/production/recipes', []);
    let attempts = 0;
    cy.intercept('PUT', `**/api/products/${product._id}`, req => {
      attempts++;
      if (attempts === 1) return req.reply({ statusCode: 403, body: { msg: 'Autorização do gerente necessária', acao: 'alterar_preco' } });
      expect(req.headers['x-autorizacao-gerente']).to.equal(approved);
      req.reply({ statusCode: 200, body: product });
    }).as('updateProduct');
    cy.intercept('POST', '**/api/auth/autorizar', req => {
      expect(req.body).to.deep.equal({ senha: 'senha-gerente', acao: 'alterar_preco' });
      req.reply({ tokenAutorizacao: approved, autorizado: true });
    }).as('authorizeProductEdit');
    visitAsManager('/produtos');
    cy.wait('@products');
    cy.contains('button', 'Editar').click();
    cy.contains('label', 'Preço de venda').find('input').clear().type('13');
    cy.get('.product-submit-button').click();
    cy.wait('@updateProduct').its('response.statusCode').should('equal', 403);
    cy.get('[role="dialog"] input[aria-label="Senha do gerente ou administrador"]').type('senha-gerente');
    cy.get('[role="dialog"]').contains('button', 'Confirmar').click();
    cy.wait('@authorizeProductEdit');
    cy.wait('@updateProduct').its('response.statusCode').should('equal', 200);
    cy.get('[role="dialog"]').should('not.exist');
    cy.then(() => expect(attempts).to.equal(2));
  });

  it('gerente consulta e exporta clientes, sem ações de escrita', () => {
    cy.intercept('GET', '**/api/customers*', [{
      _id: 'customer-manager-access-e2e',
      nome: 'Cliente de teste',
      telefone: '11999999999',
    }]).as('customers');
    visitAsManager('/clientes');
    cy.wait('@customers');
    cy.get('#customer-form').should('not.exist');
    cy.contains('Cliente de teste').should('be.visible');
    cy.contains('button', 'Editar').should('not.exist');
    cy.contains('button', 'Excluir').should('not.exist');
    cy.contains('button', 'Exportar CSV').should('be.visible').click();
    cy.wait('@customers');
    cy.get('button[aria-label="Exportar lista de clientes em XML"]').should('be.visible').click();
    cy.wait('@customers');
  });

  it('gerente consulta somente o estoque de insumos na tela de produção', () => {
    cy.intercept('GET', '**/api/products*', [product]).as('products');
    cy.intercept('GET', '**/api/production/stock*', { dados: [], total: 0 }).as('stock');
    cy.intercept('GET', '**/api/production/recipes', []).as('recipes');
    cy.intercept('GET', '**/api/production/dashboard', {}).as('dashboard');
    cy.intercept('GET', '**/api/production/movements*', { dados: [], total: 0 }).as('movements');
    visitAsManager('/producao');
    cy.wait('@stock');
    cy.contains('button', 'Estoque de insumos').should('be.visible');
    cy.contains('button', 'Nova produção').should('not.exist');
    cy.contains('button', 'Custo da ficha técnica').should('not.exist');
    cy.get('@products.all').should('have.length', 0);
    cy.get('@recipes.all').should('have.length', 0);
    cy.get('@dashboard.all').should('have.length', 0);
    cy.get('@movements.all').should('have.length', 0);
  });
});
