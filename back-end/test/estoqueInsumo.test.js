const assert = require('node:assert/strict');
const { consumirInsumo, resumoEstoqueInsumo } = require('../utils/estoqueInsumo');

const acucar = {
  nome: 'Açúcar Refinado',
  precoCompra: 7,
  unidadeCompra: 'kg',
  estoqueEmbalagens: 10,
  estoqueInsumos: 10,
};

consumirInsumo(acucar, 50, 'g');
assert.equal(acucar.estoqueEmbalagens, 9.95);
assert.equal(resumoEstoqueInsumo(acucar).total, 9.95);

consumirInsumo(acucar, 0.5, 'kg');
assert.equal(acucar.estoqueEmbalagens, 9.45);

const produto = {
  nome: 'Leite Condensado',
  precoCompra: 5,
  conteudoPorEmbalagem: 395,
  unidadeConteudo: 'g',
  unidadeCompra: 'lata',
  estoqueEmbalagens: 10,
  estoqueInsumos: 10,
  estoqueConteudoAberto: 0,
};

const primeiroConsumo = consumirInsumo(produto, 250, 'g');
assert.equal(produto.estoqueEmbalagens, 9);
assert.equal(produto.estoqueConteudoAberto, 145);
assert.equal(primeiroConsumo.embalagensConsumidas, 1);
assert.equal(resumoEstoqueInsumo(produto).totalBase, 3700);

consumirInsumo(produto, 145, 'g');
assert.equal(produto.estoqueEmbalagens, 9);
assert.equal(produto.estoqueConteudoAberto, 0);

console.log('estoqueInsumo: cenários de embalagem parcial aprovados');