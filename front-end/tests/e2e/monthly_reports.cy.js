const mesLocalAtual = () => {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
};

const rotuloMes = (mes) => {
  const [ano, numero] = mes.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(ano, numero, 0)).getUTCDate();
  return `01/${String(numero).padStart(2, '0')}/${ano} a ${String(ultimoDia).padStart(2, '0')}/${String(numero).padStart(2, '0')}/${ano}`;
};

const dashboardFixture = (mes) => ({
  comandasAbertas: 0,
  periodos: Object.fromEntries(['dia', 'semana', 'mes'].map((periodo) => [periodo, {
    total: 98, pedidos: 1, itens: 2, ticketMedio: 98, maisVendidos: [],
  }])),
  pedidosHoje: [],
  vendasHoje: { total: 98, pedidos: 1, itens: 2, recebido: 98, pendente: 0 },
  relatorioMes: {
    periodo: rotuloMes(mes),
    pedidos: 1,
    vendas: 1,
    itens: 2,
    total: mes === '2025-12' ? 1234 : 98,
    recebido: 98,
    pendente: 0,
    ticketMedio: 98,
    status: {},
    pagamentos: [],
    produtos: [],
    clientes: 0,
    vendasPorDia: [],
    vendasPorTipo: {},
    descontosQuantidade: { total: 0, produtos: [] },
  },
  relatorioClientes: { totalCadastrados: 0, clientesComCompra: 0, totalVendido: 0, totalRecebido: 0, totalPendente: 0, clientes: [] },
  insights: {},
});

const seedAdminSession = (win) => {
  win.localStorage.setItem('pdv_user', JSON.stringify({ id: 'report-admin', username: 'admin', role: 'admin' }));
  win.localStorage.setItem('pdv_user:logged-out', '1');
};

const stubSharedApis = () => {
  cy.intercept('GET', '**/api/**', { statusCode: 200, body: [] });
  cy.intercept({ method: 'GET', pathname: '/api/dashboard' }, (request) => {
    const mes = request.query.mes || mesLocalAtual();
    request.alias = mes === '2025-12' ? 'dashboardDecember' : 'dashboardMonth';
    request.reply({ statusCode: 200, body: dashboardFixture(mes) });
  });
  cy.intercept({ method: 'GET', pathname: '/api/dashboard/comparar-vendas' }, {
    statusCode: 200,
    body: {
      tipo: 'mes',
      periodoA: { total: 0, pedidos: 0, itens: 0, ticketMedio: 0, rotulo: '01/11/2026' },
      periodoB: { total: 0, pedidos: 0, itens: 0, ticketMedio: 0, rotulo: '01/10/2026' },
    },
  });
  cy.intercept({ method: 'GET', pathname: '/api/production/dashboard' }, {
    statusCode: 200, body: { baixoEstoque: [], receitasPossiveis: [], producoesRecentes: [] },
  });
};

describe('seleção mensal dos relatórios', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.intercept('GET', '**/api/**', { statusCode: 200, body: [] });
    cy.intercept('POST', '**/api/auth/refresh', { statusCode: 401, body: {} });
  });

  it('seleciona o mês do fechamento sem alterar os indicadores do dia', () => {
    stubSharedApis();
    cy.visit('/dashboard', {
      onBeforeLoad(win) {
        seedAdminSession(win);
        const document = {
          write(html) { win.printedMonthlyReport = html; },
          close() {},
        };
        cy.stub(win, 'open').returns({ document }).as('openMonthlyReport');
      },
    });

    cy.wait('@dashboardMonth').its('request.query.mes').should('equal', mesLocalAtual());
    cy.get('input[aria-label="Mês do relatório mensal"]')
      .should('have.value', mesLocalAtual())
      .clear()
      .type('2025-12');
    cy.wait('@dashboardDecember').its('request.query.mes').should('equal', '2025-12');
    cy.contains('.dashboard-monthly button', 'Mostrar').click();
    cy.contains('.dashboard-monthly', '01/12/2025 a 31/12/2025').should('be.visible');
    cy.contains('.dashboard-monthly', 'R$ 1.234,00').should('be.visible');
    cy.get('.dashboard-period').first().should('contain', 'R$ 98,00');
    cy.contains('.dashboard-monthly button', 'Imprimir relatório').click();
    cy.get('@openMonthlyReport').should('have.been.calledOnce');
    cy.window().its('printedMonthlyReport').should('contain', '01/12/2025 a 31/12/2025');
  });

  it('mantém o mês consultado coerente entre os relatórios do Financeiro', () => {
    cy.intercept({ method: 'GET', pathname: '/api/despesas/resumo' }, (request) => {
      request.alias = request.query.mes === '2025-11' ? 'expenseSummarySelected' : 'expenseSummaryInitial';
      request.reply({ statusCode: 200, body: { totalPendente: 0, totalPago: 0, totalAtrasado: 0, porCategoria: [] } });
    });
    cy.intercept({ method: 'GET', pathname: '/api/contabil/fluxo-caixa' }, {
      statusCode: 200, body: { dados: [], totalEntradas: 0, totalSaidas: 0, saldoDoMes: 0 },
    }).as('cashFlow');
    cy.intercept({ method: 'GET', pathname: '/api/contabil/dre' }, {
      statusCode: 200, body: { receitaBruta: 0, deducoes: 0, receitaLiquida: 0, cmv: 0, despesasPorCategoria: {} },
    }).as('incomeStatement');
    cy.intercept({ method: 'GET', pathname: '/api/contabil/comparar-meses' }, {
      statusCode: 200,
      body: {
        periodoA: { receita: 0, despesas: 0, lucro: 0, pedidos: 0 },
        periodoB: { receita: 0, despesas: 0, lucro: 0, pedidos: 0 },
      },
    }).as('monthComparison');
    cy.visit('/financeiro', { onBeforeLoad: seedAdminSession });

    cy.wait('@expenseSummaryInitial').its('request.query.mes').should('equal', mesLocalAtual());
    cy.get('input[type="month"]').first().clear().type('2025-11');
    cy.wait('@expenseSummarySelected').its('request.query.mes').should('equal', '2025-11');
    cy.contains('Período consultado: 11/2025').should('be.visible');

    cy.contains('button', 'Fluxo de Caixa').click();
    cy.wait('@cashFlow').its('request.query.mes').should('equal', '2025-11');
    cy.contains('Período consultado: 11/2025').should('be.visible');

    cy.contains('button', 'DRE / EBITDA').click();
    cy.wait('@incomeStatement').its('request.query.mes').should('equal', '2025-11');
    cy.contains('Período consultado: 11/2025').should('be.visible');

    cy.contains('button', 'Comparar Meses').click();
    cy.wait('@monthComparison').its('request.query').should('have.keys', ['mesA', 'mesB']);
    cy.get('input[type="month"]').first().should('have.value', '2025-11');
  });
});
