const produtos = [
  { _id: 'unidade', nome: 'Produto por unidade', unidadeVenda: 'un', vendidoFracionado: true },
  { _id: 'peso', nome: 'Produto por peso', unidadeVenda: 'kg', vendidoFracionado: false },
  { _id: 'inteiro', nome: 'Bolo inteiro', unidadeVenda: 'kg', pesoPorUnidade: 2, vendidoFracionado: true },
].map((produto, index) => ({ ...produto, codigo: String(index + 1), categoria: 'Outros', tipo: 'venda', preco: 10, estoque: 20, ativo: true }));

describe('Quantidade em novos pedidos', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/api/products/pdv', produtos);
    cy.intercept('GET', '**/api/products/mais-vendidos*', []);
    cy.intercept('GET', '**/api/products', produtos);
    cy.intercept('GET', '**/api/customers', []);
    cy.intercept('GET', '**/api/orders?*', [{
      _id: 'pedido', numero: 1, status: 'pendente', comandaId: 'comanda',
      clienteNome: 'Cliente teste', total: 10, subtotal: 10, itens: [], pagamentos: [],
      createdAt: '2026-01-01T12:00:00Z',
    }]);
  });

  const visitar = (rota) => cy.visit(rota, {
    onBeforeLoad(win) {
      win.localStorage.setItem('pdv_user', JSON.stringify({ username: 'teste', role: 'admin' }));
    },
  });

  it('avança de 1 em 1 por unidade, mesmo com a opção fracionada marcada', () => {
    visitar('/pdv');
    cy.contains('.product-card', 'Produto por unidade').click();
    cy.get('input[type="number"]').should('have.attr', 'step', '1').and('have.attr', 'min', '1');
    cy.get('input[type="number"]').parent().contains('button', '+').click();
    cy.get('input[type="number"]').should('have.value', '2');
    cy.get('input[type="number"]').parent().contains('button', '−').click();
    cy.get('input[type="number"]').should('have.value', '1');
  });

  it('mantém o passo fracionado por peso e a contagem inteira de peças', () => {
    visitar('/pdv');
    cy.contains('.product-card', 'Produto por peso').click();
    cy.get('input[type="number"]').should('have.attr', 'step', '0.001');
    cy.get('input[type="number"]').parent().contains('button', '+').click();
    cy.get('input[type="number"]').should('have.value', '1.001');
    cy.contains('.product-card', 'Bolo inteiro').click();
    cy.get('input[type="number"]').eq(1).should('have.attr', 'step', '1');
  });

  it('adiciona produtos pelo seletor do carrinho no celular', () => {
    cy.viewport(375, 812);
    visitar('/pdv');
    cy.get('.pdv-mobile-cart-trigger').click();
    cy.get('.pdv-mobile-product-select select').should('be.visible').select('unidade');
    cy.get('.pdv-cart-panel').should('have.css', 'position', 'static');
    cy.get('.pdv-cart-panel.mobile-open').should('contain', 'Produto por unidade');
    cy.contains('.product-card', 'Produto por peso').scrollIntoView().should('be.visible');
    cy.contains('.pdv-mobile-cart-close', 'Minimizar').click();
    cy.get('.pdv-cart-panel').should('not.be.visible');
    cy.get('.pdv-mobile-cart-trigger').should('have.attr', 'aria-expanded', 'false');
  });

  it('ajusta o passo no novo pedido na conta e aceita peso sem depender da opção fracionada', () => {
    visitar('/contas-receber');
    cy.contains('button', 'Novo pedido').click();
    cy.get('.novo-pedido-field select').select('unidade');
    cy.get('.novo-pedido-quantity input').should('have.attr', 'step', '1').and('have.attr', 'min', '1');
    cy.get('.novo-pedido-quantity input').clear().type('1.5');
    cy.contains('button', 'Adicionar produto').click();
    cy.get('.novo-pedido-items').should('not.exist');
    cy.get('.novo-pedido-field select').select('peso');
    cy.get('.novo-pedido-quantity input').should('have.attr', 'step', '0.001').and('have.attr', 'min', '0.001');
    cy.get('.novo-pedido-quantity input').clear().type('0.125');
    cy.contains('button', 'Adicionar produto').click();
    cy.get('.novo-pedido-items').should('contain', '0.125x').and('contain', 'Produto por peso');
    cy.get('.novo-pedido-field select').select('inteiro');
    cy.get('.novo-pedido-quantity input').should('have.attr', 'step', '1');
  });
});
