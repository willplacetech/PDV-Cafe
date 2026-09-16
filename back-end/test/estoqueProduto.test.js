const test = require('node:test');
const assert = require('node:assert/strict');
const { dadosEstoqueProduto, dadosMovimentoEstoque, normalizarEstoqueLegado } = require('../utils/estoqueProduto');

test('normaliza estoque legado em gramas para uma peça e peso total', () => {
  const produto = { unidadeVenda: 'kg', pesoPorUnidade: 3.50665, unidadePeso: 'kg', estoque: 3506.65, estoquePesoKg: 0 };
  const exibicao = dadosEstoqueProduto(produto);
  assert.equal(exibicao.estoque, 1);
  assert.equal(exibicao.estoquePesoTotal, 3.50665);
  normalizarEstoqueLegado(produto);
  assert.equal(produto.estoque, 1);
  assert.equal(produto.estoquePesoKg, 3.50665);
});

test('fatia pesada baixa peso sem reduzir peças', () => {
  const produto = { unidadeVenda: 'kg', pesoPorUnidade: 3.50665, unidadePeso: 'kg', estoque: 3, estoquePesoKg: 10.51995 };
  assert.deepEqual(dadosMovimentoEstoque(produto, { quantidade: 1, tipoVenda: 'peso', pesoVendidoKg: 0.32 }), { pecas: 0, pesoKg: 0.32, tipoVenda: 'peso' });
});

test('converte item legado 320 para 0,320 kg', () => {
  const produto = { unidadeVenda: 'kg', pesoPorUnidade: 3.50665, unidadePeso: 'kg', estoque: 3, estoquePesoKg: 10.51995 };
  assert.deepEqual(dadosMovimentoEstoque(produto, { quantidade: 320 }), { pecas: 0, pesoKg: 0.32, tipoVenda: 'peso' });
});
