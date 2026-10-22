const mesaToken = 'mesa-test-token';
const clienteStorageKey = `pdv-cardapio-cliente:${mesaToken}`;
const cardapio = {
  mesa: { numero: 5, nome: 'Mesa do jardim' },
  produtos: [{
    produtoId: 'produto-cafe',
    nome: 'Café coado',
    categoria: 'Bebidas',
    preco: 6,
    unidadeVenda: 'un',
  }],
};
const tokenQr = 'q'.repeat(43);
const perfilPdv = { id: 'qr-test-admin', username: 'qr-test-admin', role: 'admin' };
const mesasQr = [
  { id: 5, numero: 5, nome: 'Mesa 5', lugares: 4, ativa: true, token: tokenQr },
  { id: 6, numero: 6, nome: 'Mesa 6', lugares: 2, ativa: false, token: 'i'.repeat(43) },
];
const comandaQr = {
  _id: 'comanda-qr-104',
  numero: '0104',
  origem: 'qr',
  tipoAtendimento: 'mesa',
  mesa: '5',
  clienteNome: 'Ana Cliente',
  clienteTelefone: '11999998888',
  status: 'aberta',
  statusPagamento: 'pendente',
  createdAt: '2026-10-22T12:00:00.000Z',
  itens: [{
    _id: 'item-qr-1',
    nome: 'Café coado',
    quantidade: 1,
    unidadeVenda: 'un',
    aFazer: false,
    observacao: 'sem açúcar',
    modificadores: [],
  }],
};

const carregarRotaPublica = (options = {}) => {
  cy.intercept('GET', `**/api/pedidos/auto-atendimento/${mesaToken}`, cardapio).as('cardapio');
  cy.visit(`/cardapio/${mesaToken}`, options);
};

const preencherCliente = () => {
  cy.get('[name="clienteNome"]').clear().type('Ana Cliente');
  cy.get('[name="clienteTelefone"]').clear().type('11999998888');
};

const visitarRotaPrivada = (rota) => {
  cy.intercept('POST', '**/api/auth/refresh', { token: 'test-token', user: perfilPdv });
  cy.intercept('GET', '**/api/configuracoes', { exigirAutorizacaoGerente: false, bloqueadoPorSuporte: false });
  cy.visit(rota, {
    onBeforeLoad(win) {
      win.localStorage.setItem('pdv_user', JSON.stringify(perfilPdv));
    },
  });
};

