import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularMultiplicadorFidelidade } from '../src/utils/fidelidade.js';

test('multiplicador de fidelidade cresce a cada 10 comandas completas', () => {
  assert.equal(calcularMultiplicadorFidelidade(0), 0);
  assert.equal(calcularMultiplicadorFidelidade(9), 0);
  assert.equal(calcularMultiplicadorFidelidade(10), 1);
  assert.equal(calcularMultiplicadorFidelidade(19), 1);
  assert.equal(calcularMultiplicadorFidelidade(20), 2);
});

test('multiplicador não fica negativo ou inválido', () => {
  assert.equal(calcularMultiplicadorFidelidade(-10), 0);
  assert.equal(calcularMultiplicadorFidelidade('inválido'), 0);
});
