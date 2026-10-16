import test from 'node:test';
import assert from 'node:assert/strict';
import { readPaginationParams, updatePaginationParams } from '../src/utils/paginationUrl.js';

test('URL pagination uses supported defaults and preserves filter parameters', () => {
  const params = new URLSearchParams('busca=cafe&pagina=4&limite=50');

  assert.deepEqual(readPaginationParams(params), { pagina: 4, limite: 50 });

  const updated = updatePaginationParams(params, { pagina: 2 });
  assert.equal(updated.get('busca'), 'cafe');
  assert.equal(updated.get('pagina'), '2');
  assert.equal(updated.get('limite'), '50');
});

test('changing page size resets page and supports independently named lists', () => {
  const params = new URLSearchParams('pagina_pedidos=5&limite_pedidos=25&pagina_comandas=3');
  const updated = updatePaginationParams(params, { limite: 100 }, 'pedidos');

  assert.deepEqual(readPaginationParams(updated, 'pedidos'), { pagina: 1, limite: 100 });
  assert.equal(updated.get('pagina_comandas'), '3');
});

test('invalid URL pagination values fall back to safe defaults', () => {
  assert.deepEqual(readPaginationParams(new URLSearchParams('pagina=0&limite=500')), { pagina: 1, limite: 25 });
});
