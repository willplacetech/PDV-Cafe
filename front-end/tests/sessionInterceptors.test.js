import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { attachSessionInterceptors } from '../src/services/sessionInterceptors.js';
import { setAccessSession, getAccessToken } from '../src/services/accessSession.js';
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const denied = config => Promise.reject(Object.assign(new Error('expired'), { config, response: { status: 401, config } }));
test('401 refreshes once and replays payment with the exact idempotency key', async () => {
  setAccessSession('pdv', { token: 'expired', user: { id: 'one', role: 'admin' } });
  let refreshes = 0;
  globalThis.fetch = async () => { refreshes++; return { ok: true, json: async () => ({ token: 'fresh', user: { id: 'one', role: 'admin' } }) }; };
  const attempts = [];
  const api = axios.create({ baseURL: 'https://example.test/api', adapter: config => {
    attempts.push({ token: config.headers.Authorization, key: config.headers['Idempotency-Key'] });
    return attempts.length === 1 ? denied(config) : Promise.resolve({ status: 200, data: { paid: true }, config });
  } });
  attachSessionInterceptors(api);
  await api.post('/pagamento', { total: 23 }, { headers: { 'Idempotency-Key': 'persisted-payment-key' } });
  assert.equal(refreshes, 1);
  assert.deepEqual(attempts, [{ token: 'Bearer expired', key: 'persisted-payment-key' }, { token: 'Bearer fresh', key: 'persisted-payment-key' }]);
});
test('401 from a previous login cannot clear or refresh a newer session', async () => {
  setAccessSession('pdv', { token: 'old', user: { id: 'old', role: 'admin' } });
  let calls = 0;
  globalThis.fetch = async () => { throw new Error('unexpected refresh'); };
  const api = axios.create({ baseURL: 'https://example.test/api', adapter: config => {
    calls++;
    if (calls === 1) { setAccessSession('pdv', { token: 'new', user: { id: 'new', role: 'admin' } }); return denied(config); }
    return Promise.resolve({ status: 200, data: {}, config });
  } });
  attachSessionInterceptors(api);
  await assert.rejects(api.get('/products'));
  assert.equal(calls, 1);
  assert.equal(getAccessToken(), 'new');
});
