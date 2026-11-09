import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNumericValue,
  quantityMinimum,
  quantityStep,
  safeNumber,
} from '../src/utils/numeric.js';
import { shouldPreventNumberWheelScroll } from '../src/utils/numberInputWheelGuard.js';

test('parseNumericValue aceita valores vazios e decimais brasileiros sem NaN', () => {
  assert.equal(parseNumericValue('', 0), 0);
  assert.equal(parseNumericValue(null, 0), 0);
  assert.equal(parseNumericValue('1.234,50', 0), 1234.5);
  assert.equal(parseNumericValue('1,234.50', 0), 1234.5);
  assert.equal(parseNumericValue('12.5', 0), 12.5);
  assert.equal(parseNumericValue('abc', 0), 0);
});

test('safeNumber preserva zero e rejeita valores inválidos', () => {
  assert.equal(safeNumber('0'), 0);
  assert.equal(safeNumber('  0,50  '), 0.5);
  assert.equal(safeNumber('--', 7), 7);
  assert.equal(safeNumber(undefined, 9), 9);
});

test('passo e mínimo da quantidade respeitam kg/L fracionados e unidade inteira', () => {
  for (const unit of ['kg', 'L']) {
    assert.equal(quantityStep(unit), '0.001');
    assert.equal(quantityMinimum(unit), 0.001);
  }
  assert.equal(quantityStep('un'), '1');
  assert.equal(quantityMinimum('un'), 1);
});

test('bloqueia rolagem do mouse em input numérico focado, mas não bloqueia zoom ou outros campos', () => {
  const input = { type: 'number', matches: (selector) => selector === 'input[type="number"]' };
  const textInput = { type: 'text', matches: (selector) => selector === 'input[type="number"]' };

  assert.equal(shouldPreventNumberWheelScroll(input, input, false, false), true);
  assert.equal(shouldPreventNumberWheelScroll(input, textInput, false, false), false);
  assert.equal(shouldPreventNumberWheelScroll(input, input, true, false), false);
  assert.equal(shouldPreventNumberWheelScroll(textInput, textInput, false, false), false);
});
