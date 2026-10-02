const test = require('node:test');
const assert = require('node:assert/strict');
const { pesoPorUnidadeEmKg, precoPorUnidade } = require('../utils/pesoProduto');

test('separa estoque em unidades do peso e calcula o preço do bolo inteiro', () => {
  const produto = { estoque: 3, pesoPorUnidade: 3506, unidadePeso: 'g', preco: 60 };

  assert.equal(produto.estoque, 3);
  assert.equal(pesoPorUnidadeEmKg(produto), 3.506);
  assert.equal(Number((produto.estoque * pesoPorUnidadeEmKg(produto)).toFixed(2)), 10.52);
  assert.equal(precoPorUnidade(produto), 210.36);
});

test('peso em kg é usado como está (única unidade aceita pelo model)', () => {
  const produto = { estoque: 3, pesoPorUnidade: 3.506, unidadePeso: 'kg', preco: 60 };

  assert.equal(pesoPorUnidadeEmKg(produto), 3.506);
  assert.equal(Number((produto.estoque * pesoPorUnidadeEmKg(produto)).toFixed(2)), 10.52);
  assert.equal(precoPorUnidade(produto), 210.36);
});