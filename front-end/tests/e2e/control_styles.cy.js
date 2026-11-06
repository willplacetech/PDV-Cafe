const profile = { id: 'admin-controls', role: 'admin', username: 'teste', tenantId: 'tenant-controls' };
const product = { _id: 'product-controls', nome: 'Café de teste', codigo: '1067', tipo: 'venda', tipoProduto: 'revenda', categoria: 'Outros', preco: 12, estoque: 10, unidadeVenda: 'un', unidadeCompra: 'un' };

describe('Padrão dos controles existentes', () => {
  beforeEach(() => {
    cy.intercept('POST', '**/api/auth/refresh', { token: 'test-token', user: profile });
    cy.intercept('GET', '**/api/**', req => {
      const path = new URL(req.url).pathname;
      if (path.endsWith('/caixa/atual')) return req.reply({ fechamento: { _id: 'caixa-controls', status: 'aberto', contagemFisica: {}, outrosMeios: [], movimentos: [] }, sistema: { saldoEsperado: 0 }, outrosMeios: [] });
      return req.reply(path.endsWith('/products') ? [product] : []);
    });
  });

  const visit = route => cy.visit(route, { onBeforeLoad(win) { win.localStorage.setItem('theme', 'light'); win.localStorage.setItem('pdv_user', JSON.stringify(profile)); } });

  for (const width of [1280, 390]) {
    it(`alinha os campos de produtos com o cadastro de clientes em ${width}px`, () => {
      cy.viewport(width, 844);
      visit('/produtos');
      cy.get('.product-card-edit').click();
      cy.contains('label', 'Nome *').find('input').should('have.css', 'min-height', '40px').and('have.css', 'border-radius', '8px');
      visit('/clientes');
      cy.get('#customer-form .input-field').first().should('have.css', 'min-height', '40px').and('have.css', 'border-radius', '8px');
    });
  }

  it('mantém checkbox pequeno e paginação alinhada', () => {
    visit('/configuracoes');
    cy.get('.configuracoes-toggle input').then(input => expect(input[0].getBoundingClientRect().height).to.be.at.most(20));
    visit('/produtos');
    cy.get('.paginacao-minimalista-limite select').then(select => {
      cy.get('.paginacao-minimalista-arrow').first().then(button => {
        expect(button[0].getBoundingClientRect().height).to.equal(select[0].getBoundingClientRect().height);
      });
    });
  });

  it('preserva o destaque do valor contado e a cor de foco dos campos', () => {
    visit('/caixa');
    cy.contains('label', 'Total em dinheiro').find('input').should('have.css', 'font-size', '18px');
    visit('/usuarios');
    cy.get('input[autocomplete="username"]').focus().should('have.css', 'border-color', 'rgb(79, 157, 106)');
  });

  it('usa texto escuro no botão primário do tema escuro', () => {
    visit('/clientes');
    cy.document().then(doc => { doc.documentElement.dataset.theme = 'dark'; });
    cy.get('#customer-form .btn-primary').should('have.css', 'color', 'rgb(42, 56, 48)');
  });

  it('preserva a borda de erro no select focado dentro do formulário de produtos', () => {
    visit('/produtos');
    cy.get('.product-essential-grid [role="combobox"]').first().focus().invoke('attr', 'aria-invalid', 'true')
      .should('have.css', 'border-color', 'rgb(196, 92, 82)');
  });
});
