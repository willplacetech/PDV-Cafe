const verificarFila = (verificar, tentativas = 30) => cy.window().then(window => new Cypress.Promise((resolve, reject) => {
  const request = window.indexedDB.open('pdv_offline');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result;
    const tx = db.transaction('fila', 'readonly');
    const consulta = tx.objectStore('fila').getAll();
    tx.oncomplete = () => { db.close(); resolve(consulta.result); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  };
})).then(fila => {
  try { verificar(fila); } catch (error) {
    if (!tentativas) throw error;
    return cy.wait(50, { log: false }).then(() => verificarFila(verificar, tentativas - 1));
  }
});

const prepararFilaOffline = (fila = []) => cy.window().then(window => new Cypress.Promise((resolve, reject) => {
  const request = window.indexedDB.open('pdv_offline', 1);
  request.onerror = () => reject(request.error);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains('fila')) database.createObjectStore('fila', { keyPath: 'idTemporario' });
    if (!database.objectStoreNames.contains('metadata')) database.createObjectStore('metadata', { keyPath: 'key' });
  };
  request.onsuccess = () => {
    const database = request.result;
    const transaction = database.transaction(['fila', 'metadata'], 'readwrite');
    const store = transaction.objectStore('fila');
    store.clear();
    transaction.objectStore('metadata').clear();
    fila.forEach(item => store.put(item));
    transaction.oncomplete = () => {
      database.close();
      window.dispatchEvent(new Event('pdv:fila-offline-atualizada'));
      resolve();
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error);
    };
  };
}));

describe('Vendas offline', () => {
  const produto = {
    _id: '64b000000000000000000001',
    codigo: 'OFF-1',
    nome: 'Café offline',
    tipo: 'venda',
    categoria: 'Bebidas Quentes',
    preco: 8,
    estoque: 10,
    unidadeVenda: 'un',
    descontosPorQuantidade: [],
  };
  const usuarioOffline = {
    id: 'usuario-offline-e2e',
    username: 'teste',
    role: 'admin',
    tenantId: 'tenant-offline-e2e',
  };

  it('salva a venda sem rede e sincroniza automaticamente ao reconectar', () => {
    cy.intercept('GET', '**/api/products/pdv', [produto]);
    cy.intercept('GET', '**/api/customers', []);
    cy.intercept('GET', '**/api/products/mais-vendidos?limite=8', []);
    cy.intercept('POST', '**/api/auth/refresh').as('sessionRefresh');
    let tentativas = 0;
    cy.intercept('POST', '**/api/comandas', (request) => {
      tentativas += 1;
      request.reply({
        statusCode: tentativas === 1 ? 500 : 201,
        body: tentativas === 1
          ? { msg: 'Falha temporária' }
          : { _id: '64b000000000000000000002', numero: '0001', itens: [], valorTotal: 8 },
      });
    }).as('sincronizarComanda');

    cy.visit('/pdv', {
      onBeforeLoad(window) {
        window.localStorage.setItem('pdv_token', 'token-teste');
        window.localStorage.setItem('pdv_user', JSON.stringify(usuarioOffline));
        window.localStorage.removeItem('pdv_fila_offline');
      },
    });

    cy.wait('@sessionRefresh');
    cy.contains('.product-card', 'Café offline').should('be.visible');
    cy.window().then(window => {
      Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
      window.dispatchEvent(new Event('offline'));
    });
    prepararFilaOffline();
    cy.contains('.product-card', 'Café offline').click();
    cy.clock(Date.now(), ['Date', 'setTimeout', 'clearTimeout']);

    cy.contains('button', 'Salvar fila offline').scrollIntoView().click();
    cy.contains('venda salva! Envia automaticamente quando voltar.').should('be.visible');
    verificarFila((fila) => {
      expect(fila).to.have.length(1);
      expect(fila[0].payload.idTemporario).to.equal(fila[0].idTemporario);
      expect(fila[0].status).to.equal('pendente');
    });
    cy.get('.connection-status-desktop').contains('⚠️ 1 venda(s) pendente(s)').should('be.visible');

    cy.window().then((window) => {
      Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
      window.dispatchEvent(new Event('online'));
    });

    cy.wait('@sincronizarComanda').then(({ request, response }) => {
      expect(request.body.idTemporario).to.be.a('string').and.not.be.empty;
      expect(request.headers['idempotency-key']).to.equal(request.body.idTemporario);
      expect(response.statusCode).to.equal(500);
    });
    verificarFila((fila) => {
      expect(fila).to.have.length(1);
    });
    cy.tick(30_000);
    cy.wait('@sincronizarComanda').its('response.statusCode').should('equal', 201);
    verificarFila((fila) => {
      expect(fila).to.have.length(0);
    });
  });

  it('bloqueia nova venda quando já existem 50 pendências e mantém o carrinho', () => {
    const filaCheia = Array.from({ length: 50 }, (_, indice) => {
      const idTemporario = `pendente-${indice}`;
      return {
        idTemporario,
        endpoint: '/comandas',
        payload: { idTemporario },
        status: 'pendente',
        criadaEm: new Date(2026, 0, indice + 1).toISOString(),
        ownerId: usuarioOffline.id,
        tenantId: usuarioOffline.tenantId,
        role: usuarioOffline.role,
      };
    });

    cy.visit('/pdv', {
      onBeforeLoad(window) {
        window.localStorage.setItem('pdv_token', 'token-teste');
        window.localStorage.setItem('pdv_user', JSON.stringify(usuarioOffline));
        window.localStorage.setItem('pdv_catalogo_offline', JSON.stringify([produto]));
        window.localStorage.removeItem('pdv_fila_offline');
        Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
      },
    });

    prepararFilaOffline(filaCheia);
    cy.contains('.product-card', 'Café offline').should('be.visible').click();
    cy.contains('button', 'Salvar fila offline').scrollIntoView().click();
    cy.contains('Limite de 50 vendas pendentes atingido').should('be.visible');
    verificarFila((fila) => {
      expect(fila).to.have.length(50);
    });
    cy.contains('Café offline').should('be.visible');
  });

  it('mantem o carrinho mobile de Compras e salva duas vendas offline apos recarregar', () => {
    cy.viewport(375, 812);
    cy.on('window:before:load', (window) => {
      Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    });
    cy.intercept('POST', '**/api/comandas', { statusCode: 500, body: {} });
    cy.visit('/pdv', {
      onBeforeLoad(window) {
        window.localStorage.setItem('pdv_token', 'token-teste');
        window.localStorage.setItem('pdv_user', JSON.stringify(usuarioOffline));
        window.localStorage.setItem('pdv_catalogo_offline', JSON.stringify([produto]));
        window.localStorage.removeItem('pdv_fila_offline');
        Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
      },
    });
    prepararFilaOffline();

    for (let indice = 0; indice < 2; indice += 1) {
      cy.contains('.product-card', produto.nome).click();
      cy.contains('.pdv-cart-panel button', 'Salvar fila offline').click();
      verificarFila((fila) => {
        expect(fila).to.have.length(indice + 1);
      });
      if (indice === 0) cy.get('.pdv-mobile-cart-backdrop').click('topLeft');
    }

    cy.reload();
    verificarFila((fila) => {
      expect(fila).to.have.length(2);
      expect(fila[0].idTemporario).not.to.equal(fila[1].idTemporario);
      expect(fila.every((venda) => venda.payload.itens[0].produtoId === produto._id)).to.equal(true);
    });
  });

});
