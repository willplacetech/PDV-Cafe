const test = require('node:test');
const assert = require('node:assert/strict');
const { resolverTipoProduto, categoriaPorTipo } = require('../utils/produtoTipo');

test('resolve tipo legado e novo corretamente', () => {
  assert.equal(resolverTipoProduto({ tipo: 'insumo', controladoComoInsumo: false }), 'insumo');
  assert.equal(resolverTipoProduto({ tipo: undefined, controladoComoInsumo: true }), 'insumo');
  assert.equal(resolverTipoProduto({ tipo: undefined, controladoComoInsumo: false }), 'venda');
  assert.equal(resolverTipoProduto({ tipo: 'venda' }), 'venda');
  assert.equal(resolverTipoProduto({ tipo: 'venda', controladoComoInsumo: true }), 'venda');
  assert.equal(resolverTipoProduto({ tipo: 'insumo', controladoComoInsumo: true }), 'insumo');
});

test('categoria de insumo e venda são mapeadas corretamente', () => {
  assert.equal(categoriaPorTipo('insumo'), 'Insumos');
  assert.equal(categoriaPorTipo('venda'), 'Outros');
});
