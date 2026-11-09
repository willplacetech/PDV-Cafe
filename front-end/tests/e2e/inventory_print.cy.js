const profile = { id: 'admin-inventory', role: 'admin', username: 'teste' };
const produtoDaPagina = {
  _id: 'produto-filtrado',
  nome: 'Somente na busca',
  codigo: '1',
  tipo: 'venda',
  tipoProduto: 'revenda',
  categoria: 'Outros',
  preco: 12,
  estoque: 4,
  estoqueMinimo: 5,
  unidadeVenda: 'un',
  unidadeCompra: 'un',
};
const itensInventario = Array.from({ length: 30 }, (_, index) => ({
  codigo: String(2000 + index),
  nome: index === 1 ? '<img src=x onerror=alert(1)>' : `Item de inventário ${index + 1}`,
  categoria: index === 1 ? '<script>alert(1)</script>' : 'Estoque',
  tipo: index % 2 ? 'insumo' : 'venda',
  unidade: index % 2 ? 'kg' : 'un',
  estoque: index + 0.5,
}));

describe('impressão da lista de inventário', () => {
  let statusInventario;

  beforeEach(() => {
    statusInventario = 200;
    cy.clearLocalStorage();
    cy.intercept('POST', '**/api/auth/refresh', { token: 'test-token', user: profile });
    cy.intercept('GET', '**/api/**', (request) => {
      const path = new URL(request.url).pathname;
      if (path === '/api/products') {
        return request.reply({
          statusCode: 200,
          body: { dados: [produtoDaPagina], total: 50, pagina: 2, limite: 25, totalPaginas: 2 },
        });
      }
      if (path === '/api/production/recipes') return request.reply({ statusCode: 200, body: [] });
      return request.reply({ statusCode: 200, body: [] });
    });
    cy.intercept({ method: 'GET', pathname: '/api/products/inventory-list' }, (request) => {
      request.reply({ statusCode: statusInventario, body: statusInventario === 200 ? itensInventario : { msg: 'Falha ao carregar inventário.' } });
    }).as('inventoryList');
  });

  const visitarProdutos = () => cy.visit('/produtos?busca=Somente%20na%20busca&pagina=2', {
    onBeforeLoad(win) {
      win.localStorage.setItem('pdv_user', JSON.stringify(profile));
      cy.stub(win, 'open').callsFake(() => {
        if (win.blockInventoryPopup) return null;
        const popup = {
          closed: false,
          document: {
            open() {},
            write(html) { win.inventoryPrintHtml = html; },
            close() {},
          },
          focus() {},
          print() { win.inventoryPrintCalled = true; },
          close() { this.closed = true; win.inventoryPopupClosed = true; },
        };
        win.inventoryPopup = popup;
        return popup;
      }).as('openInventoryPopup');
    },
  });

  it('imprime todos os itens da consulta mesmo com busca e paginação na tabela', () => {
    visitarProdutos();
    cy.contains('Somente na busca').should('be.visible');
    cy.contains('button', 'Imprimir inventário').click();
    cy.wait('@inventoryList').its('request.method').should('equal', 'GET');

    cy.window().then((win) => {
      const documento = new win.DOMParser().parseFromString(win.inventoryPrintHtml, 'text/html');
      const cabecalhos = [...documento.querySelectorAll('thead th')].map((celula) => celula.textContent.trim());
      const linhas = [...documento.querySelectorAll('tbody tr')];
      expect(documento.title).to.contain('Inventário');
      expect(documento.body.textContent).to.contain('Item de inventário 30');
      expect(documento.body.textContent).not.to.contain('Somente na busca');
      expect(cabecalhos).to.include('Contagem física');
      expect(cabecalhos).to.include('Diferença');
      expect(linhas).to.have.length(30);
      expect(linhas.every((linha) => linha.cells[5].textContent.trim() === '' && linha.cells[6].textContent.trim() === '')).to.equal(true);
      expect(win.inventoryPrintCalled).to.equal(true);
    });
  });

  it('mantém nomes e categorias com markup como texto no documento impresso', () => {
    visitarProdutos();
    cy.contains('button', 'Imprimir inventário').click();
    cy.wait('@inventoryList');

    cy.window().then((win) => {
      const documento = new win.DOMParser().parseFromString(win.inventoryPrintHtml, 'text/html');
      expect(documento.querySelector('tbody img, tbody script')).to.equal(null);
      expect(documento.querySelector('tbody').textContent).to.contain('<img src=x onerror=alert(1)>');
      expect(documento.querySelector('tbody').textContent).to.contain('<script>alert(1)</script>');
    });
  });

  it('comunica falha da consulta e fecha a janela sem imprimir uma folha vazia', () => {
    statusInventario = 400;
    visitarProdutos();
    cy.contains('button', 'Imprimir inventário').click();
    cy.wait('@inventoryList');

    cy.contains('Falha ao carregar inventário.').should('be.visible');
    cy.window().its('inventoryPopupClosed').should('equal', true);
    cy.window().its('inventoryPrintHtml').should('not.exist');
  });

  it('avisa quando a janela de impressão é bloqueada e não consulta a lista', () => {
    visitarProdutos();
    cy.window().then((win) => { win.blockInventoryPopup = true; });
    cy.contains('button', 'Imprimir inventário').click();

    cy.contains('Permita a abertura de pop-ups para imprimir o inventário.').should('be.visible');
    cy.get('@inventoryList.all').should('have.length', 0);
    cy.get('@openInventoryPopup').should('have.been.calledOnce');
  });
});
