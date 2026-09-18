const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularDreResumo } = require('../utils/contabil');

test('calcula EBIT e EBITDA na ordem correta do DRE', () => {
  const dre = calcularDreResumo({
    receitaBruta: 1000,
    deducoes: 100,
    cmv: 400,
    despesasOperacionais: 200,
    depreciacaoAmortizacao: 50,
    despesasFinanceiras: 0,
  });

  assert.equal(dre.receitaLiquida, 900);
  assert.equal(dre.lucroBruto, 500);
  assert.equal(dre.ebit, 300);
  assert.equal(dre.ebitda, 350);
  assert.equal(dre.lucroLiquido, 300);
  assert.ok(dre.ebitda >= dre.ebit);
});
