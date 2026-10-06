import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imprimirEntrega } from '../src/utils/imprimirEntrega.js';

test('imprime recibo de entrega con contenido escapado y detalle de los artículos', () => {
  let documento = '';
  let fechada = false;
  const janela = {
    opener: {},
    document: {
      open() {},
      write(value) { documento = value; },
      close() { fechada = true; },
    },
  };
  globalThis.window = { open: () => janela };

  try {
    const impresso = imprimirEntrega({
      _id: 'pedido-1',
      status: 'pronto',
      criadoEm: '2026-10-06T12:00:00.000Z',
      origem: { nomeCliente: '<Maria>', telefone: '11999999999', endereco: { rua: 'Rua Um', numero: '12' } },
      itens: [{ descricao: '<Café>', quantidade: 2, precoUnitario: 8 }],
      valorTotal: 16,
      taxaEntrega: 4,
    }, 'Café');

    assert.equal(impresso, true);
    assert.equal(janela.opener, null);
    assert.equal(fechada, true);
    assert.match(documento, /&lt;Maria&gt;/);
    assert.match(documento, /&lt;Café&gt;/);
    assert.match(documento, /COMPROVANTE DE ENTREGA/);
    assert.match(documento, /Total/);
  } finally {
    delete globalThis.window;
  }
});

test('reporta quando o navegador bloqueia a janela de impressão', () => {
  globalThis.window = { open: () => null };
  try {
    assert.equal(imprimirEntrega({}), false);
  } finally {
    delete globalThis.window;
  }
});
