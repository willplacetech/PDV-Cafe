const assert = require('node:assert/strict');
const {
  consumirInsumo,
  resumoEstoqueInsumo,
  calcularResumoCompleto,
  ajustarEstoque,
  calcularCustoUnitarioBase,
  calcularEstoqueMinimoBase,
  paraBase,
  unidadeBase,
  estoqueTotalBase,
  deveAplicarConversaoRevenda,
  calcularCustoUnitarioVenda,
  estoqueEmUnidadeVenda,
} = require('../utils/estoqueInsumo');

const proximo = (valor, esperado, tolerancia = 0.01) => assert.ok(Math.abs(Number(valor || 0) - esperado) < tolerancia, `Esperado ~${esperado}, recebido ${valor}`);
const formatar = (valor) => Number(valor || 0);

const acucar = {
  nome: 'Acucar Refinado',
  precoCompra: 7,
  unidadeCompra: 'kg',
  estoqueEmbalagens: 10,
  estoqueInsumos: 10,
};

consumirInsumo(acucar, 50, 'g');
assert.equal(acucar.estoqueEmbalagens, 9);
assert.equal(acucar.estoqueConteudoAberto, 0.95);
assert.equal(resumoEstoqueInsumo(acucar).total, 9.95);

consumirInsumo(acucar, 0.5, 'kg');
assert.equal(acucar.estoqueEmbalagens, 9);
assert.equal(acucar.estoqueConteudoAberto, 0.45);

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
assert.equal(primeiroConsumo.embalagensConsumidas, 250 / 395);
assert.equal(resumoEstoqueInsumo(produto).totalBase, 3700);

consumirInsumo(produto, 145, 'g');
assert.equal(produto.estoqueEmbalagens, 9);
assert.equal(produto.estoqueConteudoAberto, 0);

console.log('estoqueInsumo: cenarios de embalagem parcial aprovados');

const acucarCenario = {
  nome: 'Acucar',
  precoCompra: 7,
  unidadeCompra: 'kg',
  conteudoPorEmbalagem: 1,
  unidadeConteudo: 'kg',
  estoqueEmbalagens: 10,
  estoqueInsumos: 10,
  estoqueConteudoAberto: 0,
};

const resumoAcucar = calcularResumoCompleto(acucarCenario);
assert.equal(resumoAcucar.embalagensFechadas, 10);
assert.equal(resumoAcucar.total, 10);
assert.equal(resumoAcucar.conteudoPorEmbalagem, 1);
assert.equal(resumoAcucar.unidadeConteudo, 'kg');
proximo(resumoAcucar.custoUnitarioBase, 0.007);
proximo(resumoAcucar.custoPorKg, 7);
proximo(resumoAcucar.custoPor100g, 0.7);
proximo(resumoAcucar.custoPorGrama, 0.007);

console.log('estoqueInsumo: resumo completo do acucar aprovado');

const leiteCenario = {
  nome: 'Leite Condensado',
  precoCompra: 5,
  unidadeCompra: 'lata',
  conteudoPorEmbalagem: 395,
  unidadeConteudo: 'g',
  estoqueEmbalagens: 10,
  estoqueInsumos: 10,
  estoqueConteudoAberto: 0,
};

const resumoLeite = calcularResumoCompleto(leiteCenario);
assert.equal(resumoLeite.embalagensFechadas, 10);
assert.equal(resumoLeite.total, 3950);
assert.equal(resumoLeite.totalKg, 3.95);
assert.equal(resumoLeite.conteudoPorEmbalagem, 395);
assert.equal(resumoLeite.unidadeConteudo, 'g');
proximo(resumoLeite.custoUnitarioBase, 5 / 395);
proximo(resumoLeite.custoPorKg, (5 / 395) * 1000);
proximo(resumoLeite.custoPor100g, (5 / 395) * 100);
proximo(resumoLeite.custoPorGrama, 5 / 395);

console.log('estoqueInsumo: resumo completo do leite condensado aprovado');

