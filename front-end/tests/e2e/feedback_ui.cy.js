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

describe('Feedback compartilhado acessível', () => {
  afterEach(() => {
    root?.unmount();
    root = null;
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

    cy.document().then((document) => {
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
      request.reply(attempts <= 2
        ? { statusCode: 503, body: { msg: 'Falha temporária das mesas.' } }
        : { statusCode: 200, body: { mesas: [], oferecerBalcao: true } });
    }).as('tables');
    cy.visit('/cadastro/mesas');

    cy.wait('@tables').its('response.statusCode').should('equal', 503);
    cy.get('@tables.all').should('have.length', 2);
    cy.get('[role="alert"]').should('contain.text', 'tente novamente');
    cy.contains('[role="alert"] button', 'Tentar novamente').click();
    cy.wait('@tables');
    cy.get('@tables.all').should('have.length', 3);
    cy.contains('.estado-lista--vazio h3', 'Nenhuma mesa cadastrada').should('be.visible');
  });
});
