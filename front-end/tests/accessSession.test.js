import test from 'node:test';
import assert from 'node:assert/strict';
import { getAccessToken, setAccessSession, clearAccessSession, refreshAccessSession, readCachedProfile } from '../src/services/accessSession.js';
const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
test('tokens stay in memory and legacy credentials are removed; cached profile contains only identity', () => {
  values.set('pdv_token', 'legacy');
  setAccessSession('pdv', { token: 'memory', user: { id: '1', username: 'ana', role: 'admin', email: 'private@example.com', cpf: 'private' } });
  assert.equal(getAccessToken(), 'memory');
  assert.equal(values.get('pdv_token'), undefined);
  assert.deepEqual(readCachedProfile('pdv'), { id: '1', username: 'ana', role: 'admin' });
  assert.equal(JSON.stringify([...values.values()]).includes('memory'), false);
  clearAccessSession('pdv');
  assert.equal(getAccessToken(), null);
});
test('concurrent refresh uses one request and late completion cannot revive logged out session', async () => {
  let finish;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  setAccessSession('pdv', { token: 'old', user: { id: '1', role: 'admin' } });
  const first = refreshAccessSession('pdv', 'https://api.example/api');
  const second = refreshAccessSession('pdv', 'https://api.example/api');
  await Promise.resolve();
  assert.equal(calls, 1);
  clearAccessSession('pdv');
  finish({ ok: true, json: async () => ({ token: 'late', user: { id: '1', role: 'admin' } }) });
  await Promise.all([first, second]);
  assert.equal(getAccessToken(), null);
});
test('PDV, delivery admin and courier credentials never share memory', () => {
  setAccessSession('pdv', { token: 'pdv', user: { id: '1', role: 'admin' } });
  setAccessSession('delivery', { token: 'delivery', user: { id: '2', role: 'tenant_admin' } });
  setAccessSession('courier', { token: 'courier', user: { entregadorId: '3', role: 'entregador' } });
  clearAccessSession('delivery');
  assert.equal(getAccessToken('pdv'), 'pdv');
  assert.equal(getAccessToken('delivery'), null);
  assert.equal(getAccessToken('courier'), 'courier');
});
