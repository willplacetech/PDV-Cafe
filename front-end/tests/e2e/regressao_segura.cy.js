const mesas = {
  mesas: [{ id: 1, numero: 1, nome: 'Janela', lugares: 2, ativa: true }],
  oferecerBalcao: true,
};
const produto = {
  _id: 'produto-1',
  codigo: '1',
  nome: 'Café teste',
  tipo: 'venda',
  preco: 10,
  estoque: 20,
  unidadeVenda: 'un',
  ativo: true,
  categoria: 'Bebidas Quentes',
};
const comanda = {
  _id: 'comanda-1',
  numero: '1',
  status: 'aberta',
  clienteNome: 'Cliente teste',
  valorTotal: 10,
  saldoDevedor: 10,
  historicoPagamentos: [],
  itens: [
    {
      _id: 'item-1',
      produtoId: produto._id,
      nome: produto.nome,
      quantidade: 1,
      precoUnitario: 10,
    },
  ],
};

const visitar = (path) =>
  cy.visit(path, {
    onBeforeLoad(win) {
      win.localStorage.setItem('pdv_token', 'token-simulado');
      win.localStorage.setItem(
        'pdv_user',
        JSON.stringify({ id: 'admin-teste', role: 'admin', username: 'teste' })
      );
    },
  });

describe('Regressões de cobrança e mesas sem banco externo', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/api/**', (request) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith('/mesas')) return request.reply(mesas);
      if (path.includes('/products/mais-vendidos')) return request.reply([]);
      if (path.includes('/products')) return request.reply([produto]);
      if (path.endsWith('/comandas/a-receber')) {
        return request.reply({
          dados: [comanda],
          total: 1,
          pagina: 1,
          limite: 25,
        });
      }
      if (path.includes('/comandas')) return request.reply([comanda]);
      return request.reply([]);
    });
  });

  it('valor parcial vazio em Contas a Receber não envia pagamento', () => {
    let pagamentos = 0;
    cy.intercept('PATCH', '**/api/comandas/*/receber-parcial', (request) => {
      pagamentos++;
      request.reply({});
    });
    visitar('/contas-receber');
    cy.contains('button', 'Comandas').click();
    cy.contains('button', 'Receber').click();
    cy.get('input[placeholder="0,00"]').clear();
    cy.contains('button', 'Confirmar recebimento').click();
    cy.contains('Informe um valor válido')
      .should('be.visible')
      .then(() => expect(pagamentos).to.equal(0));
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
    cy.intercept('GET', '**/api/mesas', {
      ...mesas,
      mesas: [{ ...mesas.mesas[0], nome: 'Varanda' }],
    });
    visitar('/comandas');
    cy.get('.table-shortcut')
      .should('have.length', 1)
      .and('contain', 'Varanda');
  });

  it('envia o novo preço do produto e impede salvar preço vazio', () => {
    let atualizacoes = 0;
    cy.intercept('PUT', '**/api/products/produto-1', (request) => {
      atualizacoes += 1;
      expect(request.body.preco).to.equal(12.5);
      request.reply({ ...produto, preco: 12.5 });
    }).as('atualizarProduto');

    visitar('/produtos');
    cy.contains('button', 'Editar').click();
    cy.contains('label', 'Preço de venda (R$)')
      .find('input')
      .clear()
      .type('12.5');
    cy.contains('button', 'Atualizar').click();
    cy.wait('@atualizarProduto');
    cy.contains('Produto atualizado!').should('be.visible');

    cy.contains('button', 'Editar').click();
    cy.contains('label', 'Preço de venda (R$)')
      .find('input')
      .clear()
      .then(($input) => expect($input[0].checkValidity()).to.equal(false));
    cy.contains('button', 'Atualizar').click();
    cy.then(() => expect(atualizacoes).to.equal(1));
  });

  it('cadastra produto pela compra sem solicitar conteúdo por embalagem', () => {
    const novoProduto = {
      _id: 'produto-novo-compra',
      codigo: '99901',
      nome: 'Farinha nova',
      tipo: 'insumo',
      preco: 0,
      precoCompra: 12.5,
      conteudoPorEmbalagem: 1,
      unidadeConteudo: 'un',
      unidadeCompra: 'un',
      estoqueEmbalagens: 0,
      estoqueInsumos: 0,
      ativo: true,
    };
    cy.intercept('POST', '**/api/products', (request) => {
      expect(request.body.nome).to.equal('Farinha nova');
      expect(request.body.precoCompra).to.equal(12.5);
      expect(request.body.unidadeConteudo).to.equal('un');
      expect(request.body.conteudoPorEmbalagem).to.equal(1);
      request.reply({ statusCode: 201, body: novoProduto });
    }).as('cadastrarProduto');

    visitar('/compras');
    cy.contains('button', 'Novo Produto').click();
    cy.get('[role="dialog"]')
      .contains('Conteúdo por embalagem')
      .should('not.exist');
    cy.get('[role="dialog"] label')
      .contains('Nome')
      .find('input')
      .type('Farinha nova');
    cy.get('[role="dialog"] label')
      .contains('Preço de compra')
      .find('input')
      .type('12.50');
    cy.contains('button', 'Salvar e continuar').click();
    cy.wait('@cadastrarProduto');
    cy.contains('Insumo cadastrado e selecionado na compra').should(
      'be.visible'
    );
    cy.get('.purchase-item .searchable-select-native')
      .first()
      .should('have.value', novoProduto._id);
    cy.get('.purchase-item .searchable-select-input')
      .first()
      .should('have.value', 'Farinha nova [Insumo]');
  });

  it('salvar comanda bloqueia botão durante envio e envia id idempotente', () => {
    cy.intercept('POST', '**/api/comandas', (request) => {
      expect(request.body.idTemporario).to.match(/^[0-9a-f-]{36}$/i);
      request.reply({ delay: 1000, body: comanda });
    }).as('abrirComanda');
    visitar('/pdv');
    cy.contains(produto.nome).click();
    cy.contains('button', 'Salvar em aberto').click().should('be.disabled');
    cy.wait('@abrirComanda');
    cy.contains('Comanda #1 salva em aberto').should('be.visible');
  });
});
