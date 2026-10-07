import test from 'node:test';
import assert from 'node:assert/strict';
import { estoqueDisponivelComanda } from '../src/utils/estoqueComanda.js';

test('comanda salva credita apenas sua reserva ao estoque restante', () => {
  const produto = { _id: 'cafe', estoque: 2 };
  const comanda = { registroOriginal: { estoqueBaixado: true, itens: [{ produtoId: 'cafe', quantidade: 3 }, { produtoId: 'bolo', quantidade: 10 }] } };
  assert.equal(estoqueDisponivelComanda(produto, comanda), 5);
  assert.equal(estoqueDisponivelComanda(produto, { registroOriginal: { ...comanda.registroOriginal, estoqueBaixado: false } }), 2);
  assert.equal(estoqueDisponivelComanda(produto, {}), 2);
});