describe('Cardápio público por QR', () => {
  it('abre sem login e valida nome e telefone antes de carregar o cardápio', () => {
    carregarRotaPublica();

    cy.contains('h1', 'Antes de pedir').should('be.visible');
    cy.get('[name="clienteNome"]').should('be.visible');
    cy.get('[name="clienteTelefone"]').should('be.visible');
    cy.get('[data-testid="produto-qr-produto-cafe"]').should('not.exist');

    cy.get('[name="clienteNome"]').type('Ana');
    cy.get('[name="clienteTelefone"]').type('119999');
    cy.contains('button', 'Continuar').click();
    cy.contains('Informe um telefone válido').should('be.visible');
    cy.get('[data-testid="produto-qr-produto-cafe"]').should('not.exist');

    cy.get('[name="clienteTelefone"]').clear().type('11999998888');
    cy.contains('button', 'Continuar').click();
    cy.wait('@cardapio');
    cy.contains('h1', 'Cardápio').should('be.visible');
    cy.contains('Mesa do jardim').should('be.visible');
    cy.get('[data-testid="produto-qr-produto-cafe"]').should('contain', 'Café coado');
  });

  it('exige consentimento, envia somente os campos do contrato e limpa os dados após confirmar', () => {
    cy.intercept('GET', `**/api/pedidos/auto-atendimento/${mesaToken}`, cardapio).as('cardapio');
    cy.intercept('POST', '**/api/pedidos/auto-atendimento', {
      statusCode: 201,
      body: { comandaId: 'comanda-104', numero: 104, status: 'aberta', mesa: '5' },
    }).as('pedido');
    cy.visit(`/cardapio/${mesaToken}`);
    preencherCliente();
    cy.contains('button', 'Continuar').click();
    cy.wait('@cardapio');

    cy.get('[data-testid="produto-qr-produto-cafe"]').within(() => cy.contains('button', 'Adicionar').click());
    cy.get('[aria-label="Observação Café coado"]').type('sem açúcar');
    cy.contains('Aceito receber atualizações do meu pedido por WhatsApp').should('be.visible');
    cy.contains('button', 'Finalizar pedido').click();
    cy.get('@pedido.all').should('have.length', 0);

    cy.get('[name="consentimentoWhatsApp"]').check();
    cy.contains('button', 'Finalizar pedido').click();
    cy.wait('@pedido').then(({ request }) => {
      expect(request.headers['idempotency-key']).to.be.a('string').and.not.be.empty;
      expect(request.body).to.deep.equal({
        mesaToken,
        clienteNome: 'Ana Cliente',
        clienteTelefone: '11999998888',
        consentimentoWhatsApp: true,
        itens: [{ produtoId: 'produto-cafe', quantidade: 1, observacao: 'sem açúcar' }],
      });
    });

    cy.contains('Pedido #104').should('be.visible');
    cy.contains('11999998888').should('not.exist');
    cy.window().its('sessionStorage').invoke('getItem', clienteStorageKey).should('be.null');
  });

  it('mantém formulário e carrinho se o envio falhar e não pula a identificação salva na sessão', () => {
    cy.intercept('GET', `**/api/pedidos/auto-atendimento/${mesaToken}`, cardapio).as('cardapio');
    cy.intercept('POST', '**/api/pedidos/auto-atendimento', {
      statusCode: 503,
      body: { msg: 'Serviço temporariamente indisponível' },
    }).as('pedido');
    carregarRotaPublica({
      onBeforeLoad(win) {
        win.sessionStorage.setItem(clienteStorageKey, JSON.stringify({
          nome: 'Ana Cliente',
          telefone: '11999998888',
        }));
      },
    });

    cy.contains('h1', 'Antes de pedir').should('be.visible');
    cy.get('[name="clienteNome"]').should('have.value', 'Ana Cliente');
    cy.get('[name="clienteTelefone"]').should('have.value', '(11) 99999-8888');
    cy.contains('button', 'Continuar').click();
    cy.wait('@cardapio');
    cy.get('[data-testid="produto-qr-produto-cafe"]').within(() => cy.contains('button', 'Adicionar').click());
    cy.get('[name="consentimentoWhatsApp"]').check();
    cy.contains('button', 'Finalizar pedido').click();

    cy.wait('@pedido');
    cy.contains('O servidor encontrou um problema').should('be.visible');
    cy.get('[data-testid="produto-qr-produto-cafe"]').should('be.visible');
    cy.window().its('sessionStorage').invoke('getItem', clienteStorageKey).should('not.be.null');
  });

  it('exibe QR local somente para mesas ativas e imprime apenas o QR selecionado', () => {
    cy.intercept('GET', '**/api/mesas', { statusCode: 200, body: { mesas: mesasQr, oferecerBalcao: true } }).as('mesas');
    cy.intercept('PUT', '**/api/mesas', (request) => {
      request.reply({ statusCode: 200, body: request.body });
    }).as('salvarMesas');
    cy.login();
    cy.visit('/cadastro/mesas');
    cy.wait('@mesas');

    cy.get('a[href$="/cardapio/' + tokenQr + '"]').should('have.attr', 'href', `${window.location.origin}/cardapio/${tokenQr}`);
    cy.get('img[alt="QR code da Mesa 5"]').should('have.attr', 'src').and('match', /^data:image\/png;base64,/);
    cy.get('tbody tr').eq(1).should('not.contain', 'Imprimir QR').and('not.contain', '/cardapio/');

    cy.get('tbody tr').first().find('input').first().clear().type('Mesa externa');
    cy.contains('button', 'Salvar').click();
    cy.wait('@salvarMesas');
    cy.get('a[href$="/cardapio/' + tokenQr + '"]').should('be.visible');

    cy.window().then((win) => {
      cy.stub(win, 'print').callsFake(() => {
        expect(win.document.body.dataset.mesaQrImpressao).to.equal('mesa-5');
      }).as('imprimirQr');
    });
    cy.contains('button', 'Imprimir QR da Mesa 5').click();
    cy.get('@imprimirQr').should('have.been.calledOnce');
  });

  it('destaca pedido QR no KDS, mostra observação e não exibe o telefone', () => {
    cy.intercept('GET', '**/api/comandas/cozinha', {
      statusCode: 200,
      body: [
        comandaQr,
        {
          ...comandaQr,
          _id: 'comanda-comum-1',
          numero: '0105',
          origem: undefined,
          mesa: '2',
          clienteNome: 'Cliente comum',
          itens: [{ ...comandaQr.itens[0], _id: 'item-comum-1', nome: 'Bolo', aFazer: true, observacao: '' }],
        },
      ],
    }).as('kitchen');
    visitarRotaPrivada('/cozinha');
    cy.wait('@kitchen');

    cy.contains('.kitchen-card', 'QR — Ana Cliente (Mesa 5)').should('be.visible').and('contain', 'sem açúcar');
    cy.contains('.kitchen-card', 'Mesa 2').should('be.visible').and('contain', 'Bolo');
    cy.get('body').should('not.contain', '11999998888');
  });

  it('atualiza a lista do PDV a cada 15 segundos sem trocar a comanda selecionada', () => {
    const comandaExistente = {
      ...comandaQr,
      _id: 'comanda-existente-1',
      numero: '0001',
      origem: undefined,
      mesa: '1',
      clienteNome: 'Cliente presencial',
      clienteTelefone: undefined,
      itens: [{ ...comandaQr.itens[0], _id: 'item-existente-1', nome: 'Suco', observacao: '' }],
    };
    let consultas = 0;
    cy.intercept({ method: 'GET', pathname: '/api/comandas', query: { status: 'aberta' } }, (request) => {
      consultas += 1;
      request.reply({ statusCode: 200, body: consultas === 1 ? [comandaExistente] : [comandaExistente, comandaQr] });
    }).as('comandasAbertas');
    cy.intercept('GET', '**/api/products', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/api/mesas', { statusCode: 200, body: { mesas: [], oferecerBalcao: true } });
    cy.clock(Date.now(), ['setInterval', 'clearInterval']);
    visitarRotaPrivada('/comandas');
    cy.wait('@comandasAbertas');
    cy.get('.comandas-detail-card h2').should('contain', '#0001');

    cy.tick(15000);
    cy.wait('@comandasAbertas');
    cy.contains('.comanda-select-button', 'QR — Ana Cliente (Mesa 5)').should('be.visible');
    cy.get('.comandas-detail-card h2').should('contain', '#0001');
  });
});
