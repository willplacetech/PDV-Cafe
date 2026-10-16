import React, { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';

import ConfirmarAcao from '../../src/components/ConfirmarAcao.jsx';
import EstadoLista from '../../src/components/EstadoLista.jsx';
import { ToastProvider } from '../../src/components/Toast.jsx';
import { useToast } from '../../src/components/useToast.js';

globalThis.React = React;

let root;

function ToastButtons() {
  const { showToast } = useToast();

  return h('div', null,
    h('button', { type: 'button', onClick: () => showToast('Ação concluída.', 'success') }, 'Mostrar sucesso'),
    h('button', { type: 'button', onClick: () => showToast('Falha ao salvar.', 'error') }, 'Mostrar erro')
  );
}

function mountFeedback(confirmar) {
  return cy.document().then((document) => {
    const container = document.createElement('div');
    container.style.width = '100vw';
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(h(ToastProvider, null,
      h(ToastButtons),
      h(ConfirmarAcao, {
        titulo: 'Excluir produto',
        mensagem: 'Esta ação não pode ser desfeita.',
        acaoTexto: 'Excluir',
        onConfirmar: confirmar,
      }, ({ onClick }) => h('button', { type: 'button', onClick }, 'Abrir confirmação'))
    ));
  });
}

function mountOrders() {
  return cy.window()
    .then((win) => win.eval("import('/tests/e2e/ordersTestMount.js')"))
    .then(({ mountOrders: mount }) => mount());
}

describe('Feedback compartilhado acessível', () => {
  afterEach(() => {
    root?.unmount();
    root = null;
    cy.window({ log: false }).then((win) => win.__ordersTestCleanup?.());
  });

  it('expõe toasts comuns como status e erros como alertas', () => {
    mountFeedback(() => Promise.resolve());

    cy.contains('button', 'Mostrar sucesso').click();
    cy.get('[role="status"]').should('contain.text', 'Ação concluída.');
    cy.contains('button', 'Mostrar erro').click();
    cy.get('[role="alert"]').should('contain.text', 'Falha ao salvar.');
  });

  it('abre um diálogo modal associado ao título e permite cancelar sem confirmar', () => {
    const confirmar = cy.stub().as('confirmar');
    mountFeedback(confirmar);

    cy.contains('button', 'Abrir confirmação').click();
    cy.get('[role="dialog"][aria-modal="true"]')
      .should('have.attr', 'aria-labelledby')
      .and('not.be.empty');
    cy.get('[role="dialog"]').should('contain.text', 'Excluir produto');
    cy.contains('button', 'Cancelar').click();
    cy.get('@confirmar').should('not.have.been.called');
    cy.get('[role="dialog"]').should('not.exist');
  });

  it('fecha o diálogo com Escape e devolve foco ao controle que o abriu', () => {
    const confirmar = cy.stub().as('confirmar');
    mountFeedback(confirmar);

    cy.contains('button', 'Abrir confirmação').as('abrir').click();
    cy.contains('button', 'Cancelar').should('be.focused');
    cy.contains('button', 'Excluir').focus().trigger('keydown', { key: 'Tab', keyCode: 9, which: 9 });
    cy.contains('button', 'Cancelar').should('be.focused');
    cy.get('[role="dialog"]').trigger('keydown', { key: 'Escape', keyCode: 27, which: 27 });
    cy.get('[role="dialog"]').should('not.exist');
    cy.get('@abrir').should('be.focused');
    cy.get('@confirmar').should('not.have.been.called');
  });

  it('reinicia o timer ao substituir um toast e o limpa ao desmontar o provider', () => {
    const registrarErro = cy.stub(console, 'error');
    mountFeedback(() => Promise.resolve());

    cy.contains('button', 'Mostrar sucesso').click();
    cy.wait(1500);
    cy.contains('button', 'Mostrar erro').click();
    cy.wait(2200);
    cy.get('[role="alert"]').should('be.visible');

    cy.then(() => {
      root.unmount();
      root = null;
    });
    cy.wait(2000);
    cy.wrap(registrarErro).should('not.have.been.calledWithMatch', Cypress.sinon.match(/unmounted/i));
  });

  it('mostra o skeleton antes de erro, vazio ou conteúdo durante o carregamento', () => {
    mountFeedback(() => Promise.resolve());

    cy.document().then(() => {
      root.render(h(ToastProvider, null, h(EstadoLista, {
        carregando: true,
        erro: 'Erro anterior',
        vazio: true,
      }, h('p', null, 'Conteúdo da lista'))));
    });

    cy.get('[role="status"][aria-label="Carregando lista"]')
      .should('be.visible')
      .and('have.attr', 'aria-busy', 'true');
    cy.contains('Conteúdo da lista').should('not.exist');
    cy.contains('Erro anterior').should('not.exist');
  });

  it('apresenta estado vazio contextual e executa a ação opcional', () => {
    const acaoVazia = cy.stub().as('acaoVazia');
    mountFeedback(() => Promise.resolve());

    cy.document().then(() => {
      root.render(h(ToastProvider, null, h(EstadoLista, {
        vazio: true,
        iconeVazio: '☕',
        tituloVazio: 'Nenhum produto',
        mensagemVazia: 'Adicione o primeiro produto ao catálogo.',
        acaoVaziaTexto: 'Adicionar produto',
        onAcaoVazia: acaoVazia,
      })));
    });

    cy.contains('h3', 'Nenhum produto').should('be.visible');
    cy.contains('Adicione o primeiro produto ao catálogo.').should('be.visible');
    cy.contains('button', 'Adicionar produto').click();
    cy.get('@acaoVazia').should('have.been.calledOnce');
  });

  it('mostra erro com retry condicional e repete a consulta sem recarregar', () => {
    const retry = cy.stub().as('retry');
    mountFeedback(() => Promise.resolve());

    cy.document().then(() => {
      root.render(h(ToastProvider, null, h(EstadoLista, {
        erro: 'Falha ao carregar produtos.',
        onRetry: retry,
      })));
    });

    cy.get('[role="alert"]').should('contain.text', 'Falha ao carregar produtos.');
    cy.contains('[role="alert"] button', 'Tentar novamente').click();
    cy.get('@retry').should('have.been.calledOnce');
    cy.contains('Falha ao carregar produtos.').should('be.visible');
  });
});

describe('Estados das listas administrativas', () => {
  it('mostra skeleton, vazio contextual e permite criar o primeiro usuário', () => {
    cy.login();
    cy.intercept('GET', '**/api/auth/users', { delay: 300, statusCode: 200, body: [] }).as('users');
    cy.intercept('GET', '**/api/entregas/entregadores', { statusCode: 200, body: [] }).as('couriers');
    cy.visit('/usuarios');

    cy.get('[role="status"][aria-label="Carregando lista"]').should('be.visible');
    cy.wait('@users');
    cy.contains('.estado-lista--vazio h3', 'Nenhum usuário cadastrado').should('be.visible');
    cy.contains('.estado-lista--vazio button', 'Cadastrar primeiro usuário').click();
    cy.get('input[autocomplete="username"]').should('be.focused');
  });

  it('permite repetir a carga de usuários após erro sem perder a tela', () => {
    cy.login();
    let attempts = 0;
    cy.intercept('GET', '**/api/auth/users', (request) => {
      attempts += 1;
      request.reply(attempts <= 2
        ? { statusCode: 503, body: { msg: 'Falha temporária de usuários.' } }
        : { statusCode: 200, body: [] });
    }).as('users');
    cy.intercept('GET', '**/api/entregas/entregadores', { statusCode: 200, body: [] });
    cy.visit('/usuarios');

    cy.wait('@users').its('response.statusCode').should('equal', 503);
    cy.get('@users.all').should('have.length', 2);
    cy.get('[role="alert"]').should('contain.text', 'tente novamente');
    cy.contains('[role="alert"] button', 'Tentar novamente').click();
    cy.wait('@users');
    cy.get('@users.all').should('have.length', 3);
    cy.contains('.estado-lista--vazio h3', 'Nenhum usuário cadastrado').should('be.visible');
  });

  it('apresenta skeleton e ação de cadastro quando o catálogo administrativo está vazio', () => {
    cy.login();
    cy.intercept('GET', '**/api/products', { delay: 300, statusCode: 200, body: [] }).as('products');
    cy.intercept('GET', '**/api/production/recipes', { statusCode: 200, body: [] }).as('recipes');
    cy.visit('/produtos');

    cy.get('[role="status"][aria-label="Carregando lista"]').should('be.visible');
    cy.wait('@products');
    cy.wait('@recipes');
    cy.contains('.estado-lista--vazio h3', 'Nenhum produto cadastrado').should('be.visible');
    cy.scrollTo('bottom');
    cy.contains('.estado-lista--vazio button', 'Cadastrar primeiro produto').click();
    cy.get('#product-form').should(($form) => {
      expect($form[0].getBoundingClientRect().top).to.be.at.least(0);
      expect($form[0].getBoundingClientRect().top).to.be.lessThan(Cypress.config('viewportHeight'));
    });
  });

  it('repete a consulta do catálogo após erro e mostra o estado vazio somente no sucesso', () => {
    cy.login();
    let attempts = 0;
    cy.intercept('GET', '**/api/products', (request) => {
      attempts += 1;
      request.reply(attempts <= 2
        ? { statusCode: 503, body: { msg: 'Falha temporária do catálogo.' } }
        : { statusCode: 200, body: [] });
    }).as('products');
    cy.intercept('GET', '**/api/production/recipes', { statusCode: 200, body: [] });
    cy.visit('/produtos');

    cy.wait('@products').its('response.statusCode').should('equal', 503);
    cy.get('@products.all').should('have.length', 2);
    cy.get('[role="alert"]').should('contain.text', 'tente novamente');
    cy.contains('[role="alert"] button', 'Tentar novamente').click();
    cy.wait('@products');
    cy.get('@products.all').should('have.length', 3);
    cy.contains('.estado-lista--vazio h3', 'Nenhum produto cadastrado').should('be.visible');
  });

  it('mostra skeleton e permite adicionar a primeira mesa após uma resposta vazia válida', () => {
    cy.login();
    cy.intercept('GET', '**/api/mesas', { delay: 300, statusCode: 200, body: { mesas: [], oferecerBalcao: true } }).as('tables');
    cy.visit('/cadastro/mesas');

    cy.get('[role="status"][aria-label="Carregando lista"]').should('be.visible');
    cy.wait('@tables');
    cy.contains('.estado-lista--vazio h3', 'Nenhuma mesa cadastrada').should('be.visible');
    cy.contains('.estado-lista--vazio button', 'Adicionar Mesa').click();
    cy.get('input[value="Mesa 1"]').should('be.visible');
  });

  it('permite tentar novamente ao falhar a carga das mesas', () => {
    cy.login();
    let attempts = 0;
    cy.intercept('GET', '**/api/mesas', (request) => {
      attempts += 1;
      request.reply(attempts === 1
        ? { statusCode: 503, body: { msg: 'Falha temporária das mesas.' } }
        : { statusCode: 200, body: { mesas: [], oferecerBalcao: true } });
    }).as('tables');
    cy.visit('/cadastro/mesas');

    cy.wait('@tables').its('response.statusCode').should('equal', 503);
    cy.get('@tables.all').should('have.length', 1);
    cy.get('[role="alert"]').should('contain.text', 'tente novamente');
    cy.contains('[role="alert"] button', 'Tentar novamente').click();
    cy.wait('@tables');
    cy.get('@tables.all').should('have.length', 2);
    cy.contains('.estado-lista--vazio h3', 'Nenhuma mesa cadastrada').should('be.visible');
  });

  it('permite repetir a carga de pedidos após erro e executa a ação do estado vazio', () => {
    cy.login();
    let attempts = 0;
    cy.intercept('GET', '**/api/orders', (request) => {
      attempts += 1;
      request.reply(attempts === 1
        ? { statusCode: 503, body: { msg: 'Falha temporária dos pedidos.' } }
        : { statusCode: 200, body: [] });
    }).as('orders');
    mountOrders();

    cy.wait('@orders').its('response.statusCode').should('equal', 503);
    cy.get('[role="alert"]').should('contain.text', 'tente novamente');
    cy.contains('[role="alert"] button', 'Tentar novamente').click();
    cy.wait('@orders').its('response.statusCode').should('equal', 200);

    cy.contains('.estado-lista--vazio h3', 'Nenhum pedido realizado').should('be.visible');
    cy.contains('.estado-lista--vazio button', 'Ir ao PDV').click();
    cy.get('[data-testid="orders-path"]').should('have.text', '/pdv');
    cy.get('@orders.all').should('have.length', 2);
  });

  it('bloqueia alterações de mesas após erro de carga e as libera após nova leitura válida', () => {
    cy.login();
    let attempts = 0;
    cy.intercept('GET', '**/api/mesas', (request) => {
      attempts += 1;
      request.reply(attempts === 1
        ? { statusCode: 503, body: { msg: 'Falha temporária das mesas.' } }
        : {
            statusCode: 200,
            body: {
              mesas: [{ id: 'mesa-7', numero: '7', nome: 'Mesa 7', lugares: 4, ativa: true }],
              oferecerBalcao: false,
            },
          });
    }).as('tables');
    cy.intercept('PUT', '**/api/mesas', { statusCode: 200, body: { mesas: [] } }).as('saveTables');
    cy.visit('/cadastro/mesas');

    cy.wait('@tables').its('response.statusCode').should('equal', 503);
    cy.get('[role="alert"]').should('contain.text', 'tente novamente');
    cy.contains('button', 'Adicionar Mesa').should('be.disabled');
    cy.get('input[type="checkbox"]').should('be.disabled');
    cy.contains('button', 'Salvar').should('be.disabled');
    cy.get('table').should('not.exist');
    cy.get('@saveTables.all').should('have.length', 0);

    cy.contains('[role="alert"] button', 'Tentar novamente').click();
    cy.wait('@tables').its('response.statusCode').should('equal', 200);
    cy.get('tbody input').first().should('be.visible').and('have.value', 'Mesa 7').and('be.enabled');
    cy.get('input[type="checkbox"]').should('be.enabled').and('not.be.checked');
    cy.contains('button', 'Editar').should('be.enabled');
    cy.contains('button', 'Adicionar Mesa').should('be.enabled');
    cy.contains('button', 'Salvar').should('be.enabled');
    cy.get('@saveTables.all').should('have.length', 0);
  });

  it('repete a carga de despesas e preserva filtros de data antes de mostrar o vazio filtrado', () => {
    cy.login();
    let attempts = 0;
    cy.intercept('GET', '**/api/despesas', (request) => {
      attempts += 1;
      request.reply(attempts <= 2
        ? { statusCode: 503, body: { msg: 'Falha temporária das despesas.' } }
        : {
            statusCode: 200,
            body: [{
              _id: 'despesa-fora-periodo',
              descricao: 'Despesa fora do período',
              categoria: 'Outros',
              valor: 42,
              dataVencimento: '2026-10-03',
              status: 'pendente',
            }],
          });
    }).as('expenses');
    cy.intercept('GET', '**/api/despesas/resumo*', {
      totalPendente: 42,
      totalPago: 0,
      totalAtrasado: 0,
      porCategoria: [],
    });
    cy.visit('/financeiro');

    cy.get('[role="status"][aria-label="Carregando lista"]').should('be.visible');
    cy.wait('@expenses').its('response.statusCode').should('equal', 503);
    cy.get('[role="alert"]').should('be.visible');
    cy.get('.filters-grid input[placeholder="dd/mm/aaaa"]').eq(0).type('01102026');
    cy.get('.filters-grid input[placeholder="dd/mm/aaaa"]').eq(1).type('02102026');

    cy.get('@expenses.all').should('have.length', 2);
    cy.wait('@expenses').its('response.statusCode').should('equal', 503);
    cy.contains('[role="alert"] button', 'Tentar novamente').click();
    cy.wait('@expenses').its('response.statusCode').should('equal', 200);
    cy.get('@expenses.all').should('have.length', 3);
    cy.get('.filters-grid input[placeholder="dd/mm/aaaa"]').eq(0).should('have.value', '01/10/2026');
    cy.get('.filters-grid input[placeholder="dd/mm/aaaa"]').eq(1).should('have.value', '02/10/2026');
    cy.contains('.estado-lista--vazio h3', 'Nenhuma despesa encontrada para os filtros atuais').should('be.visible');
  });

  it('invalida pedidos selecionados quando um filtro de pedidos falha ao recarregar', () => {
    cy.login();
    const pedido = {
      _id: 'pedido-selecionado-1',
      numero: '808',
      clienteId: 'cliente-1',
      clienteNome: 'Cliente teste',
      status: 'pendente',
      createdAt: '2026-10-16T12:00:00.000Z',
      atendente: 'Caixa',
      total: 18.5,
      pagamentos: [],
      itens: [],
    };
    cy.intercept('GET', '**/api/customers', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/api/products', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/api/orders*', (request) => {
      const status = new URL(request.url).searchParams.get('status');
      request.reply(status === 'pago'
        ? { statusCode: 503, body: { msg: 'Falha ao atualizar pedidos filtrados.' } }
        : { statusCode: 200, body: [pedido] });
    }).as('orders');
    cy.intercept('PATCH', '**/api/orders/*/pagar', { statusCode: 200, body: pedido }).as('batchPayment');
    cy.visit('/contas-receber');

    cy.wait('@orders').its('response.statusCode').should('equal', 200);
    cy.wait('@orders').its('response.statusCode').should('equal', 200);
    cy.get('input[type="checkbox"]').check();
    cy.contains('button', 'Receber Marcados (1)').should('be.enabled');

    cy.get('[role="combobox"]').eq(1).click();
    cy.get('[role="option"]').contains('Quitados').click();
    cy.wait('@orders').its('response.statusCode').should('equal', 503);

    cy.contains('button', 'Receber Marcados (0)').should('be.disabled');
    cy.get('[role="dialog"]').should('not.exist');
    cy.get('@batchPayment.all').should('have.length', 0);
  });

  it('oculta KPIs desatualizados e recupera o resumo financeiro ao repetir a consulta do mês', () => {
    cy.login();
    const dataAlvo = new Date();
    dataAlvo.setDate(1);
    dataAlvo.setMonth(dataAlvo.getMonth() - 2);
    const mesAlvo = dataAlvo.toISOString().slice(0, 7);
    let tentativasDoMes = 0;
    cy.intercept('GET', '**/api/despesas', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/api/despesas/resumo*', (request) => {
      const mes = new URL(request.url).searchParams.get('mes');
      request.alias = mes === mesAlvo ? 'targetSummary' : 'initialSummary';
      if (mes !== mesAlvo) {
        return request.reply({
          statusCode: 200,
          body: { totalPago: 1111, totalPendente: 2222, totalAtrasado: 3333, porCategoria: [] },
        });
      }

      tentativasDoMes += 1;
      request.reply(tentativasDoMes === 1
        ? { delay: 400, statusCode: 503, body: { msg: 'Falha temporária do resumo.' } }
        : {
            statusCode: 200,
            body: { totalPago: 44, totalPendente: 55, totalAtrasado: 66, porCategoria: [] },
          });
    });
    cy.visit('/financeiro');

    cy.wait('@initialSummary');
    cy.wait('@initialSummary');
    cy.get('.financeiro-kpis').should('contain.text', 'R$ 1.111,00');
    cy.get('input[type="month"]').clear().type(mesAlvo);
    cy.get('input[type="month"]').should('have.value', mesAlvo);
    cy.get('[aria-label="Carregando indicadores financeiros"]').should('be.visible');
    cy.get('.financeiro-kpis').should('not.contain.text', 'R$ 1.111,00');
    cy.wait('@targetSummary').its('response.statusCode').should('equal', 503);
    cy.get('[role="alert"]').should('contain.text', 'Não foi possível carregar os indicadores do mês.');
    cy.get('.financeiro-kpis').should('not.contain.text', 'R$ 1.111,00');

    cy.contains('.financeiro-kpis [role="alert"] button', 'Tentar novamente').click();
    cy.wait('@targetSummary').its('response.statusCode').should('equal', 200);
    cy.get('.financeiro-kpis').should('contain.text', 'R$ 44,00')
      .and('contain.text', 'R$ 55,00')
      .and('contain.text', 'R$ 66,00');
  });

  it('repete a carga do estoque de produção sem recarregar a página', () => {
    cy.login();
    let attempts = 0;
    cy.intercept('GET', '**/api/products', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/api/production/recipes', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/api/production/dashboard', {
      statusCode: 200,
      body: { receitasPossiveis: [], baixoEstoque: [], producoesRecentes: [] },
    });
    cy.intercept('GET', '**/api/production/movements', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/api/production/stock*', (request) => {
      attempts += 1;
      request.reply(attempts <= 2
        ? { statusCode: 503, body: { msg: 'Falha temporária do estoque de insumos.' } }
        : { statusCode: 200, body: [] });
    }).as('productionStock');
    cy.visit('/producao');

    cy.get('[role="status"][aria-label="Carregando lista"]').should('be.visible');
    cy.wait('@productionStock').its('response.statusCode').should('equal', 503);
    cy.get('[role="alert"]').should('be.visible');
    cy.wait('@productionStock').its('response.statusCode').should('equal', 503);
    cy.contains('[role="alert"] button', 'Tentar novamente').click();
    cy.wait('@productionStock').its('response.statusCode').should('equal', 200);
    cy.get('@productionStock.all').should('have.length', 3);
    cy.contains('.estado-lista--vazio h3', 'Nenhum insumo em estoque').should('be.visible');
    cy.location('pathname').should('equal', '/producao');
  });

  it('repete a carga de comandas a receber na aba ativa', () => {
    cy.login();
    let attempts = 0;
    cy.intercept('GET', '**/api/comandas/a-receber*', (request) => {
      attempts += 1;
      request.reply(attempts === 1
        ? { statusCode: 503, body: { msg: 'Falha temporária das comandas.' } }
        : { statusCode: 200, body: [] });
    }).as('openReceivables');
    cy.visit('/contas-receber');
    cy.contains('button', 'Comandas em aberto').click();

    cy.wait('@openReceivables').its('response.statusCode').should('equal', 503);
    cy.get('[role="alert"]').should('be.visible');
    cy.contains('[role="alert"] button', 'Tentar novamente').click();
    cy.wait('@openReceivables').its('response.statusCode').should('equal', 200);
    cy.contains('.estado-lista--vazio h3', 'Nenhuma comanda com saldo em aberto').should('be.visible');
  });

  it('repete a carga do histórico de compras e informa quando ainda está vazio', () => {
    cy.login();
    let attempts = 0;
    cy.intercept('GET', '**/api/products', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/api/compras*', (request) => {
      attempts += 1;
      request.reply(attempts === 1
        ? { statusCode: 503, body: { msg: 'Falha temporária das compras.' } }
        : { statusCode: 200, body: [] });
    }).as('purchases');
    cy.visit('/compras');

    cy.get('[role="status"][aria-label="Carregando lista"]').should('be.visible');
    cy.wait('@purchases').its('response.statusCode').should('equal', 503);
    cy.get('[role="alert"]').should('be.visible');
    cy.contains('[role="alert"] button', 'Tentar novamente').click();
    cy.wait('@purchases').its('response.statusCode').should('equal', 200);
    cy.contains('.estado-lista--vazio h3', 'Nenhuma compra registrada').should('be.visible');
  });

  it('repete a carga da cozinha após erro sem substituir os comandos por um vazio falso', () => {
    cy.login();
    let attempts = 0;
    cy.intercept('GET', '**/api/comandas/cozinha', (request) => {
      attempts += 1;
      request.reply(attempts === 1
        ? { statusCode: 503, body: { msg: 'Falha temporária da cozinha.' } }
        : { statusCode: 200, body: [] });
    }).as('kitchenOrders');
    cy.visit('/cozinha');

    cy.get('[role="status"][aria-label="Carregando lista"]').should('be.visible');
    cy.wait('@kitchenOrders').its('response.statusCode').should('equal', 503);
    cy.get('[role="alert"]').should('be.visible');
    cy.contains('[role="alert"] button', 'Tentar novamente').click();
    cy.wait('@kitchenOrders').its('response.statusCode').should('equal', 200);
    cy.contains('.estado-lista--vazio h3', 'Nenhum preparo pendente').should('be.visible');
  });

  it('repete a carga de fichas técnicas no painel de produção', () => {
    cy.login();
    let attempts = 0;
    cy.intercept('GET', '**/api/products', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/api/production/stock*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/api/production/dashboard', {
      statusCode: 200,
      body: { receitasPossiveis: [], baixoEstoque: [], producoesRecentes: [] },
    });
    cy.intercept('GET', '**/api/production/movements', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/api/production/recipes', (request) => {
      attempts += 1;
      request.reply(attempts <= 2
        ? { statusCode: 200, body: [] }
        : attempts <= 4
          ? { statusCode: 503, body: { msg: 'Falha temporária das fichas técnicas.' } }
          : { statusCode: 200, body: [] });
    }).as('productionRecipes');
    cy.visit('/producao');
    cy.wait('@productionRecipes');
    cy.wait('@productionRecipes');
    cy.contains('button', 'Ficha técnica').click();

    cy.wait('@productionRecipes').its('response.statusCode').should('equal', 503);
    cy.wait('@productionRecipes').its('response.statusCode').should('equal', 503);
    cy.get('[role="alert"]').should('be.visible');
    cy.contains('[role="alert"] button', 'Tentar novamente').click();
    cy.wait('@productionRecipes').its('response.statusCode').should('equal', 200);
    cy.contains('.estado-lista--vazio h3', 'Nenhuma ficha técnica encontrada').should('be.visible');
  });
});
