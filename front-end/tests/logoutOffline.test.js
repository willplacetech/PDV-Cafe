import test from 'node:test';
import assert from 'node:assert/strict';
import { setAccessSession, getAccessToken, logoutAccessSession, waitForLogout, refreshAccessSession, runSessionLogin } from '../src/services/accessSession.js';

const setup = (online = true) => {
  const values = new Map([['pdv_fila_offline', '[{"id":"pending-sale","total":23}]'], ['pdv_catalogo', '[{"id":"coffee"}]'], ['other_app_session', 'other-token']]);
  globalThis.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: online } });
  setAccessSession('pdv', { token: 'old-token', user: { id: 'old-user', role: 'admin' } });
  return values;
};

test('offline logout removes only PDV identity and preserves pending sales and catalog', () => {
  const values = setup(false);
  let calls = 0;
  globalThis.fetch = () => { calls++; };
  assert.equal(logoutAccessSession('pdv', 'https://example.test/api/'), undefined);
  assert.equal(getAccessToken(), null);
  assert.equal(values.has('pdv_user'), false);
  assert.equal(values.get('pdv_fila_offline'), '[{"id":"pending-sale","total":23}]');
  assert.equal(values.get('pdv_catalogo'), '[{"id":"coffee"}]');
  assert.equal(values.get('other_app_session'), 'other-token');
  assert.equal(calls, 0);
});

for (const result of ['network', '401', 'success']) {
  test(`late logout ${result} preserves a newer local session`, async () => {
    setup();
    let finish, fail;
    const pending = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
    const requests = [];
    globalThis.fetch = (...args) => { requests.push(args); return pending; };
    logoutAccessSession('pdv', 'https://example.test/api/');
    await Promise.resolve(); await Promise.resolve();
    assert.equal(requests[0][0], 'https://example.test/api/auth/logout');
    assert.equal(requests[0][1].headers.Authorization, 'Bearer old-token');
    setAccessSession('pdv', { token: 'new-token', user: { id: 'new-user', role: 'admin' } });
    if (result === 'network') fail(new TypeError('Failed to fetch'));
    else finish({ status: result === '401' ? 401 : 204 });
    await waitForLogout('pdv');
    assert.equal(getAccessToken(), 'new-token');
  });
}

test('pending refresh completes before logout and subsequent login, preventing stale Set-Cookie overwrite', async () => {
  setup();
  let finishRefresh;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(url);
    if (url.endsWith('/refresh')) return new Promise(resolve => { finishRefresh = resolve; });
    return { ok: true, status: 204 };
  };
  const refresh = refreshAccessSession('pdv', 'https://example.test/api');
  logoutAccessSession('pdv', 'https://example.test/api');
  const login = runSessionLogin('pdv', async () => { requests.push('login'); return { data: { token: 'new-login', user: { id: 'new', role: 'admin' } } }; });
  assert.deepEqual(requests, ['https://example.test/api/auth/refresh']);
  finishRefresh({ ok: true, json: async () => ({ token: 'old-refresh', user: { id: 'old-user', role: 'admin' } }) });
  await refresh; await login;
  assert.deepEqual(requests, ['https://example.test/api/auth/refresh', 'https://example.test/api/auth/logout', 'login']);
  assert.equal(getAccessToken(), 'new-login');
});
