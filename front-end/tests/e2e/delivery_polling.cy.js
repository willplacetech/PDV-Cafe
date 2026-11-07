const user = {
  id: 'admin-poll',
  role: 'admin',
  username: 'teste',
  tenantId: 'tenant-poll',
};
const comercio = {
  _id: 'tenant-poll',
  nome: 'Café teste',
  telefone: '11999999999',
  endereco: 'Rua Um, 12',
  taxaEntregaPadrao: 5,
  configuracao: {
    tempoEstimadoPadraoMin: 30,
    mensagemWhatsApp: 'Acompanhe: {link}',
  },
};
const pedido = {
  _id: 'pedido-poll',
  status: 'pendente',
  criadoEm: '2026-10-15T12:00:00.000Z',
  origem: {
    nomeCliente: 'Maria',
    telefone: '11999999999',
    endereco: { rua: 'Rua Um', numero: '12', bairro: 'Centro' },
  },
  valorTotal: 15,
  taxaEntrega: 5,
};

describe('Atualização silenciosa da fila de entregas', () => {
  it('mantém pedidos carregados visíveis se a atualização após uma ação falhar', () => {
    let consultasPedidos = 0;
    cy.intercept('POST', '**/api/auth/refresh', { token: 'sessao-poll', user });
    cy.intercept('GET', '**/api/entregas/pedidos?*', (request) => {
      consultasPedidos += 1;
      request.reply(
        consultasPedidos === 1
          ? {
              statusCode: 200,
              body: { pedidos: [pedido], total: 1, paginas: 1 },
            }
          : {
              statusCode: 503,
              body: { msg: 'Falha temporária na atualização.' },
            }
      );
    }).as('pedidos');
    cy.intercept('GET', '**/api/entregas/entregadores', []);
    cy.intercept('GET', '**/api/entregas/estatisticas', {});
    cy.intercept('GET', '**/api/entregas/configuracao', comercio);
    cy.intercept('POST', '**/api/entregas/pedidos/pedido-poll/pronto', {
      ...pedido,
      status: 'pronto',
    }).as('marcarPronto');
    cy.visit('/entregas', {
      onBeforeLoad(win) {
        win.localStorage.setItem('pdv_token', 'fake');
        win.localStorage.setItem('pdv_user', JSON.stringify(user));
      },
    });
    cy.wait('@pedidos');
    cy.contains('button', 'Aguardando preparo').click();
    cy.contains('.delivery-order', 'Maria').should('be.visible');

    cy.contains('.delivery-order', 'Maria')
      .contains('button', 'Marcar como pronto')
      .click();
    cy.wait('@marcarPronto');
    cy.wait('@pedidos').its('response.statusCode').should('eq', 503);
    cy.contains('.delivery-order', 'Maria').should('be.visible');
    cy.get('.estado-lista--erro').should('not.exist');
  });
});
