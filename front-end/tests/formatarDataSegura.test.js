import test from 'node:test';
import assert from 'node:assert/strict';
import { formatarDataSegura } from '../src/utils/formatarDataSegura.js';

test('formats valid dates using the Brazilian locale', () => {
  const date = '2024-01-02T03:04:05.000Z';

  assert.equal(formatarDataSegura(date), new Date(date).toLocaleString('pt-BR'));
});

test('returns a placeholder for missing or invalid dates', () => {
  assert.equal(formatarDataSegura(null), '-');
  assert.equal(formatarDataSegura(''), '-');
  assert.equal(formatarDataSegura('not-a-date'), '-');
});
