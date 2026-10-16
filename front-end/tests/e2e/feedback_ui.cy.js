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
