const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularPrecoComDesconto, normalizarDescontos } = require('../utils/descontosQuantidade');

test('aplica a maior faixa de desconto compatível com a quantidade', () => {
  const produto = { preco: 16, descontosPorQuantidade: [
    { quantidadeMinima: 1, precoUnitario: 16 },
    { quantidadeMinima: 3, precoUnitario: 14 },
    { quantidadeMinima: 6, precoUnitario: 12 },
  ] };
  assert.equal(calcularPrecoComDesconto(produto, 1).precoUnitario, 16);
  assert.equal(calcularPrecoComDesconto(produto, 3).precoUnitario, 14);
  assert.equal(calcularPrecoComDesconto(produto, 6).precoUnitario, 12);
  assert.equal(calcularPrecoComDesconto(produto, 2).economiaTotal, 0);
});

test('calcula economia por unidade e total', () => {
  const resultado = calcularPrecoComDesconto({ preco: 16, descontosPorQuantidade: [{ quantidadeMinima: 3, precoUnitario: 14 }] }, 3);
  assert.equal(resultado.economiaUnitario, 2);
  assert.equal(resultado.economiaTotal, 6);
});

test('ordena faixas e ignora faixas inativas', () => {
  const faixas = normalizarDescontos([
    { quantidadeMinima: 6, precoUnitario: 12 },
    { quantidadeMinima: 3, precoUnitario: 14, ativo: false },
    { quantidadeMinima: 1, precoUnitario: 16 },
  ]);
  assert.deepEqual(faixas.map((faixa) => faixa.quantidadeMinima), [1, 6]);
});
