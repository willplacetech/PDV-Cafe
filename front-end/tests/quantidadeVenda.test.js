import test from 'node:test';
import assert from 'node:assert/strict';
import { permiteFracionar } from '../src/utils/quantidadeVenda.js';

test('unit purchase or sale requires whole quantities', () => {
  assert.equal(permiteFracionar({ unidadeCompra: 'un', unidadeVenda: 'kg' }), false);
  assert.equal(permiteFracionar({ unidadeCompra: 'kg', unidadeVenda: 'un' }), false);
});

test('weight and volume sales remain fractional unless sold by piece weight', () => {
  assert.equal(permiteFracionar({ unidadeCompra: 'kg', unidadeVenda: 'kg' }), true);
  assert.equal(permiteFracionar({ unidadeCompra: 'L', unidadeVenda: 'L' }), true);
  assert.equal(permiteFracionar({ unidadeCompra: 'kg', unidadeVenda: 'kg', pesoPorUnidade: 2 }), false);
});
