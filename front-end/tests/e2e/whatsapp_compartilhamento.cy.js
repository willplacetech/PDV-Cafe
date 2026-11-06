const comanda = {
  _id: 'whatsapp-1', numero: '1', status: 'aberta', clienteNome: 'Maria', clienteTelefone: '11999999999',
  valorTotal: 16, historicoPagamentos: [],
  itens: [{ _id: 'item-1', nome: 'Café', quantidade: 1, precoUnitario: 16 }],
};

describe('Compartilhamento por WhatsApp', () => {
  beforeEach(() => {
    cy.login();
    cy.intercept('GET', '**/api/comandas*', [comanda]);
    cy.intercept('POST', '**/api/comandas/whatsapp-1/fechar', {
      comanda: { ...comanda, status: 'fechada' },
      pedido: { ...comanda, total: 16, status: 'pago', pagamentos: [{ tipo: 'dinheiro', valorRecebido: 16 }] },
    }).as('fechar');
    cy.visit('/comandas');
    cy.get('.comandas-list-card').contains('.comanda-select-button', 'Maria').click();
    cy.get('.comandas-detail-card').contains('button', 'Fechar comanda').click();
    cy.contains('label', 'Forma de pagamento').parent().find('[role="combobox"]').click();
    cy.contains('[role="option"]', 'Dinheiro').click();
    cy.contains('button', 'Confirmar Fechamento').click();
    cy.wait('@fechar');
  });

  it('oferece compartilhamento do comprovante após fechar a comanda', () => {
    cy.contains('button', 'Enviar pelo WhatsApp').should('be.visible').and('not.be.disabled');
  });

  it('tenta o aplicativo e abre o fallback web com o comprovante', () => {
    cy.clock();
    cy.window().then(win => {
      cy.stub(win.HTMLAnchorElement.prototype, 'click').as('openApp');
      cy.stub(win, 'open').as('openWeb');
    });
    cy.contains('button', 'Enviar pelo WhatsApp').click();
    cy.get('@openApp').should('have.been.calledOnce');
    cy.tick(1500);
    cy.get('@openWeb').should('have.been.calledOnce').its('firstCall.args.0')
      .should('include', 'https://wa.me/5511999999999?text=');
  });
});
