import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { createOfflineStore } from '../src/services/offlineStore.js';

const storageFake = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
};
const identity = { ownerId: 'user-1', tenantId: 'tenant-1', role: 'admin' };
const venda = id => ({ ...identity, idTemporario: id, endpoint: '/comandas', payload: { idTemporario: id }, status: 'pendente', criadaEm: '2026-01-01T00:00:00.000Z' });
const stores = (options = {}) => {
  const config = { indexedDB: new IDBFactory(), storage: storageFake(), ...options };
  return [createOfflineStore(config), createOfflineStore(config)];
};

test('duas abas inserem simultaneamente sem sobrescrever vendas', async () => {
  const [a, b] = stores();
  await Promise.all([a.enqueue(venda('a')), b.enqueue(venda('b'))]);
  assert.deepEqual((await a.inspectAll()).map(item => item.idTemporario).sort(), ['a', 'b']);
});

test('limite de 50 e duplicatas sao verificados dentro da transacao', async () => {
  const [a, b] = stores();
  await Promise.all(Array.from({ length: 49 }, (_, id) => a.enqueue(venda(String(id)))));
  const results = await Promise.all([a.enqueue(venda('penultima')), b.enqueue(venda('ultima'))]);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal(results.find(result => !result.ok).motivo, 'limite');
  assert.equal((await a.inspectAll()).length, 50);
  assert.equal((await b.enqueue(venda('0'))).ok, true);
  assert.equal((await a.inspectAll()).length, 50);
});

test('lease duravel permite apenas um worker e recupera uma aba encerrada', async () => {
  let time = 100;
  const [a, b] = stores({ now: () => time });
  await a.enqueue(venda('a'));
  const claims = await Promise.all([a.claimNext('aba-a', 1000, identity), b.claimNext('aba-b', 1000, identity)]);
  const first = claims.find(Boolean);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(await b.claimNext('outra', 1000, identity), null);
  time = 1101;
  const recovered = await b.claimNext('recuperada', 1000, identity);
  assert.equal(recovered.venda.idTemporario, 'a');
  assert.equal(await a.completeClaim(first), false);
  assert.equal((await a.inspectAll()).length, 1);
  assert.equal(await b.completeClaim(recovered), true);
  assert.equal((await a.inspectAll()).length, 0);
});

test('renovacao e liberacao so aceitam o token vigente', async () => {
  let time = 100;
  const [a, b] = stores({ now: () => time });
  await a.enqueue(venda('a'));
  const first = await a.claimNext('aba-a', 1000, identity);
  time = 800;
  assert.equal(await a.renewLease(first, 1000), true);
  time = 1200;
  assert.equal(await b.claimNext('aba-b', 1000, identity), null);
  assert.equal(await b.releaseClaim({ ...first, token: 'estranho' }), false);
  assert.equal(await a.releaseClaim(first), true);
  assert.ok(await b.claimNext('aba-b', 1000, identity));
});

test('migracao repetida copia por id e nao ressuscita venda ja sincronizada', async () => {
  const raw = JSON.stringify([venda('legado'), venda('legado')]);
  const storage = storageFake({ pdv_fila_offline: raw });
  const indexedDB = new IDBFactory();
  // Simula exclusao da chave indisponivel apos commit.
  storage.removeItem = () => { throw new Error('storage bloqueado'); };
  const [a, b] = stores({ storage, indexedDB });
  await Promise.all([a.ready(), b.ready()]);
  const [migrated] = await a.inspectAll();
  assert.equal(migrated.origemNaoConfirmada, true);
  assert.equal(migrated.ownerId, 'user-1');
  assert.equal(migrated.status, 'quarentena');
  assert.equal((await a.inspectAll()).length, 1);
  await a.resolveOrigin('legado', identity, { confirmed: true, reason: 'Conferencia manual' });
  const claim = await a.claimNext('worker', undefined, identity);
  await a.completeClaim(claim);
  const c = createOfflineStore({ indexedDB, storage });
  // Uma nova instancia compartilha a mesma fabrica fornecida pelos testes.
  await c.ready();
  assert.equal((await c.inspectAll()).length, 0);
  assert.equal(storage.getItem('pdv_fila_offline'), raw);
});

test('registro legado invalido permanece recuperavel e nao e descartado silenciosamente', async () => {
  const raw = JSON.stringify([venda('valida'), { semId: true }]);
  const storage = storageFake({ pdv_fila_offline: raw });
  const [a] = stores({ storage });
  const migration = await a.ready();
  assert.equal(migration.invalidos, 1);
  assert.equal(migration.legadoPreservado, true);
  assert.equal(storage.getItem('pdv_fila_offline'), raw);
  assert.equal((await a.inspectAll()).length, 1);
});

test('falha ao abrir armazenamento mantem legado e rejeita insercao', async () => {
  const raw = JSON.stringify([venda('legado')]);
  const storage = storageFake({ pdv_fila_offline: raw });
  const store = createOfflineStore({ storage, indexedDB: { open() { throw new DOMException('quota', 'QuotaExceededError'); } } });
  await assert.rejects(store.enqueue(venda('nova')), { name: 'QuotaExceededError' });
  assert.equal(storage.getItem('pdv_fila_offline'), raw);
});

