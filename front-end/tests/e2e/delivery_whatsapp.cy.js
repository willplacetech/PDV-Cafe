const product = { _id: 'cafe-delivery', nome: 'Café delivery', codigo: '1', tipo: 'venda', categoria: 'Bebidas Quentes', preco: 8, estoque: 20, unidadeVenda: 'un' };
const profile = { id: 'admin-teste', role: 'admin', username: 'teste' };

describe('WhatsApp para nova comanda delivery', () => {
  beforeEach(() => {
    cy.intercept('POST', '**/api/auth/refresh', { token: 'test-token', user: profile });
    cy.intercept('GET', '**/api/products/pdv', [product]);
    cy.intercept('GET', '**/api/customers/pdv', []);
    cy.intercept('GET', '**/api/products/mais-vendidos?limite=8', []);
    cy.intercept('GET', '**/api/comandas?status=aberta', []);
    cy.intercept('POST', '**/api/comandas', req => {
      const comanda = {
        ...req.body,
        _id: 'comanda-delivery',
        numero: '12',
        tipoAtendimento: 'delivery',
        clienteTelefone: req.body.entrega.telefone,
        taxaEntrega: req.body.entrega.taxaEntrega,
        status: 'aberta',
        createdAt: new Date().toISOString(),
        itens: req.body.itens.map(item => ({ ...item, nome: product.nome, precoUnitario: product.preco })),
      };
      req.reply({ statusCode: 201, body: comanda });
    }).as('saveDelivery');
    cy.visit('/pdv', { onBeforeLoad(win) {
      win.localStorage.setItem('pdv_user', JSON.stringify(profile));
      cy.stub(win, 'open').as('openWindow');
      cy.stub(win.HTMLAnchorElement.prototype, 'click').as('anchorClick');
    } });
  });

  it('mostra o WhatsApp logo após salvar e inclui taxa no comprovante', () => {
    cy.get('.product-card').contains(product.nome).click();
    cy.get('.pdv-cart-panel').contains('button', '🛵 Delivery').click();
    cy.get('.pdv-cart-panel').contains('label', 'Nome').find('input').type('Maria');
    cy.get('.pdv-cart-panel').contains('label', 'Telefone do cliente').find('input').type('11999999999');
    for (const [label, value] of [['Rua', 'Rua Um'], ['Número', '10'], ['Bairro', 'Centro']]) {
      cy.get('.pdv-cart-panel').contains('label', label).find('input').type(value);
    }
    cy.get('.pdv-cart-panel').contains('label', 'Taxa de entrega no caixa').find('input').clear().type('4');
    cy.get('.pdv-cart-panel').contains('button', 'Salvar em aberto').click();

    cy.wait('@saveDelivery').its('request.body.entrega.taxaEntrega').should('equal', 4);
    cy.get('.pdv-delivery-saved-dialog').should('be.visible').and('contain', 'R$ 4,00');
    cy.get('.pdv-delivery-saved-dialog').contains('button', 'Enviar comprovante pelo WhatsApp').click();
    cy.get('@openWindow').should('have.been.calledWithMatch', /wa\.me\/5511999999999\?text=/);
    cy.get('@openWindow').then(openWindow => {
      const mensagem = new URL(openWindow.lastCall.args[0]).searchParams.get('text');
      expect(mensagem).to.include('Taxa de entrega:');
      expect(mensagem).to.include('R$ 4,00');
    });
  });
});
