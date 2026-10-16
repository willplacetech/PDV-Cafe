import test from 'node:test';
import assert from 'node:assert/strict';
import { paginarItens } from '../src/hooks/usePagination.js';

test('slices an item list by page without changing its order', () => {
  const items = Array.from({ length: 30 }, (_, index) => index + 1);

  assert.deepEqual(paginarItens(items, 2, 10), {
    itensPagina: items.slice(10, 20),
    paginaAtual: 2,
    limiteAtual: 10,
    total: 30,
  });
  assert.equal(items.length, 30);
});

test('returns an empty first page for empty lists and clamps invalid page values', () => {
  assert.deepEqual(paginarItens([], 3, 10), {
    itensPagina: [],
    paginaAtual: 1,
    limiteAtual: 10,
    total: 0,
  });
  assert.deepEqual(paginarItens([1, 2, 3], 8, 2).itensPagina, [3]);
  assert.deepEqual(paginarItens([1, 2, 3], 0, 2).itensPagina, [1, 2]);
});

test('uses a safe default page size when the requested size is invalid', () => {
  const state = paginarItens(Array.from({ length: 30 }, (_, index) => index), 1, 0);

  assert.equal(state.limiteAtual, 25);
  assert.equal(state.itensPagina.length, 25);
});
