const product = { _id: 'cafe-1', nome: 'Café de teste', codigo: '1', tipo: 'venda', categoria: 'Bebidas Quentes', preco: 6, estoque: 20, unidadeVenda: 'un' };
const profile = { id: 'admin-teste', role: 'admin', username: 'teste', tenantId: 'tenant-teste' };

describe('Fechamento completo da comanda', () => {
  let command;
  beforeEach(() => {
    cy.intercept('POST', '**/api/auth/refresh', { token: 'test-token', user: profile });
    cy.intercept('GET', '**/api/**', req => {
      const path = new URL(req.url).pathname;
      if (path.endsWith('/products') || path.endsWith('/products/pdv')) return req.reply([product]);
      if (path.endsWith('/mesas')) return req.reply({ mesas: [] });
      return req.reply([]);
    });
    cy.intercept('POST', '**/api/comandas', req => {
      command = { ...req.body, _id: 'comanda-1', numero: '1', status: 'aberta', valorTotal: 6, itens: req.body.itens.map(item => ({ ...item, nome: product.nome, precoUnitario: 6 })) };
      req.reply({ statusCode: 201, body: command });
    });
    cy.visit('/pdv', { onBeforeLoad(win) { win.localStorage.setItem('pdv_user', JSON.stringify(profile)); cy.stub(win, 'open').as('whatsapp'); } });
    cy.get('.product-card').contains(product.nome).click();
    cy.get('.pdv-cart-panel').contains('button', 'Fechar comanda').click();
    cy.get('.pdv-payment-dialog').within(() => {
      cy.contains('label', 'Desconto (R$)').find('input').clear().type('1');
      cy.contains('label', 'Nome do cliente').find('input').clear().type('Maria');
      cy.contains('label', 'Telefone').find('input').clear().type('11988887777');
      cy.contains('Total a receber:').should('contain', '5,00');
      cy.contains(/UTILIZAÇÃO INTERNA/i).should('not.exist');
    });
  });

  const reply = req => req.reply({ comanda: { ...command, status: 'fechada' }, pedido: { ...command, total: 5, subtotal: 6, desconto: 1, clienteNome: 'Maria', clienteTelefone: '11988887777', pagamentos: [{ metodo: 'dinheiro', valor: 5 }] } });

  it('aplica desconto e usa o telefone informado no comprovante WhatsApp', () => {
    cy.intercept('POST', '**/api/comandas/*/fechar', req => {
      expect(req.body).to.include({ desconto: 1, nome: 'Maria', telefone: '11988887777', metodoPagamento: 'dinheiro' });
      reply(req);
    }).as('close');
    cy.get('.pdv-payment-dialog').contains('button', 'Confirmar pagamento').click();
    cy.wait('@close');
    cy.contains('button', 'WhatsApp').click();
    cy.get('@whatsapp').should('have.been.calledWithMatch', 'https://wa.me/5511988887777?text=');
  });

  it('mantém desconto e contato na retomada de uma resposta incerta', () => {
    let firstBody;
    cy.intercept('POST', '**/api/comandas/*/fechar', req => {
      if (!firstBody) {
        firstBody = req.body;
        return req.reply({ statusCode: 503, body: { msg: 'Falha temporária' } });
      }
      expect(req.body).to.deep.equal(firstBody);
      reply(req);
    }).as('close');
    cy.get('.pdv-payment-dialog').contains('button', 'Confirmar pagamento').click();
    cy.wait('@close');
    cy.get('.pdv-payment-dialog').within(() => {
      cy.get('input').should('be.disabled');
      cy.contains('button', 'Voltar').click();
    });
    cy.get('.pdv-cart-panel').contains('button', 'Retomar pagamento').click();
    cy.get('.pdv-payment-dialog').contains('button', 'Confirmar pagamento').click();
    cy.wait('@close');
    cy.contains('Venda Finalizada!').should('be.visible');
  });
});
