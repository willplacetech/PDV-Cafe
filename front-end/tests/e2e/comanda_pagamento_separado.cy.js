const profile = { id: 'admin-split', role: 'admin', username: 'teste', tenantId: 'tenant-teste' };

describe('Pagamento separado por itens da comanda', () => {
  let comandas;
  let comandaOrigem;
  let comandaDestino;

  beforeEach(() => {
    comandaOrigem = {
      _id: 'comanda-origem',
      numero: '10',
      status: 'aberta',
      tipoAtendimento: 'mesa',
      mesa: '1',
      clienteNome: 'Cliente original',
      observacao: '',
      itens: [
        { _id: 'item-cafe', produtoId: 'cafe-1', nome: 'Café', quantidade: 1, precoUnitario: 6 },
        { _id: 'item-bolo', produtoId: 'bolo-1', nome: 'Bolo', quantidade: 1, precoUnitario: 12 },
      ],
      valorTotal: 18,
      historicoPagamentos: [],
    };
    comandaDestino = null;
    comandas = [comandaOrigem];

    cy.viewport(1280, 720);
    cy.intercept('POST', '**/api/auth/refresh', { token: 'test-token', user: profile });
    cy.intercept('GET', '**/api/**', req => {
      const path = new URL(req.url).pathname;
      if (path.endsWith('/mesas')) return req.reply({ mesas: [
        { id: 'mesa-1', numero: '1', nome: 'Mesa 1', ativa: true },
        { id: 'mesa-2', numero: '2', nome: 'Mesa 2', ativa: true },
      ] });
      if (path.endsWith('/comandas')) return req.reply(comandas);
      if (path.endsWith('/products') || path.endsWith('/products/pdv')) return req.reply([]);
      if (path.endsWith('/entregas/estatisticas')) return req.reply({ prontos: 0, despachados: 0 });
      return req.reply([]);
    });
    cy.intercept('POST', '**/api/comandas/comanda-origem/mover', req => {
      expect(req.body.itemIds).to.deep.equal(['item-cafe']);
      expect(req.body.clienteNome).to.equal('Cliente separado');
      comandaOrigem.itens = [comandaOrigem.itens[1]];
      comandaOrigem.valorTotal = 12;
      comandaDestino = {
        ...comandaOrigem,
        _id: 'comanda-destino',
        numero: '11',
        clienteNome: 'Cliente separado',
        itens: [{ _id: 'item-cafe-destino', produtoId: 'cafe-1', nome: 'Café', quantidade: 1, precoUnitario: 6 }],
        valorTotal: 6,
      };
      comandas.push(comandaDestino);
      req.reply({ novaComanda: comandaDestino, comandaOrigem });
    }).as('split');
    cy.visit('/comandas', { onBeforeLoad(win) { win.localStorage.setItem('pdv_user', JSON.stringify(profile)); } });
  });

  it('permite selecionar itens, cria a comanda de destino e mantém o restante na origem', () => {
    cy.get('#sidebar-desktop').contains('a', 'Mesas / Comandas').should('have.attr', 'href', '/comandas');
    cy.get('.table-shortcut').contains('Mesa 1').click();
    cy.get('.comandas-detail-card').contains('Mesa #10').should('be.visible');
    cy.get('.comandas-detail-card').contains('button', 'Selecione itens para separar o pagamento').should('be.disabled');
    cy.get('[aria-label="Selecionar Café"]').check();
    cy.get('.comandas-detail-card').contains('button', 'Separar pagamento').should('be.enabled').click();

    cy.contains('Separar pagamento?').should('be.visible');
    cy.contains('1 item sairão da comanda #10').should('be.visible');
    cy.get('input[placeholder="Cliente da nova comanda"]').clear().type('Cliente separado');
    cy.contains('button', 'Confirmar').click();
    cy.wait('@split');

    cy.get('.comandas-detail-card').contains('Mesa #11').should('be.visible');
    cy.get('.comandas-detail-card').contains('Café').should('be.visible');
    cy.get('.comandas-detail-card').contains('Bolo').should('not.exist');
    cy.get('.comanda-select-button').should('have.length', 2);
    cy.get('.comanda-select-button').contains('Cliente original').should('contain', '1 itens');
    cy.get('[aria-label="Selecionar Café"]').should('not.be.checked');
    cy.then(() => {
      expect(comandaOrigem.itens.map(item => item._id)).to.deep.equal(['item-bolo']);
      expect(comandaDestino.itens.map(item => item._id)).to.deep.equal(['item-cafe-destino']);
      expect(comandaOrigem.valorTotal).to.equal(12);
      expect(comandaDestino.valorTotal).to.equal(6);
    });
  });

  it('redireciona a rota antiga de mesas para a página unificada', () => {
    cy.visit('/atendimento/mesas', { onBeforeLoad(win) { win.localStorage.setItem('pdv_user', JSON.stringify(profile)); } });
    cy.location('pathname').should('equal', '/comandas');
    cy.get('.table-shortcut').contains('Mesa 1').should('be.visible');
    cy.get('.comanda-select-button').contains('Cliente original').should('be.visible');
  });

  it('abre mesa livre no PDV preservando a mesa selecionada', () => {
    cy.get('.table-shortcut').contains('Mesa 2').click();
    cy.location('pathname').should('equal', '/pdv');
    cy.get('.pdv-command-current').should('contain', 'Mesa 2');
  });
});
