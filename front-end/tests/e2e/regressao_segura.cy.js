const mesas = { mesas: [{ id: 1, numero: 1, nome: 'Janela', lugares: 2, ativa: true }], oferecerBalcao: true };
const produto = { _id: 'produto-1', codigo: '1', nome: 'Café teste', tipo: 'venda', preco: 10, estoque: 20, unidadeVenda: 'un', ativo: true, categoria: 'Bebidas Quentes' };
const comanda = { _id: 'comanda-1', numero: '1', status: 'aberta', clienteNome: 'Cliente teste', valorTotal: 10, saldoDevedor: 10, historicoPagamentos: [], itens: [{ _id: 'item-1', produtoId: produto._id, nome: produto.nome, quantidade: 1, precoUnitario: 10 }] };

const visitar = (path) => cy.visit(path, {
  onBeforeLoad(win) {
    win.localStorage.setItem('pdv_token', 'token-simulado');
    win.localStorage.setItem('pdv_user', JSON.stringify({ id: 'admin-teste', role: 'admin', username: 'teste' }));
  },
});

describe('Regressões de cobrança e mesas sem banco externo', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/api/**', (request) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith('/mesas')) return request.reply(mesas);
      if (path.includes('/products/mais-vendidos')) return request.reply([]);
      if (path.includes('/products')) return request.reply([produto]);
      if (path.includes('/comandas')) return request.reply([comanda]);
      return request.reply([]);
    });
  });

  it('valor parcial vazio em Contas a Receber não envia pagamento', () => {
    let pagamentos = 0;
    cy.intercept('PATCH', '**/api/comandas/*/receber-parcial', (request) => { pagamentos++; request.reply({}); });
    visitar('/contas-receber');
    cy.contains('button', 'Comandas').click();
    cy.contains('button', 'Receber').click();
    cy.get('input[placeholder="0,00"]').clear();
    cy.contains('button', 'Confirmar recebimento').click();
    cy.contains('Informe um valor válido').should('be.visible').then(() => expect(pagamentos).to.equal(0));
    cy.contains('button', 'Confirmar recebimento').should('be.visible');
  });

  it('salva mesa na API e atendimento mostra o mesmo nome', () => {
    cy.intercept('PUT', '**/api/mesas', (request) => {
      expect(request.body.mesas[0].nome).to.equal('Varanda');
      request.reply(request.body);
    }).as('salvarMesas');
    visitar('/cadastro/mesas');
    cy.get('tbody input').first().clear().type('Varanda');
    cy.contains('button', 'Salvar').click();
    cy.wait('@salvarMesas');
    cy.contains('Configuração de mesas salva com sucesso').should('be.visible');
    cy.intercept('GET', '**/api/mesas', { ...mesas, mesas: [{ ...mesas.mesas[0], nome: 'Varanda' }] });
    visitar('/comandas');
    cy.get('.table-shortcut').should('have.length', 1).and('contain', 'Varanda');
  });

  it('abrir comanda bloqueia botão durante envio e leva chave de idempotência', () => {
    cy.intercept('POST', '**/api/comandas', (request) => {
      expect(request.headers['idempotency-key']).to.match(/^[0-9a-f-]{36}$/i);
      request.reply({ delay: 1000, body: comanda });
    }).as('abrirComanda');
    visitar('/pdv');
    cy.contains(produto.nome).click();
    cy.contains('button', 'Abrir Comanda').click().should('be.disabled');
    cy.wait('@abrirComanda');
    cy.url().should('include', '/atendimento/mesas');
  });
});
