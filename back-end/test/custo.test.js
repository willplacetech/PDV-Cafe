const test = require('node:test');
const assert = require('node:assert/strict');
const { converterCustoBase, calcularCustoReceita, calcularVariacaoPercentual, calcularMargem } = require('../utils/custo');

test('custo do item respeita snapshot e converte legado pesado para kg', () => {
  const { custoUnitarioDoItem } = require('../utils/custo');
  const produto = { tipoProduto: 'revenda', unidadeVenda: 'kg', pesoPorUnidade: 0.5, precoCompra: 5 };
  assert.equal(custoUnitarioDoItem({ custoUnitarioHistorico: 3 }, produto), 3);
  assert.equal(custoUnitarioDoItem({ custoUnitarioHistorico: 0 }, produto), 0);
  assert.equal(custoUnitarioDoItem({}, produto), 10);
  assert.equal(custoUnitarioDoItem({}, { ...produto, producaoPropria: true, custoUnitario: 7 }), 14);
  assert.equal(custoUnitarioDoItem({}, null), 0);
});

test('converte preco de compra para custo unitario base', () => {
  assert.equal(converterCustoBase(8, 'kg', 'g'), 0.008);
  assert.equal(converterCustoBase(12, 'l', 'ml'), 0.012);
});

test('calcula custo total e unitario da receita', () => {
  const custo = calcularCustoReceita([
    { quantidade: 2, custoUnitarioBase: 0.008 },
    { quantidade: 1, custoUnitarioBase: 0.015 },
  ], 0.5, 1.2, 0.8, 4);

  assert.equal(custo.custoInsumosTotal, 0.031);
  assert.equal(custo.custoTotal, 2.531);
  assert.equal(custo.custoUnitario, 0.63275);
});

test('calcula variacao percentual e margem', () => {
  assert.equal(calcularVariacaoPercentual(100, 110), 10);
  assert.equal(calcularMargem(100, 150), 33.33);
});
