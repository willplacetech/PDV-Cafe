const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularPrecoComDesconto, normalizarDescontos, calcularPrecoGrupo } = require('../utils/descontosQuantidade');

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

test('calcularPrecoGrupo retorna null quando produto não tem grupoDesconto', () => {
  const produto = { preco: 16 };
  const result = calcularPrecoGrupo(produto, 1, []);
  assert.equal(result, null);
});

test('calcularPrecoGrupo retorna null quando grupoDesconto está inativo', () => {
  const produto = { preco: 16, grupoDesconto: { nome: 'Cookies', quantidadeMinima: 3, precoPromocional: 14, ativo: false } };
  const result = calcularPrecoGrupo(produto, 1, []);
  assert.equal(result, null);
});

test('calcularPrecoGrupo aplica preço promocional quando total do grupo atinge a mínima', () => {
  const produtoA = { preco: 16, grupoDesconto: { nome: 'Cookies', quantidadeMinima: 3, precoPromocional: 14, ativo: true } };
  const produtoB = { preco: 16, grupoDesconto: { nome: 'Cookies', quantidadeMinima: 3, precoPromocional: 14, ativo: true } };
  const cartItens = [
    { produto: produtoA, quantidade: 2 },
    { produto: produtoB, quantidade: 1 },
  ];
  const result = calcularPrecoGrupo(produtoA, 2, cartItens, 16);
  assert.equal(result.grupoAtivo, true);
  assert.equal(result.precoUnitario, 14);
  assert.equal(result.totalGrupo, 3);
  assert.equal(result.economiaUnitario, 2);
  assert.equal(result.economiaTotal, 4);
  assert.equal(result.faltamParaGrupo, 0);
});

test('calcularPrecoGrupo não aplica desconto quando total do grupo é insuficiente', () => {
  const produtoA = { preco: 16, grupoDesconto: { nome: 'Cookies', quantidadeMinima: 5, precoPromocional: 14, ativo: true } };
  const produtoB = { preco: 16, grupoDesconto: { nome: 'Cookies', quantidadeMinima: 5, precoPromocional: 14, ativo: true } };
  const cartItens = [
    { produto: produtoA, quantidade: 2 },
    { produto: produtoB, quantidade: 1 },
  ];
  const result = calcularPrecoGrupo(produtoA, 2, cartItens, 16);
  assert.equal(result.grupoAtivo, false);
  assert.equal(result.precoUnitario, 16);
  assert.equal(result.totalGrupo, 3);
  assert.equal(result.faltamParaGrupo, 2);
  assert.equal(result.economiaTotal, 0);
});

test('calcularPrecoGrupo somente soma produtos do mesmo grupo', () => {
  const cookies = { preco: 16, grupoDesconto: { nome: 'Cookies', quantidadeMinima: 4, precoPromocional: 14, ativo: true } };
  const bolos = { preco: 20, grupoDesconto: { nome: 'Bolos', quantidadeMinima: 4, precoPromocional: 18, ativo: true } };
  const cartItens = [
    { produto: cookies, quantidade: 3 },
    { produto: bolos, quantidade: 2 },
  ];
  const resultCookies = calcularPrecoGrupo(cookies, 3, cartItens, 16);
  const resultBolos = calcularPrecoGrupo(bolos, 2, cartItens, 20);
  assert.equal(resultCookies.totalGrupo, 3);
  assert.equal(resultCookies.faltamParaGrupo, 1);
  assert.equal(resultCookies.grupoAtivo, false);
  assert.equal(resultBolos.totalGrupo, 2);
  assert.equal(resultBolos.faltamParaGrupo, 2);
  assert.equal(resultBolos.grupoAtivo, false);
});

test('calcularPrecoGrupo ignora produtos sem grupoDesconto na soma do grupo', () => {
  const cookies = { preco: 16, grupoDesconto: { nome: 'Cookies', quantidadeMinima: 2, precoPromocional: 14, ativo: true } };
  const bebida = { preco: 8, grupoDesconto: undefined };
  const cartItens = [
    { produto: cookies, quantidade: 1 },
    { produto: bebida, quantidade: 5 },
  ];
  const result = calcularPrecoGrupo(cookies, 1, cartItens, 16);
  assert.equal(result.totalGrupo, 1);
  assert.equal(result.faltamParaGrupo, 1);
  assert.equal(result.grupoAtivo, false);
});
