const token = () => `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 300 }))}.signature`;

describe('Autorização de gerente', () => {
  beforeEach(() => cy.login());

  it('gerente autoriza sem senha e reutiliza autorização por ação', () => {
    let authorizations = 0;
    cy.intercept('POST', '**/api/auth/autorizar', req => {
      expect(req.body).to.deep.equal({ acao: 'excluir_item' });
      authorizations++;
      req.reply({ tokenAutorizacao: token(), autorizado: true });
    }).as('approval');
    cy.addToCart('Café');
    cy.get('.pdv-cart-items').contains('button', '✕').click();
    cy.wait('@approval');
    cy.get('[role="dialog"]').should('not.exist');
    cy.get('.pdv-cart-items').should('not.exist');
    cy.addToCart('Café');
    cy.get('.pdv-cart-items').contains('button', '✕').click();
    cy.get('.pdv-cart-items').should('not.exist');
    cy.get('[role="dialog"]').should('not.exist');
    cy.then(() => expect(authorizations).to.equal(1));
  });

  it('mostra o bloqueio de 60s retornado pelo servidor', () => {
    cy.login('operador-e2e', 'isolated-test-password', 'operador');
    let attempts = 0;
    cy.intercept('POST', '**/api/auth/autorizar', req => {
      attempts++;
      req.reply(attempts < 3
        ? { statusCode: 403, body: { msg: 'Senha incorreta', tentativasRestantes: 3 - attempts } }
        : { statusCode: 429, body: { msg: 'Autorização bloqueada. Aguarde 60s.', bloqueadoAte: Date.now() + 60_000 } });
    }).as('approval');
    cy.addToCart('Café');
    cy.get('.pdv-cart-items').contains('button', '✕').click();
    for (let i = 0; i < 3; i++) {
      cy.get('[role="dialog"] input[type="password"]').type('senha-errada');
      cy.get('[role="dialog"]').contains('button', 'Confirmar').click();
      cy.wait('@approval');
    }
    cy.get('[role="alert"]').should('contain', '60s');
    cy.get('[role="dialog"] input[type="password"]').should('be.disabled');
    cy.get('[role="dialog"]').contains('button', 'Confirmar').should('be.disabled');
  });

  it('responde ao 403 da API e repete com o header aprovado', () => {
    const approved = token();
    let calls = 0;
    cy.intercept('GET', '**/api/customers', [{ _id: 'customer-approval', nome: 'Cliente teste', telefone: '11999999999' }]);
    cy.intercept('DELETE', '**/api/customers/customer-approval', req => {
      calls++;
      if (calls === 1) return req.reply({ statusCode: 403, body: { msg: 'Autorização do gerente necessária', acao: 'excluir_cliente' } });
      expect(req.headers['x-autorizacao-gerente']).to.equal(approved);
      req.reply({ statusCode: 204 });
    }).as('delete');
    cy.intercept('POST', '**/api/auth/autorizar', req => {
      expect(req.body).to.deep.equal({ acao: 'excluir_cliente' });
      req.reply({ tokenAutorizacao: approved, autorizado: true });
    });
    cy.visit('/clientes');
    cy.contains('tbody tr', 'Cliente teste').contains('button', 'Excluir').click();
    cy.get('[role="dialog"]').should('contain', 'Excluir este cliente?');
    cy.get('[role="dialog"]').contains('button', 'Excluir').click();
    cy.wait('@delete');
    cy.wait('@delete');
    cy.get('[role="dialog"]').should('not.exist');
    cy.then(() => expect(calls).to.equal(2));
  });
});
