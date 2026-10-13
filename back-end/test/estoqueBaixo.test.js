const test = require('node:test');
const assert = require('node:assert/strict');
const { listarEstoqueBaixo, resumirEstoque } = require('../utils/estoqueBaixo');

test('uses the default minimum of five units for a sale product', () => {
  const produto = { _id: 'p1', nome: 'Café', tipo: 'venda', estoque: 4, estoqueMinimo: 0 };

  assert.deepEqual(resumirEstoque(produto), { qtdAtual: 4, minimo: 5, unidade: 'un' });
  assert.equal(listarEstoqueBaixo([produto]).length, 1);
});

test('calculates low stock for supplies in base content units', () => {
  const produto = {
    _id: 'p2',
    nome: 'Leite',
    tipo: 'insumo',
    estoqueEmbalagens: 2,
    conteudoPorEmbalagem: 1,
    estoqueConteudoAberto: 0.25,
    estoqueMinimoBase: 3,
    unidadeConteudo: 'L',
  };

  assert.deepEqual(resumirEstoque(produto), { qtdAtual: 2.25, minimo: 3, unidade: 'L' });
  assert.equal(listarEstoqueBaixo([produto]).length, 1);
});

test('does not report products with no independent stock', () => {
  const coz = { _id: 'p3', nome: 'Prato feito', tipo: 'venda', tipoProduto: 'coz', estoque: 0 };
  const pratoNaHora = { _id: 'p5', nome: 'Prato do dia', tipo: 'venda', categoria: 'Pratos na Hora', estoque: 0 };
  const producaoPropria = { _id: 'p6', nome: 'Bolo caseiro', tipo: 'venda', producaoPropria: true, estoque: 0 };

  assert.deepEqual(listarEstoqueBaixo([coz, pratoNaHora, producaoPropria]), []);
});

test('uses total kilograms for products sold by weight', () => {
  const produto = {
    _id: 'p4',
    nome: 'Bolo fatiado',
    tipo: 'venda',
    unidadeVenda: 'kg',
    pesoPorUnidade: 3.5,
    estoque: 2,
    estoquePesoKg: 0.75,
    estoquePesoNormalizado: true,
    estoqueMinimo: 1,
  };

  assert.deepEqual(resumirEstoque(produto), { qtdAtual: 0.75, minimo: 1, unidade: 'kg' });
});
