import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import { createOfflineStore, SYNC_LEASE_MS } from '../src/services/offlineStore.js';

const source = readFileSync(new URL('../src/hooks/useFilaOffline.js', import.meta.url), 'utf8')
  .replace(/^import .*?;\r?\n/gm, '').replace(/export default /g, '').replace(/export /g, '');
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const createRuntime = (store, post = async () => {}, extra = {}) => {
  const window = new EventTarget();
  const timers = new Map();
  let nextTimer = 0;
  window.setTimeout = window.setInterval = fn => { const id = ++nextTimer; timers.set(id, fn); return id; };
  window.clearTimeout = window.clearInterval = id => timers.delete(id);
  const effects = [];
  const states = [];
  const bindings = {
    offlineStore: store, SYNC_LEASE_MS, api: { post }, window,
    localStorage: (() => { const local = storage(); local.setItem('pdv_user', JSON.stringify({ id: 'user-1', tenantId: 'tenant-1', role: 'operador' })); return local; })(), navigator: { onLine: true },
    useEffect: fn => effects.push(fn),
    useState: initial => { const index = states.length; states.push(typeof initial === 'function' ? initial() : initial); return [states[index], value => { states[index] = value; }]; },
    ...extra,
  };
  const exported = new Function(...Object.keys(bindings), `${source}; return { useFilaOffline, createOfflineSynchronizer };`)(...Object.values(bindings));
  return { ...exported, bindings, effects, states, timers };
};
const sale = id => ({ ownerId: 'user-1', tenantId: 'tenant-1', idTemporario: id, endpoint: '/comandas', payload: { idTemporario: id }, status: 'pendente' });

test('workers em abas distintas enviam cada venda uma vez com a chave original', async () => {
  const indexedDB = new IDBFactory();
  const a = createOfflineStore({ indexedDB, storage: storage() });
  const b = createOfflineStore({ indexedDB, storage: storage() });
  await a.enqueue(sale('original'));
  const requests = [];
  const post = async (endpoint, payload, config) => requests.push({ endpoint, payload, config });
  const ra = createRuntime(a, post);
  const rb = createRuntime(b, post);
  const workerA = ra.createOfflineSynchronizer(a, post);
  const workerB = rb.createOfflineSynchronizer(b, post);
  await Promise.all([workerA.run(), workerB.run()]);
  workerA.stop(); workerB.stop();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].config.headers['Idempotency-Key'], 'original');
  assert.equal(requests[0].payload.idTemporario, 'original');
  assert.equal((await a.inspectAll()).length, 0);
});

test('insercao durante sincronizacao nao desaparece ao remover a venda enviada', async () => {
  const store = createOfflineStore({ indexedDB: new IDBFactory(), storage: storage() });
  await store.enqueue(sale('primeira'));
  let start;
  let finish;
  const started = new Promise(resolve => { start = resolve; });
  const pending = new Promise(resolve => { finish = resolve; });
  const sent = [];
  const post = async (_url, payload) => { sent.push(payload.idTemporario); if (sent.length === 1) { start(); await pending; } };
  const runtime = createRuntime(store, post);
  const worker = runtime.createOfflineSynchronizer(store, post);
  const running = worker.run();
  await started;
  await store.enqueue(sale('segunda'));
  finish();
  await running;
  worker.stop();
  assert.deepEqual(sent, ['primeira', 'segunda']);
  assert.equal((await store.inspectAll()).length, 0);
});

test('falha de rede libera lease e retry conserva Idempotency-Key', async () => {
  const store = createOfflineStore({ indexedDB: new IDBFactory(), storage: storage() });
  await store.enqueue(sale('retry'));
  const keys = [];
  const post = async (_url, _payload, config) => { keys.push(config.headers['Idempotency-Key']); if (keys.length === 1) throw new Error('sem rede'); };
  const runtime = createRuntime(store, post);
  const worker = runtime.createOfflineSynchronizer(store, post);
  await worker.run();
  assert.equal((await store.inspectAll()).length, 1);
  await worker.run();
  worker.stop();
  assert.deepEqual(keys, ['retry', 'retry']);
  assert.equal((await store.inspectAll()).length, 0);
});

