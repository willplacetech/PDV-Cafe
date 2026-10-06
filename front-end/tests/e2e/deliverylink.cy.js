const token = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const tenant = { _id: 'tenant', nome: 'Café da Praça', configuracao: { tempoEstimadoPadraoMin: 30, mensagemWhatsApp: 'Acompanhe: {link}' } };
const pedido = { _id: 'pedido', tokenRastreamento: token, status: 'pendente', criadoEm: new Date().toISOString(), origem: { nomeCliente: 'Maria', telefone: '11988888888', endereco: { rua: 'Rua Um', numero: '12', bairro: 'Centro' } }, valorTotal: 16, taxaEntrega: 4 };

describe('DeliveryLink', () => {
  it('rastreio público carrega sem autenticação e mantém polling quando SSE falha', () => {
    cy.intercept('GET', `**/api/rastreio/${token}`, { status: 'a_caminho', nomeComercio: tenant.nome, tempoEstimado: 30, statusHistorico: [{ status: 'pendente', data: new Date().toISOString() }], whatsappComercio: 'https://wa.me/5511999999999' }).as('rastreio');
    cy.intercept('GET', `**/api/rastreio/${token}/stream`, { statusCode: 503, body: {} });
    cy.visit(`/pedido/${token}`);
    cy.wait('@rastreio');
    cy.contains('Café da Praça').should('be.visible');
    cy.contains('Chega em aproximadamente 30 min').should('be.visible');
    cy.contains('Atualização automática a cada 15 segundos').should('be.visible');
    cy.contains('a', 'Fazer novo pedido').should('have.attr', 'href', 'https://wa.me/5511999999999');
  });

  it('comércio cria pedido e despacha com mensagem WhatsApp de contingência', () => {
    cy.intercept('GET', '**/api/tenant/pedidos?*', { pedidos: [pedido], paginas: 1 });
    cy.intercept('GET', '**/api/tenant/entregadores', [{ _id: 'courier', nome: 'João', status: 'disponivel' }]);
    cy.intercept('GET', '**/api/tenant/estatisticas', { totalHoje: 1, entregues: 0, tempoMedioMin: 0, cancelados: 0 });
    cy.intercept('GET', '**/api/tenant/configuracao', tenant);
    cy.intercept('POST', '**/api/tenant/pedidos', { ...pedido }).as('criar');
    cy.intercept('POST', '**/api/tenant/pedidos/pedido/despachar', { ...pedido, status: 'despachado', whatsapp: { mensagemPronta: `Acompanhe: http://localhost:5173/pedido/${token}`, whatsappUrl: 'https://wa.me/5511988888888' } }).as('despachar');
    cy.visit('/admin', { onBeforeLoad(win) { win.localStorage.setItem('delivery_admin', JSON.stringify({ token: 'fake', user: { role: 'tenant_admin' } })); } });
    cy.contains('button', 'Novo pedido').click();
    for (const [name, value] of Object.entries({ nomeCliente: 'Maria', telefone: '11988888888', rua: 'Rua Um', numero: '12', bairro: 'Centro', valorTotal: '16' })) cy.get(`[name="${name}"]`).type(value);
    cy.contains('button', 'Criar pedido').click();
    cy.wait('@criar').its('request.body.origem.endereco.bairro').should('eq', 'Centro');
    cy.get('.delivery-order select').select('courier');
    cy.contains('button', 'Despachar').click();
    cy.wait('@despachar');
    cy.contains('Link para o cliente').should('be.visible');
  });

  it('entregador confirma entrega com confirmação explícita no celular', () => {
    cy.viewport(375, 812);
    cy.intercept('GET', '**/api/entregador/pedidos', { pedidos: [{ ...pedido, status: 'a_caminho', tenantId: tenant }], status: 'em_entrega' });
    cy.intercept('POST', '**/api/entregador/pedido/pedido/status', { ...pedido, status: 'entregue' }).as('entregar');
    cy.visit('/entregador', { onBeforeLoad(win) { win.localStorage.setItem('delivery_entregador', JSON.stringify({ token: 'fake', user: { role: 'entregador' } })); } });
    cy.on('window:confirm', () => true);
    cy.contains('button', 'Confirmar entrega').click();
    cy.wait('@entregar').its('request.body.novoStatus').should('eq', 'entregue');
    cy.contains('Entrega confirmada!').should('be.visible');
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
    cy.get('input[placeholder="Digite o nome (opcional)"]').type('Maria');
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
});