const acucarMov = {
  nome: 'Acucar',
  precoCompra: 7,
  unidadeCompra: 'kg',
  conteudoPorEmbalagem: 1,
  unidadeConteudo: 'kg',
  estoqueEmbalagens: 10,
  estoqueInsumos: 10,
  estoqueConteudoAberto: 0,
};

const ajuste = ajustarEstoque(acucarMov, 5);
assert.equal(ajuste.embalagensAntes, 10);
assert.equal(ajuste.embalagensDepois, 15);
assert.equal(ajuste.totalAntes, 10);
assert.equal(ajuste.totalDepois, 15);
assert.equal(acucarMov.estoqueEmbalagens, 15);
assert.equal(acucarMov.estoqueInsumos, 15);

console.log('estoqueInsumo: ajuste de estoque (+5) aprovado');

const acucarMovNeg = {
  nome: 'Acucar',
  precoCompra: 7,
  unidadeCompra: 'kg',
  conteudoPorEmbalagem: 1,
  unidadeConteudo: 'kg',
  estoqueEmbalagens: 10,
  estoqueInsumos: 10,
  estoqueConteudoAberto: 0,
};

const ajusteNeg = ajustarEstoque(acucarMovNeg, -3);
assert.equal(ajusteNeg.embalagensAntes, 10);
assert.equal(ajusteNeg.embalagensDepois, 7);
assert.equal(ajusteNeg.totalAntes, 10);
assert.equal(ajusteNeg.totalDepois, 7);
assert.equal(acucarMovNeg.estoqueEmbalagens, 7);

console.log('estoqueInsumo: ajuste de estoque (-3) aprovado');

const acucarMovExcesso = {
  nome: 'Acucar',
  precoCompra: 7,
  unidadeCompra: 'kg',
  conteudoPorEmbalagem: 1,
  unidadeConteudo: 'kg',
  estoqueEmbalagens: 10,
  estoqueInsumos: 10,
  estoqueConteudoAberto: 0,
};

try {
  ajustarEstoque(acucarMovExcesso, -15);
  assert.fail('Deveria ter lancado erro para estoque insuficiente');
} catch (error) {
  assert.ok(error.message.includes('poss'));
}

console.log('estoqueInsumo: ajuste de estoque com saldo insuficiente aprovado');

proximo(calcularCustoUnitarioBase(7, 1, 'kg'), 7 / 1000);
proximo(calcularCustoUnitarioBase(5, 395, 'g'), 5 / 395);
proximo(calcularCustoUnitarioBase(12, 1, 'l'), 12 / 1000);
assert.equal(calcularCustoUnitarioBase(0, 1, 'kg'), 0);
assert.equal(calcularCustoUnitarioBase(7, 0, 'kg'), 0);

console.log('estoqueInsumo: calcularCustoUnitarioBase aprovado');

assert.equal(calcularEstoqueMinimoBase(2, 'kg'), 2000);
assert.equal(calcularEstoqueMinimoBase(500, 'g'), 500);
assert.equal(calcularEstoqueMinimoBase(0, 'kg'), 0);
assert.equal(calcularEstoqueMinimoBase(0.5, 'kg'), 500);

console.log('estoqueInsumo: calcularEstoqueMinimoBase aprovado');

const produtoRevendaConvertido = {
  tipo: 'venda',
  unidadeCompra: 'kg',
  unidadeVenda: 'un',
  precoCompra: 30,
  rendimentoPorUnidadeCompra: 8,
  estoque: 3,
};

assert.equal(deveAplicarConversaoRevenda(produtoRevendaConvertido), true);
proximo(calcularCustoUnitarioVenda(produtoRevendaConvertido), 3.75);
assert.equal(estoqueEmUnidadeVenda(produtoRevendaConvertido), 24);

console.log('estoqueInsumo: conversão de revenda kg -> un aprovada');

const acucarConsumo = {
  nome: 'Acucar',
  precoCompra: 7,
  unidadeCompra: 'kg',
  conteudoPorEmbalagem: 1,
  unidadeConteudo: 'kg',
  estoqueEmbalagens: 10,
  estoqueInsumos: 10,
  estoqueConteudoAberto: 0,
};