test('hook retorna falha de armazenamento em vez de confirmar venda nao persistida', async () => {
  const store = createOfflineStore({ indexedDB: { open() { throw new DOMException('quota', 'QuotaExceededError'); } }, storage: storage() });
  const runtime = createRuntime(store, undefined, { navigator: { onLine: false } });
  const hook = runtime.useFilaOffline();
  const result = await hook.enfileirar('/comandas', { itens: [{ produtoId: 'a' }] }, 'nova');
  assert.deepEqual(result, { ok: false, motivo: 'armazenamento' });
  assert.equal(runtime.states[2], true);
});

test('hook insere concorrentes e informa origem do usuario sem atribuir legado', async () => {
  const store = createOfflineStore({ indexedDB: new IDBFactory(), storage: storage() });
  const localStorage = storage();
  localStorage.setItem('pdv_user', JSON.stringify({ _id: 'user-1', tenantId: 'tenant-1' }));
  const runtime = createRuntime(store, undefined, { localStorage, navigator: { onLine: false } });
  const hook = runtime.useFilaOffline();
  const results = await Promise.all([hook.enfileirar('/comandas', {}, 'a'), hook.enfileirar('/comandas', {}, 'b')]);
  assert.ok(results.every(result => result.ok));
  const saved = await store.inspectAll();
  assert.equal(saved.length, 2);
  assert.equal(saved[0].ownerId, 'user-1');
  assert.equal(saved[0].tenantId, 'tenant-1');
});

test('worker recusa endpoint externo mesmo quando o registro foi alterado localmente', async () => {
  let sends = 0;
  const claim = { owner: 'x', token: 'token', venda: { ...sale('externa'), endpoint: 'https://outro.example/vendas' } };
  const store = { claimNext: async () => claim, releaseClaim: async () => true, renewLease: async () => true };
  const runtime = createRuntime(store);
  const worker = runtime.createOfflineSynchronizer(store, async () => { sends++; });
  await worker.run();
  worker.stop();
  assert.equal(sends, 0);
});

test('worker nao envia venda de outro operador e preserva snapshot no envio', async () => {
  const store = createOfflineStore({ indexedDB: new IDBFactory(), storage: storage() });
  await store.enqueue({ ...sale('alheia'), ownerId: 'alice', tenantId: null });
  await store.enqueue({ ...sale('propria'), ownerId: 'bob', tenantId: null });
  const localStorage = storage();
  localStorage.setItem('pdv_user', JSON.stringify({ id: 'bob', role: 'operador' }));
  const sent = [];
  const runtime = createRuntime(store, undefined, { localStorage });
  const worker = runtime.createOfflineSynchronizer(store, async (_url, body) => sent.push(body));
  await worker.run();
  worker.stop();
  assert.deepEqual(sent.map(s => s.idTemporario), ['propria']);
  assert.deepEqual(sent[0].origemOffline, { ownerId: 'bob', tenantId: null });
  assert.equal((await store.list({ ownerId: 'alice', tenantId: null })).length, 1);
});

test('logout enquanto claim aguarda impede envio sob a nova sessao', async () => {
  const localStorage = storage();
  localStorage.setItem('pdv_user', JSON.stringify({ id: 'alice' }));
  let release;
  let acquired;
  const started = new Promise(resolve => { acquired = resolve; });
  const waiting = new Promise(resolve => { release = resolve; });
  const store = { claimNext: async () => { acquired(); await waiting; return { venda: { ...sale('alice'), ownerId: 'alice', tenantId: null } }; }, releaseClaim: async () => true };
  let sends = 0;
  const runtime = createRuntime(store, undefined, { localStorage });
  const worker = runtime.createOfflineSynchronizer(store, async () => { sends++; });
  const running = worker.run();
  await started;
  localStorage.setItem('pdv_user', JSON.stringify({ id: 'bob' }));
  release();
  await running;
  worker.stop();
  assert.equal(sends, 0);
});

test('409 de origem mantem a venda em quarentena sem repetir automaticamente', async () => {
  const store = createOfflineStore({ indexedDB: new IDBFactory(), storage: storage() });
  await store.enqueue(sale('conflito'));
  const runtime = createRuntime(store);
  let sends = 0;
  const worker = runtime.createOfflineSynchronizer(store, async () => {
    sends++;
    throw { response: { status: 409, data: { code: 'OFFLINE_ORIGIN_MISMATCH' } } };
  });
  await worker.run();
  await worker.run();
  worker.stop();
  const [saved] = await store.list({ ownerId: 'user-1', tenantId: 'tenant-1' });
  assert.equal(saved.status, 'quarentena');
  assert.equal(saved.motivoQuarentena, 'OFFLINE_ORIGIN_MISMATCH');
  assert.equal(sends, 1);
});
