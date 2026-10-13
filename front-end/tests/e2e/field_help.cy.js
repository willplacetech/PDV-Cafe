const profile = { id: 'admin-help', role: 'admin', username: 'teste' };
const product = { _id: 'produto-help', nome: 'Biscoito de teste', codigo: '1067', tipo: 'venda', tipoProduto: 'revenda', categoria: 'Outros', preco: 12, estoque: 0, estoqueMinimo: 5, unidadeVenda: 'un', unidadeCompra: 'un' };

describe('Ajuda dos campos', () => {
  beforeEach(() => {
    cy.intercept('POST', '**/api/auth/refresh', { token: 'test-token', user: profile });
    cy.intercept('GET', '**/api/**', req => req.reply(new URL(req.url).pathname.endsWith('/products') ? [product] : []));
    cy.visit('/produtos', { onBeforeLoad(win) { win.localStorage.setItem('pdv_user', JSON.stringify(profile)); } });
    cy.get('.product-card-edit').click();
  });

  it('alinha os inputs no desktop e mantém ajuda na mesma linha do label', () => {
    cy.contains('label', 'Código').find('.field-label-line').should('contain', '(bloqueado)');
    cy.contains('label', 'Código').find('input').then(code => {
      cy.contains('label', 'Nome *').find('input').then(name => {
        expect(Math.abs(code[0].getBoundingClientRect().top - name[0].getBoundingClientRect().top)).to.be.lessThan(2);
      });
    });
    cy.contains('label', 'Estoque mínimo').find('.field-label-line').should('contain', 'Alerta quando chegar neste nível');
    cy.get('[role="tooltip"]').should('not.exist');
  });

  it('mostra ajuda flutuante apenas no campo focado no mobile, inclusive readonly e selects', () => {
    cy.viewport(390, 844);
    cy.get('[role="tooltip"]').should('not.exist');
    cy.contains('label', 'Código').find('input').focus();
    cy.get('[role="tooltip"]').should('be.visible').and('contain', '(bloqueado)');
    cy.contains('label', 'Estoque mínimo').find('input').focus();
    cy.get('[role="tooltip"]').should('have.length', 1).and('contain', 'Alerta quando chegar neste nível');
    cy.get('[role="tooltip"]').then(tip => {
      const rect = tip[0].getBoundingClientRect();
      expect(rect.left).to.be.at.least(0);
      expect(rect.right).to.be.at.most(390);
    });
    cy.contains('label', 'Nome *').find('input').focus();
    cy.get('[role="tooltip"]').should('not.exist');
    cy.viewport(1280, 720);
    cy.contains('label', 'Código').find('input').focus();
    cy.get('[role="tooltip"]').should('not.exist');
    cy.viewport(390, 844);
    cy.contains('label', 'Insumo / Matéria-prima').find('input').check();
    cy.contains('label', 'Tipo de embalagem *').find('[role="combobox"]').focus();
    cy.get('[role="tooltip"]').should('be.visible').and('contain', 'Unidade em que você compra');
    cy.contains('label', 'Tipo de embalagem *').find('[role="combobox"]').type('{esc}');
    cy.get('[role="tooltip"]').should('not.exist');
  });

  it('vincula a ajuda ao campo em cadastros com label separado do input', () => {
    cy.viewport(390, 844);
    cy.visit('/clientes', { onBeforeLoad(win) { win.localStorage.setItem('pdv_user', JSON.stringify(profile)); } });
    cy.contains('label', 'CPF').next('input').focus();
    cy.get('[role="tooltip"]').should('be.visible').and('contain', '(opcional/único)');
    cy.contains('label', 'CPF').next('input').invoke('attr', 'aria-describedby').then(id => {
      cy.get(`[id="${id}"]`).should('contain', '(opcional/único)');
    });
    cy.contains('label', 'Telefone *').next('input').focus();
    cy.get('[role="tooltip"]').should('have.length', 1).and('contain', '(obrigatório)');
  });
});