consumirInsumo(acucarConsumo, 50, 'g');
assert.equal(acucarConsumo.estoqueEmbalagens, 9);
assert.equal(acucarConsumo.estoqueConteudoAberto, 0.95);
assert.equal(resumoEstoqueInsumo(acucarConsumo).total, 9.95);
assert.equal(resumoEstoqueInsumo(acucarConsumo).totalKg, 9.95);
assert.equal(calcularResumoCompleto(acucarConsumo).esgotado, false);
assert.equal(calcularResumoCompleto(acucarConsumo).abaixoMinimo, false);

console.log('estoqueInsumo: consumo de 50g acucar (10kg -> 9,95kg) aprovado');

const leiteConsumo = {
  nome: 'Leite Condensado',
  precoCompra: 5,
  unidadeCompra: 'lata',
  conteudoPorEmbalagem: 395,
  unidadeConteudo: 'g',
  estoqueEmbalagens: 10,
  estoqueInsumos: 10,
  estoqueConteudoAberto: 0,
};

consumirInsumo(leiteConsumo, 250, 'g');
const resumoLeiteConsumo = calcularResumoCompleto(leiteConsumo);
assert.equal(resumoLeiteConsumo.embalagensFechadas, 9);
assert.equal(resumoLeiteConsumo.conteudoAberto, 145);
assert.equal(resumoLeiteConsumo.totalBase, 3700);
assert.equal(resumoLeiteConsumo.totalKg, 3.7);

console.log('estoqueInsumo: consumo de 250g leite (3,95kg -> 3,7kg) aprovado');

const ovosConsumo = {
  nome: 'Ovos',
  tipo: 'insumo',
  unidade: 'un',
  unidadeCompra: 'un',
  unidadeConteudo: 'un',
  conteudoPorEmbalagem: 20,
  estoqueEmbalagens: 1,
  estoqueInsumos: 1,
  estoqueConteudoAberto: 0,
};

consumirInsumo(ovosConsumo, 1, 'un');
assert.equal(ovosConsumo.estoqueEmbalagens, 0);
assert.equal(ovosConsumo.estoqueInsumos, 0);
assert.equal(ovosConsumo.estoqueConteudoAberto, 19);
assert.equal(calcularResumoCompleto(ovosConsumo).total, 19);

console.log('estoqueInsumo: consumo de 1 ovo em embalagem com 20 aprovado');

const acucarEsgotado = {
  nome: 'Acucar',
  precoCompra: 7,
  unidadeCompra: 'kg',
  conteudoPorEmbalagem: 1,
  unidadeConteudo: 'kg',
  estoqueEmbalagens: 0,
  estoqueInsumos: 0,
  estoqueConteudoAberto: 0,
};

assert.equal(calcularResumoCompleto(acucarEsgotado).esgotado, true);

console.log('estoqueInsumo: estoque esgotado aprovado');

const acucarComMinimo = {
  nome: 'Acucar',
  precoCompra: 7,
  unidadeCompra: 'kg',
  conteudoPorEmbalagem: 1,
  unidadeConteudo: 'kg',
  estoqueEmbalagens: 1,
  estoqueInsumos: 1,
  estoqueConteudoAberto: 0,
  estoqueMinimoBase: 2000,
};

const resumoMinimo = calcularResumoCompleto(acucarComMinimo);
assert.equal(resumoMinimo.abaixoMinimo, true);
assert.equal(resumoMinimo.estoqueMinimo, 2);

console.log('estoqueInsumo: abaixo do minimo aprovado');

assert.equal(paraBase(50, 'g'), 50);
assert.equal(paraBase(0.5, 'kg'), 500);
assert.equal(unidadeBase({ unidadeCompra: 'lata', unidadeConteudo: 'g' }), 'g');
assert.equal(unidadeBase({ unidadeCompra: 'kg' }), 'kg');
assert.equal(estoqueTotalBase(acucarCenario), 10000);
