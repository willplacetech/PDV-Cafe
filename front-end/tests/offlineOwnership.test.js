import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createOfflineStore } from '../src/services/offlineStore.js';

const alice = { ownerId: 'alice', tenantId: 'cafe', role: 'operador' };
const bob = { ownerId: 'bob', tenantId: 'cafe', role: 'admin' };
const sale = (id, identity) => ({ idTemporario: id, endpoint: '/comandas', payload: { idTemporario: id }, ...identity });
const make = (legacy = []) => createOfflineStore({ indexedDB: new IDBFactory(), storage: { getItem: () => JSON.stringify(legacy), removeItem() {} } });

test('listagem e claim isolam operador e tenant sem apagar outras vendas', async () => {
  const store = make();
  await store.enqueue(sale('alice', alice));
  await store.enqueue(sale('bob', bob));
  assert.deepEqual((await store.list(alice)).map(s => s.idTemporario), ['alice']);
  assert.deepEqual(await store.list(null), []);
  assert.equal(await store.claimNext('aba', 90000, { ...alice, tenantId: 'outro' }), null);
  const claim = await store.claimNext('aba', 90000, bob);
  assert.equal(claim.venda.idTemporario, 'bob');
  await store.completeClaim(claim);
  assert.equal((await store.list(alice)).length, 1);
});

test('legado sem origem fica recuperavel e exige admin, confirmacao e motivo', async () => {
  const store = make([sale('legado')]);
  assert.equal(await store.claimNext('aba', 90000, bob), null);
  assert.equal((await store.list(bob)).length, 0);
  assert.deepEqual(await store.listQuarantine(alice), []);
  assert.equal((await store.listQuarantine(bob)).length, 1);
  await assert.rejects(store.resolveOrigin('legado', alice, { confirmed: true, reason: 'conferido' }));
  await assert.rejects(store.resolveOrigin('legado', bob, { confirmed: false, reason: 'conferido' }));
  const result = await store.resolveOrigin('legado', bob, { confirmed: true, reason: 'Conferido com operador responsavel' });
  assert.equal(result.ok, true);
  const [saved] = await store.list(bob);
  assert.equal(saved.ownerId, 'bob');
  assert.equal(saved.originAudit.resolvedBy, 'bob');
  assert.equal(saved.originAudit.previousOwnerId, null);
  assert.equal(saved.payload.origemOffline.ownerId, 'bob');
  await assert.rejects(store.resolveOrigin('legado', bob, { confirmed: true, reason: 'atribuir de novo' }));
});

test('snapshot origem payload e imutavel e nao aceita sobrescrita por id', async () => {
  const store = make();
  const saved = await store.enqueue(sale('id', alice));
  assert.deepEqual(saved.venda.payload.origemOffline, { ownerId: 'alice', tenantId: 'cafe' });
  assert.equal((await store.enqueue(sale('id', bob))).ok, false);
  assert.equal((await store.list(alice))[0].ownerId, 'alice');
});
