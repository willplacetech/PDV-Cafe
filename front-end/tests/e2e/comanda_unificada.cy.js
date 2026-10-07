const product = { _id: 'cafe-1', nome: 'Café de teste', codigo: '1', tipo: 'venda', categoria: 'Bebidas Quentes', preco: 6, estoque: 20, unidadeVenda: 'un' };
const tables = { mesas: [1, 2].map(numero => ({ id: numero, numero, nome: `Mesa ${numero}`, lugares: 2, ativa: true })) };
const profile = { id: 'admin-teste', role: 'admin', username: 'teste', tenantId: 'tenant-teste' };

describe('Comanda unificada sem serviços externos', () => {
  let orders;
  beforeEach(() => {
    orders = [];
    cy.intercept('POST', '**/api/auth/refresh', { token: 'test-token', user: profile });
    cy.intercept('GET', '**/api/**', req => {
      const path = new URL(req.url).pathname;
      if (path.endsWith('/mesas')) return req.reply(tables);
      if (path.endsWith('/comandas')) return req.reply(orders);
      if (path.endsWith('/products') || path.endsWith('/products/pdv')) return req.reply([product]);
      if (path.endsWith('/entregas/estatisticas')) return req.reply({ prontos: 0, despachados: 0 });
      return req.reply([]);
    });
    cy.intercept('POST', '**/api/comandas', req => {
      const itens = req.body.itens.map((item, index) => ({ ...item, _id: `item-${index}`, nome: product.nome, precoUnitario: item.precoUnitarioManual ?? product.preco }));
      const order = { ...req.body, _id: `comanda-${orders.length + 1}`, numero: String(orders.length + 1), status: 'aberta', itens, createdAt: new Date().toISOString(), valorTotal: itens.reduce((sum, item) => sum + item.quantidade * item.precoUnitario, Number(req.body.entrega?.taxaEntrega || 0)) };
      orders.push(order);
      req.reply({ statusCode: 201, body: order });
    }).as('save');
    cy.intercept('PATCH', '**/api/comandas/*/detalhes', req => {
      const order = orders.find(item => req.url.includes(`/${item._id}/`));
      Object.assign(order, req.body);
      req.reply(order);
    }).as('details');
    cy.intercept('PATCH', '**/api/comandas/*/cliente', { customer: {} });
    cy.intercept('POST', '**/api/comandas/*/fechar', req => {
      expect(req.body.operacaoId).to.be.a('string').and.not.be.empty;
      const order = orders.find(item => req.url.includes(`/${item._id}/`));
      req.reply({ comanda: { ...order, status: 'fechada' }, pedido: { ...order, total: order.valorTotal, status: 'pago' } });
      orders = orders.filter(item => item !== order);
    }).as('close');
    cy.visit('/pdv', { onBeforeLoad(win) { win.localStorage.setItem('pdv_user', JSON.stringify(profile)); cy.stub(win, 'open').as('openWindow'); } });
    cy.get('.product-card').contains(product.nome).should('be.visible');
  });

  const add = () => cy.get('.product-card').contains(product.nome).click();
  const panel = () => cy.get('.pdv-cart-panel');

  it('balcão tem preço preenchido e editável; pagamento conclui na mesma página', () => {
    add();
    cy.get('input[aria-label="Preço unitário de Café de teste"]').should('have.value', '6').clear().type('5').blur();
    panel().contains('button', 'Fechar venda').click();
    cy.get('[role="dialog"]').contains('R$ 5,00').should('be.visible');
    cy.contains('button', 'Confirmar pagamento').click();
    cy.wait('@save').its('request.body.itens.0.precoUnitarioManual').should('equal', 5);
    cy.wait('@close');
    cy.location('pathname').should('equal', '/pdv');
    panel().contains('Comanda sem itens').should('be.visible');
    cy.get('@openWindow').should('not.have.been.called');
    cy.contains('button', 'Imprimir Cupom').should('be.visible');
  });

  it('salva mesa e transfere a mesma comanda para mesa livre', () => {
    add();
    panel().contains('button', '🪑 Mesa').click();
    cy.get('.mesas-drawer-table').contains('Mesa 1').click();
    panel().contains('button', 'Salvar em aberto').click();
    cy.wait('@save').its('request.body.mesa').should('equal', '1');
    panel().contains('Adicionando à Mesa 1').should('be.visible');
    panel().contains('button', 'Transferir mesa').click();
    cy.get('.mesas-drawer-table').contains('Mesa 2').click();
    cy.wait('@details').its('request.body.mesa').should('equal', '2');
    panel().contains('Adicionando à Mesa 2').should('be.visible');
    cy.then(() => expect(orders).to.have.length(1));
  });

  it('novo pedido preserva comanda anterior e começa balcão vazio', () => {
    add();
    panel().contains('button', '+ Novo pedido').click();
    cy.wait('@save');
    panel().contains('Comanda sem itens').should('be.visible');
    add();
    panel().contains('button', 'Salvar em aberto').click();
    cy.wait('@save');
    cy.then(() => { expect(orders).to.have.length(2); expect(orders[0].itens[0].quantidade).to.equal(1); });
  });

  it('delivery exige endereço e envia taxa ao fechar', () => {
    add();
    panel().contains('button', '🛵 Delivery').click();
    panel().contains('button', 'Fechar venda').click();
    cy.get('.pdv-payment-dialog').should('not.exist');
    panel().contains('label', 'Nome').find('input').type('João');
    panel().contains('label', 'Telefone do cliente').find('input').type('11999999999');
    for (const [label, value] of [['Rua', 'Rua Um'], ['Número', '10'], ['Bairro', 'Centro']]) panel().contains('label', label).find('input').type(value);
    panel().contains('label', 'Taxa de entrega no caixa').find('input').clear().type('4');
    panel().contains('button', 'Fechar venda').click();
    cy.contains('button', 'Confirmar pagamento').click();
    cy.wait('@save').then(({ request }) => { expect(request.body.tipoAtendimento).to.equal('delivery'); expect(request.body.entrega.taxaEntrega).to.equal(4); });
    cy.wait('@close');
  });

  it('mobile abre comanda automaticamente e seletor de mesas ocupa tela', () => {
    cy.viewport(390, 844);
    add();
    panel().should('have.class', 'mobile-open').and('be.visible');
    panel().contains('button', '🪑 Mesa').click();
    cy.get('.mesas-drawer').should('be.visible').invoke('outerWidth').should('equal', 390);
  });

  it('visão geral reutiliza mesas e retorna ao PDV para lançar produtos', () => {
    cy.get('#sidebar-desktop').contains('Mesas / Comandas').click();
    cy.location('pathname').should('equal', '/atendimento/mesas');
    cy.get('.mesas-overview').contains('Mesa 1').should('be.visible');
    cy.contains('Lançamento rápido').should('not.exist');
    cy.get('.mesas-drawer-table').contains('Mesa 1').click();
    cy.location('pathname').should('equal', '/pdv');
    panel().contains('Mesa 1').should('be.visible');
  });

  it('resposta de pagamento perdida permite retomar a mesma operação após fechar modal', () => {
    let attempts = 0;
    let operation;
    let savedOrder;
    cy.intercept('POST', '**/api/comandas/*/fechar', req => {
      attempts++;
      if (attempts === 1) {
        operation = req.body.operacaoId;
        savedOrder = orders[0];
        orders = [];
        req.reply({ statusCode: 504, body: { msg: 'Resposta perdida depois de confirmar pagamento' } });
      } else {
        expect(req.body.operacaoId).to.equal(operation);
        req.reply({ comanda: { ...savedOrder, status: 'fechada' }, pedido: { ...savedOrder, total: savedOrder.valorTotal } });
      }
    }).as('retryPayment');
    add();
    panel().contains('button', 'Fechar venda').click();
    cy.contains('button', 'Confirmar pagamento').click();
    cy.wait('@retryPayment');
    cy.contains('button', 'Voltar').click();
    cy.contains('button', 'Retomar pagamento').click();
    cy.contains('button', 'Confirmar pagamento').click();
    cy.wait('@retryPayment');
    panel().contains('Comanda sem itens').should('be.visible');
    cy.then(() => expect(attempts).to.equal(2));
  });

  it('Dashboard aparece primeiro no Atendimento e Produção permanece na mesma tela', () => {
    const metric = { total: 0, pedidos: 0, itens: 0, ticketMedio: 0, maisVendidos: [] };
    cy.intercept('GET', '**/api/dashboard', { comandasAbertas: 0, periodos: { dia: metric, semana: metric, mes: metric } });
    cy.intercept('GET', '**/api/dashboard/comparar-vendas*', { periodoA: { ...metric, rotulo: 'Atual' }, periodoB: { ...metric, rotulo: 'Anterior' } });
    cy.intercept('GET', '**/api/dashboard/delivery*', { totalPedidos: 0, receitaTotal: 0, freteTotal: 0, porcentagemFaturamento: 0, ticketMedio: 0, ticketMedioPresencial: 0, porEntregador: [], tempoMedioMinutos: null });
    cy.intercept('GET', '**/api/production/dashboard', { receitasPossiveis: [], baixoEstoque: [], producoesRecentes: [] });
    cy.get('#sidebar-desktop .nav-group-container').contains('.nav-group-label', 'FINANCEIRO').parent().parent().find('a').first().should('contain', 'Dashboard');
    cy.get('#sidebar-desktop').contains('a', 'Dashboard').click();
    cy.location('pathname').should('equal', '/dashboard');
    cy.get('.dashboard-channel-summary').should('be.visible');
    cy.get('.dashboard-tabs').contains('button', 'Produção').click();
    cy.get('.dashboard-production-panel').should('be.visible');
    cy.get('.dashboard-channel-summary').should('be.visible');
    cy.get('.dashboard-periods').should('not.exist');
    cy.location('pathname').should('equal', '/dashboard');
    cy.get('.dashboard-tabs').contains('button', 'Vendas').click();
    cy.get('.dashboard-periods').should('be.visible');
  });

  it('Delivery mostra carregamento, permite repetir falha e troca o período', () => {
    const metric = { total: 0, pedidos: 0, itens: 0, ticketMedio: 0, maisVendidos: [] };
    const delivery = { totalPedidos: 2, receitaTotal: 50, freteTotal: 10, porcentagemFaturamento: 100, ticketMedio: 25, ticketMedioPresencial: 0, porEntregador: [], tempoMedioMinutos: 20 };
    cy.intercept('GET', '**/api/dashboard', { comandasAbertas: 0, periodos: { dia: metric, semana: metric, mes: metric } });
    cy.intercept('GET', '**/api/dashboard/comparar-vendas*', { periodoA: { ...metric, rotulo: 'Atual' }, periodoB: { ...metric, rotulo: 'Anterior' } });
    cy.intercept('GET', '**/api/dashboard/receita-7-dias', []);
    let falhar = true;
    cy.intercept('GET', '**/api/dashboard/delivery*', req => {
      if (req.query.periodo === 'mes') req.alias = 'deliveryMes';
      if (falhar) req.reply({ statusCode: 503, delay: 500, body: { msg: 'Serviço temporariamente indisponível' } });
      else req.reply({ delay: 500, body: { ...delivery, totalPedidos: req.query.periodo === 'mes' ? 8 : 2 } });
    }).as('deliveryMetrics');
    cy.get('#sidebar-desktop').contains('a', 'Dashboard').click();
    cy.get('.delivery-summary').contains('Carregando indicadores de Delivery').should('be.visible');
    cy.wait('@deliveryMetrics');
    cy.get('.delivery-summary [role="alert"]').should('be.visible').and('contain', 'O servidor encontrou um problema');
    cy.then(() => { falhar = false; });
    cy.get('.delivery-summary').contains('button', 'Tentar novamente').click();
    cy.wait('@deliveryMetrics');
    cy.get('.delivery-summary-grid article').first().find('strong').should('have.text', '2');
    cy.get('.delivery-summary-grid').contains('R$ 50,00').should('be.visible');
    cy.get('.delivery-summary').contains('button', 'Este mês').click();
    cy.get('.delivery-summary-grid').should('not.exist');
    cy.wait('@deliveryMes').its('request.query.periodo').should('equal', 'mes');
    cy.get('.delivery-summary-grid article').first().find('strong').should('have.text', '8');
  });

  it('pagamento incerto impede trocar de mesa pelo botão do cabeçalho', () => {
    cy.intercept('POST', '**/api/comandas/*/fechar', { statusCode: 504, body: { msg: 'Sem confirmação' } }).as('uncertainPayment');
    add();
    panel().contains('button', 'Fechar venda').click();
    cy.contains('button', 'Confirmar pagamento').click();
    cy.wait('@uncertainPayment');
    cy.contains('button', 'Voltar').click();
    cy.get('.pdv-mesas-trigger').click();
    cy.get('.mesas-drawer-table').contains('Mesa 2').click();
    cy.get('.pdv-payment-dialog').should('be.visible');
    cy.then(() => { expect(orders).to.have.length(1); expect(orders[0].tipoAtendimento).to.equal('balcao'); });
  });
});