test('falha de clonagem aborta insercao sem alterar vendas persistidas', async () => {
  const [a] = stores();
  await a.enqueue(venda('primeira'));
  await assert.rejects(a.enqueue({ ...venda('invalida'), payload: { impossivel: () => {} } }), { name: 'DataCloneError' });
  assert.deepEqual((await a.inspectAll()).map(item => item.idTemporario), ['primeira']);
});

test('quota durante migracao aborta todas as copias e preserva a chave legada', async t => {
  const raw = JSON.stringify([venda('primeira'), venda('quota')]);
  const storage = storageFake({ pdv_fila_offline: raw });
  const indexedDB = new IDBFactory();
  const original = IDBObjectStore.prototype.add;
  t.mock.method(IDBObjectStore.prototype, 'add', function (item) {
    if (item.idTemporario === 'quota') throw new DOMException('quota', 'QuotaExceededError');
    return original.call(this, item);
  });
  const store = createOfflineStore({ indexedDB, storage });
  await assert.rejects(store.ready(), { name: 'QuotaExceededError' });
  assert.equal(storage.getItem('pdv_fila_offline'), raw);
  // Consulte a base sem disparar outra migracao para provar rollback da primeira copia.
  const observer = createOfflineStore({ indexedDB, storage: storageFake() });
  assert.equal((await observer.inspectAll()).length, 0);
  t.mock.restoreAll();
  await store.ready();
  assert.equal((await store.inspectAll()).length, 2);
  assert.equal(storage.getItem('pdv_fila_offline'), null);
});

test('URL legada externa permanece na origem e nunca vira venda sincronizavel', async () => {
  const raw = JSON.stringify([{ ...venda('externa'), endpoint: 'https://outro.example/vendas' }]);
  const storage = storageFake({ pdv_fila_offline: raw });
  const [store] = stores({ storage });
  assert.equal((await store.ready()).invalidos, 1);
  assert.equal((await store.inspectAll()).length, 0);
  assert.equal(storage.getItem('pdv_fila_offline'), raw);
});

test('mesmo id com pedido diferente e rejeitado sem sobrescrever pedido anterior', async () => {
  const [store] = stores();
  const first = { ...venda('mesma-chave'), payload: { idTemporario: 'mesma-chave', itens: [{ produtoId: 'a', quantidade: 1 }] } };
  await store.enqueue(first);
  const changed = await store.enqueue({ ...first, payload: { ...first.payload, itens: [{ produtoId: 'a', quantidade: 2 }] } });
  assert.equal(changed.ok, false);
  assert.equal(changed.motivo, 'conflito');
  assert.equal((await store.inspectAll())[0].payload.itens[0].quantidade, 1);
  const reordered = await store.enqueue({ ...first, payload: { itens: [{ quantidade: 1, produtoId: 'a' }], idTemporario: 'mesma-chave' } });
  assert.equal(reordered.ok, true);
});

test('registro adulterado na base fica em quarentena sem bloquear a venda valida', async () => {
  const indexedDB = new IDBFactory();
  const [store] = stores({ indexedDB });
  await store.enqueue(venda('a-adulterada'));
  await store.enqueue(venda('b-valida'));
  await new Promise((resolve, reject) => {
    const request = indexedDB.open('pdv_offline');
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('fila', 'readwrite');
      tx.objectStore('fila').put({ ...venda('a-adulterada'), endpoint: 'https://outro.example/vendas' });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
    request.onerror = () => reject(request.error);
  });
  const claim = await store.claimNext('worker', undefined, identity);
  assert.equal(claim.venda.idTemporario, 'b-valida');
  const invalid = (await store.inspectAll()).find(item => item.idTemporario === 'a-adulterada');
  assert.equal(invalid.status, 'quarentena');
  assert.equal(invalid.endpoint, 'https://outro.example/vendas');
  await store.completeClaim(claim);
  assert.equal(await store.claimNext('worker', undefined, identity), null);
});

test('legado alterado nao ressuscita ids migrados e preserva conflitos de payload', async () => {
  const storage = storageFake({ pdv_fila_offline: JSON.stringify([venda('migrada'), { invalida: true }]) });
  const indexedDB = new IDBFactory();
  const a = createOfflineStore({ indexedDB, storage });
  await a.ready();
  await a.resolveOrigin('migrada', identity, { confirmed: true, reason: 'Conferencia manual' });
  await a.completeClaim(await a.claimNext('worker', undefined, identity));
  storage.setItem('pdv_fila_offline', JSON.stringify([venda('migrada'), venda('nova'), { invalida: true }]));
  const b = createOfflineStore({ indexedDB, storage });
  await b.ready();
  assert.deepEqual((await b.inspectAll()).map(item => item.idTemporario), ['nova']);
  const conflictRaw = JSON.stringify([venda('nova'), { ...venda('nova'), payload: { idTemporario: 'nova', valor: 99 } }]);
  storage.setItem('pdv_fila_offline', conflictRaw);
  const c = createOfflineStore({ indexedDB, storage });
  assert.equal((await c.ready()).invalidos, 1);
  assert.equal(storage.getItem('pdv_fila_offline'), conflictRaw);
});
