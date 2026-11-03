const token = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const tenant = { _id: 'tenant', nome: 'Café da Praça', telefone: '11999999999', endereco: 'Rua Um, 12', taxaEntregaPadrao: 6.5, configuracao: { tempoEstimadoPadraoMin: 30, mensagemWhatsApp: 'Acompanhe: {link}' } };
const pedido = { _id: 'pedido', tokenRastreamento: token, status: 'pronto', criadoEm: new Date().toISOString(), origem: { nomeCliente: 'Maria', telefone: '11988888888', endereco: { rua: 'Rua Um', numero: '12', bairro: 'Centro' } }, valorTotal: 16, taxaEntrega: 4 };

describe('DeliveryLink', () => {
  it('rastreio público carrega sem autenticação e mantém polling quando SSE falha', () => {
    cy.intercept('GET', `**/api/rastreio/${token}`, { status: 'a_caminho', nomeComercio: tenant.nome, tempoEstimado: 30, statusHistorico: [{ status: 'pendente', data: new Date().toISOString() }], whatsappComercio: 'https://wa.me/5511999999999' }).as('rastreio');
    cy.intercept('GET', `**/api/rastreio/${token}/stream`, { statusCode: 503, body: {} });
    cy.visit(`/pedido/${token}`, { onBeforeLoad(win) {
      win.localStorage.setItem('delivery_admin:logged-out', '1');
    } });
    cy.wait('@rastreio');
    cy.contains('Café da Praça').should('be.visible');
    cy.contains('Chega em aproximadamente 30 min').should('be.visible');
    cy.contains('Pronto ✓').should('be.visible');
    cy.contains('Atualização automática a cada 15 segundos').should('be.visible');
    cy.contains('a', 'Fazer novo pedido').should('have.attr', 'href', 'https://wa.me/5511999999999');
  });

  it('redireciona rotas de administração antigas para Entregas sob a sessão e as permissões do PDV', () => {
    cy.intercept('GET', '**/api/entregas/pedidos?*', { pedidos: [], paginas: 0 });
    cy.intercept('GET', '**/api/entregas/entregadores', []);
    cy.intercept('GET', '**/api/entregas/estatisticas', {});
    cy.intercept('GET', '**/api/entregas/configuracao', tenant);
    cy.visit('/DeliveryAdmin', { onBeforeLoad(win) {
      win.localStorage.setItem('pdv_token', 'fake');
      win.localStorage.setItem('pdv_user', JSON.stringify({ username: 'operador', role: 'admin', tenantId: 'tenant' }));
    } });
    cy.location('pathname').should('eq', '/entregas');
    cy.contains('h1', 'Entregas').should('be.visible');

    cy.visit('/admin', { onBeforeLoad(win) {
      win.localStorage.setItem('pdv_user', JSON.stringify({ username: 'operador', role: 'admin', tenantId: 'tenant' }));
    } });
    cy.location('pathname').should('eq', '/entregas');
    cy.contains('h1', 'Entregas').should('be.visible');

    cy.visit('/plataforma', { onBeforeLoad(win) {
      win.localStorage.removeItem('pdv_token');
      win.localStorage.removeItem('pdv_user');
    } });
    cy.location('pathname').should('eq', '/login');
  });

  it('abre entregas pelo menu do PDV e despacha apenas pedidos prontos', () => {
    const pronto = { ...pedido, status: 'pronto', origem: { ...pedido.origem, endereco: { rua: 'Rua Um', numero: '12', bairro: 'Centro' } } };
    cy.intercept('GET', '**/api/entregas/pedidos?*', { pedidos: [pronto], paginas: 1 }).as('pedidosProntos');
    cy.intercept('GET', '**/api/entregas/entregadores', [{ _id: 'courier', nome: 'João', telefone: '11977777777', status: 'disponivel', ativo: true, tenantId: 'tenant' }]);
    cy.intercept('GET', '**/api/entregas/estatisticas', { totalHoje: 1, entregues: 0, tempoMedioMin: 0, cancelados: 0, prontos: 1, despachados: 0 }).as('estatisticas');
    cy.intercept('POST', '**/api/entregas/pedidos/pedido/despachar', { ...pronto, status: 'despachado', whatsapp: { mensagemPronta: `Acompanhe: https://pdv-delivery-9j0a.onrender.com/pedido/${token}` } }).as('despacharPronto');
    cy.visit('/pdv', { onBeforeLoad(win) {
      win.localStorage.setItem('pdv_token', 'fake');
      win.localStorage.setItem('pdv_user', JSON.stringify({ username: 'operador', role: 'admin', tenantId: 'tenant' }));
    } });
    cy.contains('.nav-link', 'Entregas').should('contain', '1').click();
    cy.wait('@pedidosProntos');
    cy.wait('@estatisticas');
    cy.contains('Fila de entregas').should('be.visible');
    cy.get('.delivery-order .searchable-select-input').click();
    cy.get('[role="option"]').contains('João').click();
    cy.contains('button', 'Despachar').click();
    cy.wait('@despacharPronto');
    cy.get('[role="status"]').contains('Pedido de Maria despachado.').should('be.visible');
    cy.contains('.delivery-success', 'Pedido de Maria despachado.').should('be.visible');
  });

  it('mantém o pedido visível e informa falha ao não conseguir marcar como pronto', () => {
    const pendente = { ...pedido, status: 'pendente' };
    cy.intercept('GET', '**/api/entregas/pedidos?*', { pedidos: [pendente], paginas: 0 });
    cy.intercept('GET', '**/api/entregas/entregadores', []);
    cy.intercept('GET', '**/api/entregas/estatisticas', {});
    cy.intercept('GET', '**/api/entregas/configuracao', tenant);
    cy.intercept('POST', '**/api/entregas/pedidos/pedido/pronto', { statusCode: 503, body: { msg: 'Falha temporária ao preparar.' } }).as('marcarPronto');
    cy.visit('/entregas', { onBeforeLoad(win) {
      win.localStorage.setItem('pdv_token', 'fake');
      win.localStorage.setItem('pdv_user', JSON.stringify({ username: 'operador', role: 'admin', tenantId: 'tenant' }));
    } });
    cy.contains('button', 'Aguardando preparo').click();
    cy.contains('.delivery-order', 'Maria').contains('button', 'Marcar como pronto').click();
    cy.wait('@marcarPronto').its('response.statusCode').should('eq', 503);
    cy.get('[role="alert"]').contains('O servidor encontrou um problema.').should('be.visible');
    cy.contains('.delivery-order', 'Maria').should('be.visible');
    cy.get('[role="alert"] button').should('not.exist');
  });

  it('permite configurar entregas no módulo integrado do PDV', () => {
    cy.intercept('GET', '**/api/entregas/pedidos?*', { pedidos: [], paginas: 0 });
    cy.intercept('GET', '**/api/entregas/entregadores', []);
    cy.intercept('GET', '**/api/entregas/estatisticas', { pendentes: 0, prontos: 0, despachados: 0, emEntrega: 0, entregues: 0, tempoMedioMin: 0 });
    cy.intercept('GET', '**/api/entregas/configuracao', tenant).as('configuracao');
    cy.intercept('PUT', '**/api/entregas/configuracao', { ...tenant, nome: 'Café Novo', telefone: '11988887777', endereco: 'Rua Nova, 45', taxaEntregaPadrao: 8, configuracao: { tempoEstimadoPadraoMin: 45, mensagemWhatsApp: 'Acompanhe: {link}' } }).as('salvarConfiguracao');
    cy.visit('/entregas', { onBeforeLoad(win) {
      win.localStorage.setItem('pdv_token', 'fake');
      win.localStorage.setItem('pdv_user', JSON.stringify({ username: 'operador', role: 'admin', tenantId: 'tenant' }));
    } });
    cy.contains('button', 'Configurações').click();
    cy.wait('@configuracao');
    cy.get('[name="nome"]').should('have.value', 'Café da Praça').clear().type('Café Novo');
    cy.get('[name="telefone"]').should('have.value', '11999999999').clear().type('11988887777');
    cy.get('[name="endereco"]').should('have.value', 'Rua Um, 12').clear().type('Rua Nova, 45');
    cy.get('[name="taxaEntregaPadrao"]').should('have.value', '6.5').clear().type('8');
    cy.get('[name="tempo"]').clear().type('45');
    cy.contains('button', 'Salvar configurações').click();
    cy.wait('@salvarConfiguracao').its('request.body').should('deep.include', {
      nome: 'Café Novo',
      telefone: '11988887777',
      endereco: 'Rua Nova, 45',
      taxaEntregaPadrao: 8,
      tempoEstimadoPadraoMin: 45,
    });
    cy.contains('Configurações salvas.').should('be.visible');
  });

  it('permite despachar a entrega na confirmação da comanda e navegar aos detalhes', () => {
    const comanda = {
      _id: 'comanda-delivery',
      numero: '0008',
      clienteNome: 'Maria',
      status: 'aberta',
      tipoAtendimento: 'balcao',
      itens: [{ _id: 'item-1', nome: 'Café', quantidade: 1, precoUnitario: 16, unidadeVenda: 'un', tipoVenda: 'unidade' }],
      valorTotal: 20,
      taxaEntrega: 4,
      historicoPagamentos: [],
      statusPagamento: 'pendente',
      entrega: { tenantId: 'tenant', telefone: '11988888888' },
    };
    const entrega = { ...pedido, _id: 'delivery-id', vendaId: comanda._id, status: 'pronto' };
    cy.intercept('GET', '**/api/comandas?status=aberta', [comanda]);
    cy.intercept('GET', '**/api/products', []);
    cy.intercept('GET', '**/api/mesas', { mesas: [], oferecerBalcao: true });
    cy.intercept('POST', `**/api/comandas/${comanda._id}/fechar`, { comanda: { ...comanda, status: 'fechada' }, pedido: { _id: 'order-id', numero: '0008', total: 20 } });
    cy.intercept('GET', `**/api/entregas/venda/${comanda._id}`, { pedido: entrega });
    cy.intercept('GET', '**/api/entregas/entregadores', [{ _id: 'courier', nome: 'João', status: 'disponivel', ativo: true }]);
    cy.intercept('POST', '**/api/entregas/pedidos/delivery-id/despachar', { ...entrega, status: 'despachado' }).as('despacharInline');
    cy.intercept('GET', '**/api/entregas/pedidos?*', { pedidos: [{ ...entrega, status: 'despachado', entregadorId: { _id: 'courier', nome: 'João' } }], paginas: 1 });
    cy.intercept('GET', '**/api/entregas/estatisticas', { pendentes: 0, prontos: 0, despachados: 1, emEntrega: 1, entregues: 0, tempoMedioMin: 0 });
    cy.intercept('GET', '**/api/entregas/configuracao', tenant);
    cy.visit('/comandas', { onBeforeLoad(win) {
      win.localStorage.setItem('pdv_token', 'fake');
      win.localStorage.setItem('pdv_user', JSON.stringify({ username: 'operador', role: 'admin', tenantId: 'tenant' }));
    } });
    cy.contains('button', 'Maria').click();
    cy.contains('button', 'Fechar comanda').click();
    cy.get('select.comandas-field').last().select('dinheiro');
    cy.contains('button', 'Confirmar Fechamento').click();
    cy.contains('Venda Delivery vinculada').should('be.visible');
    cy.get('[aria-label="Entregador para despacho"]').select('courier');
    cy.contains('button', 'Despachar agora').click();
    cy.wait('@despacharInline');
    cy.contains('button', 'Ver detalhes da entrega').click();
    cy.location('pathname').should('eq', '/entregas');
    cy.location('search').should('contain', 'pedido=delivery-id');
  });

  it('entregador confirma entrega em diálogo acessível e mantém a ação cancelável', () => {
    cy.viewport(375, 812);
    cy.intercept('GET', '**/api/entregador/pedidos', { pedidos: [{ ...pedido, status: 'a_caminho', tenantId: tenant }], status: 'em_entrega' });
    cy.intercept('POST', '**/api/entregador/pedido/pedido/status', { ...pedido, status: 'entregue' }).as('entregar');
    cy.visit('/entregador', { onBeforeLoad(win) { win.localStorage.setItem('delivery_entregador', JSON.stringify({ token: 'fake', user: { role: 'entregador' } })); } });
    cy.contains('button', 'Confirmar entrega').click();
    cy.get('[role="dialog"][aria-modal="true"]').should('contain.text', 'Confirmar que o pedido foi entregue ao cliente?');
    cy.get('[role="dialog"]').contains('button', 'Cancelar').click();
    cy.get('@entregar.all').should('have.length', 0);

    cy.contains('button', 'Confirmar entrega').click();
    cy.get('[role="dialog"]').contains('button', 'Confirmar entrega').click();
    cy.wait('@entregar').its('request.body.novoStatus').should('eq', 'entregue');
    cy.get('[role="status"]').contains('Entrega confirmada!').should('be.visible');
    cy.contains('.delivery-success', 'Entrega confirmada!').should('be.visible');
  });

  it('Entregas exibe skeleton e mantém filtro e página do servidor ao tentar novamente', () => {
    let falhaPaginaDois = true;
    const pedidos = {
      paginaUm: { pedidos: [{ ...pedido, _id: 'pedido-pagina-1', status: 'entregue' }], paginas: 2 },
      paginaDois: { pedidos: [{ ...pedido, _id: 'pedido-pagina-2', status: 'entregue', origem: { ...pedido.origem, nomeCliente: 'Maria da segunda página' } }], paginas: 2 },
    };
    cy.intercept('GET', '**/api/entregas/pedidos?*', request => {
      const query = new URL(request.url).searchParams;
      if (query.get('status') === 'entregue' && query.get('pagina') === '2' && falhaPaginaDois) {
        falhaPaginaDois = false;
        request.reply({ statusCode: 503, body: { msg: 'Falha temporária do histórico.' } });
        return;
      }
      request.reply({
        delay: query.get('status') ? 0 : 300,
        statusCode: 200,
        body: query.get('pagina') === '2' ? pedidos.paginaDois : query.get('status') ? pedidos.paginaUm : { pedidos: [], paginas: 0 },
      });
    }).as('pedidos');
    cy.intercept('GET', '**/api/entregas/entregadores', []);
    cy.intercept('GET', '**/api/entregas/estatisticas', {});
    cy.intercept('GET', '**/api/entregas/configuracao', tenant);
    cy.visit('/entregas', { onBeforeLoad(win) {
      win.localStorage.setItem('pdv_token', 'fake');
      win.localStorage.setItem('pdv_user', JSON.stringify({ username: 'operador', role: 'admin', tenantId: 'tenant' }));
    } });

    cy.get('[role="status"][aria-label="Carregando lista"]').should('be.visible');
    cy.wait('@pedidos');
    cy.contains('button', 'Histórico').click();
    cy.wait('@pedidos');
    cy.get('input.searchable-select-input').first().click();
    cy.get('[role="option"]').contains('Entregue').click();
    cy.wait('@pedidos').its('request.url').should('contain', 'status=entregue');
    cy.get('input[type="date"]').type('2026-10-16');
    cy.wait('@pedidos').its('request.url').should('contain', 'data=2026-10-16');
    cy.contains('button', 'Próxima').click();
    cy.wait('@pedidos').its('response.statusCode').should('eq', 503);

    cy.get('[role="alert"]').should('contain.text', 'O servidor encontrou um problema.');
    cy.contains('[role="alert"] button', 'Tentar novamente').click();
    cy.wait('@pedidos').then(({ request, response }) => {
      const query = new URL(request.url).searchParams;
      expect(response.statusCode).to.equal(200);
      expect(query.get('pagina')).to.equal('2');
      expect(query.get('limite')).to.equal('30');
      expect(query.get('status')).to.equal('entregue');
      expect(query.get('data')).to.equal('2026-10-16');
    });
    cy.get('.delivery-order').should('have.length', 1);
    cy.contains('.delivery-order', 'Maria da segunda página').should('be.visible');
    cy.contains('Página 2 de 2').should('be.visible');
  });

  it('cancela pedido de entrega somente após confirmação customizada e preserva o motivo', () => {
    const pendente = { ...pedido, status: 'pendente' };
    cy.intercept('GET', '**/api/entregas/pedidos?*', { pedidos: [pendente], paginas: 0 }).as('pedidosCancelaveis');
    cy.intercept('GET', '**/api/entregas/entregadores', []);
    cy.intercept('GET', '**/api/entregas/estatisticas', {});
    cy.intercept('GET', '**/api/entregas/configuracao', tenant);
    cy.intercept('POST', '**/api/entregas/pedidos/pedido/cancelar', { statusCode: 200, body: { ...pendente, status: 'cancelado' } }).as('cancelarPedido');
    cy.visit('/entregas', { onBeforeLoad(win) {
      win.localStorage.setItem('pdv_token', 'fake');
      win.localStorage.setItem('pdv_user', JSON.stringify({ username: 'operador', role: 'admin', tenantId: 'tenant' }));
    } });
    cy.wait('@pedidosCancelaveis');
    cy.contains('button', 'Aguardando preparo').click();
    cy.window().then(win => cy.stub(win, 'prompt').returns('Cliente solicitou cancelamento'));
    cy.contains('.delivery-order', 'Maria').contains('button', 'Cancelar').click();
    cy.get('[role="dialog"][aria-modal="true"]').should('contain.text', 'Cliente solicitou cancelamento');
    cy.get('[role="dialog"]').contains('button', 'Cancelar').click();
    cy.get('@cancelarPedido.all').should('have.length', 0);

    cy.contains('.delivery-order', 'Maria').contains('button', 'Cancelar').click();
    cy.get('[role="dialog"]').contains('button', 'Confirmar cancelamento').click();
    cy.wait('@cancelarPedido').its('request.body.motivo').should('eq', 'Cliente solicitou cancelamento');
    cy.get('[role="status"]').contains('Pedido cancelado.').should('be.visible');
  });

  it('courier diferencia falha de lista vazia e permite retry', () => {
    let tentativas = 0;
    cy.intercept('GET', '**/api/entregador/pedidos', request => {
      tentativas += 1;
      request.reply(tentativas === 1
        ? { statusCode: 503, body: { msg: 'Falha temporária das entregas atribuídas.' } }
        : { statusCode: 200, body: { pedidos: [], status: 'offline' } });
    }).as('entregasAtribuidas');
    cy.visit('/entregador', { onBeforeLoad(win) {
      win.localStorage.setItem('delivery_entregador', JSON.stringify({ token: 'fake', user: { role: 'entregador' } }));
    } });

    cy.get('[role="status"][aria-label="Carregando lista"]').should('be.visible');
    cy.wait('@entregasAtribuidas').its('response.statusCode').should('eq', 503);
    cy.get('[role="alert"]').should('contain.text', 'Falha temporária das entregas atribuídas.');
    cy.contains('[role="alert"] button', 'Tentar novamente').click();
    cy.wait('@entregasAtribuidas').its('response.statusCode').should('eq', 200);
    cy.contains('.estado-lista--vazio', 'Nenhuma entrega atribuída.').should('be.visible');
  });

  it.only('rastreio oferece retry após erro inicial sem interromper o fallback de atualização', () => {
    let tentativas = 0;
    cy.intercept('GET', `**/api/rastreio/${token}`, request => {
      tentativas += 1;
      request.reply(tentativas <= 2
        ? { statusCode: 503, body: { msg: 'Falha temporária do rastreio.' } }
        : { statusCode: 200, body: { status: 'a_caminho', nomeComercio: tenant.nome, tempoEstimado: 30, statusHistorico: [], whatsappComercio: 'https://wa.me/5511999999999' } });
    }).as('rastreioComRetry');
    cy.intercept('GET', `**/api/rastreio/${token}/stream`, { statusCode: 503, body: {} });
    cy.visit(`/pedido/${token}`, { onBeforeLoad(win) {
      win.localStorage.setItem('delivery_admin:logged-out', '1');
    } });

    cy.get('[role="status"][aria-label="Carregando lista"]').should('be.visible');
    cy.wait('@rastreioComRetry').its('response.statusCode').should('eq', 503);
    cy.get('[role="alert"]').should('contain.text', 'Falha temporária do rastreio.');
    cy.contains('[role="alert"] button', 'Tentar novamente').click();
    cy.wait('@rastreioComRetry.3').its('response.statusCode').should('eq', 200);
    cy.contains('h1', tenant.nome).should('be.visible');
    cy.contains('Atualização automática a cada 15 segundos').should('be.visible');
  });

  it('plataforma cadastra comércio com acesso inicial do dono', () => {
    cy.intercept('GET', '**/api/plataforma/tenants', []);
    cy.intercept('POST', '**/api/plataforma/tenants', tenant).as('criarComercio');
    cy.visit('/plataforma', { onBeforeLoad(win) { win.localStorage.setItem('delivery_admin', JSON.stringify({ token: 'fake', user: { role: 'admin_plataforma' } })); } });
    for (const [name, value] of Object.entries({ nome: 'Café da Praça', slug: 'cafe-da-praca', telefone: '11999999999', endereco: 'Rua Um', adminEmail: 'dono@teste.test', adminSenha: 'senha-temporaria-123' })) cy.get('.delivery-main > form').find(`[name="${name}"]`).type(value);
    cy.contains('button', 'Criar comércio').click();
    cy.wait('@criarComercio').its('request.body.adminEmail').should('eq', 'dono@teste.test');
    cy.contains('Comércio salvo.').should('be.visible');
  });

  it('PDV exibe taxa no total e mantém endereço na venda offline', () => {
    const produto = { _id: 'produto-delivery', codigo: 'DEL', nome: 'Café delivery', tipo: 'venda', categoria: 'Bebidas Quentes', preco: 8, estoque: 10, unidadeVenda: 'un' };
    cy.intercept('GET', '**/api/products/pdv', [produto]);
    cy.intercept('GET', '**/api/customers', []);
    cy.intercept('GET', '**/api/products/mais-vendidos*', []);
    cy.visit('/pdv', { onBeforeLoad(win) {
      win.localStorage.setItem('pdv_token', 'fake');
      win.localStorage.setItem('pdv_user', JSON.stringify({ username: 'teste', role: 'admin' }));
    } });
    cy.contains('.product-card', produto.nome).click();
    cy.get('input[placeholder="Digite o nome"]').type('Maria');
    cy.contains('label', 'Entrega ao cliente').find('input').check();
    for (const [label, value] of [['Telefone do cliente', '11988888888'], ['Rua', 'Rua Um'], ['Número', '12'], ['Bairro', 'Centro']]) cy.contains('label', label).find('input').type(value);
    cy.contains('label', 'Taxa de entrega no caixa').find('input').clear().type('4');
    cy.get('.pdv-cart-panel').should('contain', 'Taxa de entrega').and('contain', 'R$ 12,00');
    cy.window().then(win => { Object.defineProperty(win.navigator, 'onLine', { configurable: true, value: false }); win.dispatchEvent(new Event('offline')); });
    cy.contains('button', 'Abrir Comanda').click();
    cy.window().should(win => {
      const fila = JSON.parse(win.localStorage.getItem('pdv_fila_offline') || '[]');
      expect(fila).to.have.length(1);
      expect(fila[0].payload.entrega.taxaEntrega).to.equal(4);
      expect(fila[0].payload.entrega.endereco.rua).to.equal('Rua Um');
    });
  });

  it('PDV abre o pagamento na mesma tela ao finalizar a venda', () => {
    cy.viewport(1280, 900);
    const produto = { _id: 'produto-pagamento', codigo: 'PG', nome: 'Café para pagamento', tipo: 'venda', categoria: 'Bebidas Quentes', preco: 8, estoque: 10, unidadeVenda: 'un' };
    cy.intercept('GET', '**/api/products/pdv', [produto]);
    cy.intercept('GET', '**/api/customers', []);
    cy.intercept('GET', '**/api/products/mais-vendidos*', []);
    cy.intercept('GET', '**/api/comandas?status=aberta', []);
    cy.visit('/pdv', { onBeforeLoad(win) {
      win.localStorage.setItem('pdv_token', 'fake');
      win.localStorage.setItem('pdv_user', JSON.stringify({ username: 'teste', role: 'admin' }));
    } });

    cy.contains('.product-card', produto.nome).click();
    cy.window().then(win => cy.stub(win, 'open').as('abrirJanela'));
    cy.contains('.pdv-cart-panel button', 'Finalizar venda').click();
    cy.get('[role="dialog"]').should('be.visible').and('contain', 'Forma de pagamento');
    cy.get('@abrirJanela').should('not.have.been.called');
  });
});
