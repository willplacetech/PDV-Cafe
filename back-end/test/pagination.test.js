const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePagination, createPaginationResponse } = require('../utils/pagination');

test('pagination defaults to 25 and clamps pages to the last populated page', () => {
  const pagination = parsePagination({ pagina: '9' });
  const response = createPaginationResponse([{ id: 'last' }], 26, pagination);

  assert.deepEqual(response, {
    dados: [{ id: 'last' }],
    total: 26,
    pagina: 2,
    limite: 25,
    totalPaginas: 2,
  });
});

test('pagination returns an empty page consistently for an empty result', () => {
  const pagination = parsePagination({ pagina: '4', limite: '10' });

  assert.deepEqual(createPaginationResponse([], 0, pagination), {
    dados: [],
    total: 0,
    pagina: 1,
    limite: 10,
    totalPaginas: 0,
  });
});

test('pagination is opt-in when legacy callers omit page and limit', () => {
  assert.equal(parsePagination({}).requested, false);
});

test('pagination rejects malformed page and page size parameters', () => {
  for (const query of [
    { pagina: '0' },
    { pagina: '1.5' },
    { pagina: ['1'] },
    { pagina: '9007199254740991', limite: '100' },
    { limite: '101' },
    { limite: '0' },
    { limite: '25items' },
  ]) {
    assert.throws(() => parsePagination(query), { status: 400 });
  }
});

test('pagination supports explicit namespaced parameter names', () => {
  const pagination = parsePagination(
    { pagina_pedidos: '2', limite_pedidos: '50' },
    { pageKey: 'pagina_pedidos', limitKey: 'limite_pedidos' },
  );

  assert.deepEqual(pagination, {
    requested: true,
    pagina: 2,
    limite: 50,
    skip: 50,
  });
});
