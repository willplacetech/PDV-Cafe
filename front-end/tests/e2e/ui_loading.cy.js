const user = { id: 'admin-ui', role: 'admin', username: 'teste', tenantId: 'tenant-ui' };
const comercio = { _id: 'tenant-ui', nome: 'Café teste', taxaEntregaPadrao: 5, configuracao: {} };
const pedido = {
  _id: 'pedido-ui', status: 'pendente', criadoEm: '2026-10-15T12:00:00.000Z',
  origem: { nomeCliente: 'Maria', telefone: '11999999999', endereco: {} },
  valorTotal: 15, taxaEntrega: 5,
};

describe('Carregamento das telas e foco de entregas', () => {
  beforeEach(() => {
    cy.intercept('POST', '**/api/auth/refresh', { token: 'sessao-ui', user });
    cy.intercept('GET', '**/api/**', []);
  });

  it('abre a fila do pedido destacado e preserva a aba escolhida após polling', () => {
    cy.intercept('GET', '**/api/entregas/pedidos?*', { pedidos: [pedido], paginas: 1 }).as('pedidos');
    cy.intercept('GET', '**/api/entregas/estatisticas', {});
    cy.intercept('GET', '**/api/entregas/configuracao', comercio);
    cy.clock(new Date('2026-10-15T12:10:00.000Z').getTime(), ['Date', 'setInterval', 'clearInterval']);
    cy.visit('/entregas?pedido=pedido-ui');
    cy.wait('@pedidos');
    cy.contains('button', 'Aguardando preparo').should('have.attr', 'aria-selected', 'true');
    cy.get('#pedido-pedido-ui').should('be.visible').and('have.attr', 'aria-current', 'true');
    cy.contains('button', 'Configurações').click();
    cy.get('input[name="nome"]').should('have.value', comercio.nome);
    cy.tick(15000);
    cy.wait('@pedidos');
    cy.contains('button', 'Configurações').should('have.attr', 'aria-selected', 'true');
    cy.get('input[name="nome"]').should('be.visible');
  });

  it('recarrega usuários após erro sem perder os indicadores de carregamento', () => {
    cy.intercept('GET', '**/api/auth/users', { statusCode: 400, body: { msg: 'Falha na lista de usuários' } });
    cy.visit('/usuarios');
    cy.contains('[role="alert"]', 'Falha na lista de usuários').should('be.visible');
    cy.intercept('GET', '**/api/auth/users', { delay: 250, body: [{ ...user, ativo: true }] }).as('usuarios');
    cy.contains('[role="alert"]', 'Falha na lista de usuários').within(() => {
      cy.contains('button', 'Tentar novamente').click();
    });
    cy.contains('[role="status"]', 'Carregando usuários').should('be.visible');
    cy.wait('@usuarios');
    cy.contains('td', user.username).should('be.visible');
    cy.contains('Falha na lista de usuários').should('not.exist');
    cy.contains('Carregando usuários').should('not.exist');
  });

  it('orienta liberar pop-ups quando o navegador bloqueia o relatório mensal', () => {
    const periodo = { pedidos: 0, itens: 0, total: 0, ticketMedio: 0, maisVendidos: [] };
    cy.intercept('GET', '**/api/dashboard', { periodos: { dia: periodo, semana: periodo, mes: periodo } });
    cy.intercept('GET', '**/api/dashboard/comparar-vendas?*', { periodoA: { rotulo: 'Atual' }, periodoB: { rotulo: 'Anterior' }, variacao: {} });
    cy.visit('/dashboard', { onBeforeLoad(win) { cy.stub(win, 'open').returns(null).as('abrirRelatorio'); } });
    cy.contains('button', 'Imprimir relatório').click();
    cy.get('@abrirRelatorio').should('have.been.calledOnce');
    cy.contains('Permita pop-ups para imprimir o relatório.').should('be.visible');
  });
});
