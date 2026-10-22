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

const carregarRotaPublica = (options = {}) => {
  cy.intercept('GET', `**/api/pedidos/auto-atendimento/${mesaToken}`, cardapio).as('cardapio');
  cy.visit(`/cardapio/${mesaToken}`, options);
};

const preencherCliente = () => {
  cy.get('[name="clienteNome"]').clear().type('Ana Cliente');
  cy.get('[name="clienteTelefone"]').clear().type('11999998888');
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
});
