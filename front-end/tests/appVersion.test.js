import test from 'node:test';
import assert from 'node:assert/strict';
import * as appVersionService from '../src/services/appVersion.js';

const {
  APP_GIT_HASH,
  fetchPublishedAppVersion,
  installPreloadErrorRecovery,
  waitForServiceWorkerUpdate,
} = appVersionService;

test('uses dev as the local hash fallback when Vite does not inject a git hash', () => {
  assert.equal(APP_GIT_HASH, 'dev');
});

test('fetches the published version without browser or service-worker caching', async () => {
  let request;
  const version = await fetchPublishedAppVersion(async (...args) => {
    request = args;
    return { ok: true, json: async () => ({ version: 'commit-123' }) };
  });

  assert.equal(version, 'commit-123');
  assert.match(request[0], /^\/version\.json\?check=\d+$/);
  assert.equal(request[1].cache, 'no-store');
  assert.equal(request[1].headers['Cache-Control'], 'no-cache');
  assert.equal(request[1].signal instanceof AbortSignal, true);
});

test('reports unsuccessful version responses explicitly', async () => {
  await assert.rejects(
    fetchPublishedAppVersion(async () => ({ ok: false, status: 503 })),
    /HTTP 503/,
  );
  await assert.rejects(
    fetchPublishedAppVersion(async () => ({ ok: true, json: async () => ({}) })),
    /resposta de versão.*inválida/i,
  );
});

test('waits for the updated service worker to control the page', async () => {
  let listener;
  const previousController = {};
  const serviceWorker = {
    controller: previousController,
    addEventListener: (_event, callback) => { listener = callback; },
    removeEventListener: () => {},
  };
  const registration = {
    update: async () => {
      serviceWorker.controller = {};
      listener();
    },
  };

  await waitForServiceWorkerUpdate(registration, serviceWorker, 100);
});

test('fails explicitly when the service worker does not take control', async () => {
  const serviceWorker = {
    controller: {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  await assert.rejects(
    waitForServiceWorkerUpdate({ update: async () => {} }, serviceWorker, 1),
    /não assumiu o controle/i,
  );
});

test('clears stale app caches and restores the current route after a failed Vite preload', async () => {
  const values = new Map();
  const deletedCaches = [];
  let unregisterCount = 0;
  let replacedUrl;
  const browser = new EventTarget();
  browser.sessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  browser.navigator = {
    serviceWorker: {
      getRegistrations: async () => [{ unregister: async () => { unregisterCount += 1; } }],
    },
  };
  browser.caches = {
    keys: async () => ['workbox-precache', 'app-shell'],
    delete: async (key) => { deletedCaches.push(key); },
  };
  browser.location = {
    href: 'https://pdv.example/login?from=expired',
    replace: (url) => { replacedUrl = url; },
    reload: () => {},
  };

  const removeOldVersionHandler = installPreloadErrorRecovery(browser, 'commit-old');
  const firstError = new Event('vite:preloadError', { cancelable: true });
  browser.dispatchEvent(firstError);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(firstError.defaultPrevented, true);
  assert.equal(unregisterCount, 1);
  assert.deepEqual(deletedCaches, ['workbox-precache', 'app-shell']);
  const restorePreloadRecoveryPath = appVersionService.restorePreloadRecoveryPath;
  assert.equal(typeof restorePreloadRecoveryPath, 'function');
  assert.equal(new URL(replacedUrl).pathname, '/__pdv-recovery/commit-old/index.html');
  const recoveredBrowser = {
    location: { href: replacedUrl },
    history: { replaceState: (_state, _title, url) => { recoveredBrowser.location.href = new URL(url, replacedUrl).href; } },
  };
  assert.equal(restorePreloadRecoveryPath(recoveredBrowser), true);
  assert.equal(new URL(recoveredBrowser.location.href).pathname, '/login');
  assert.equal(new URL(recoveredBrowser.location.href).search, '?from=expired');

  const repeatedError = new Event('vite:preloadError', { cancelable: true });
  browser.dispatchEvent(repeatedError);

  assert.equal(repeatedError.defaultPrevented, false);
  assert.equal(unregisterCount, 1);
  removeOldVersionHandler();

  installPreloadErrorRecovery(browser, 'commit-new');
  const newVersionError = new Event('vite:preloadError', { cancelable: true });
  browser.dispatchEvent(newVersionError);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(newVersionError.defaultPrevented, true);
  assert.equal(unregisterCount, 2);
});

test('does not restore invalid or external recovery paths', () => {
  const restorePreloadRecoveryPath = appVersionService.restorePreloadRecoveryPath;
  assert.equal(typeof restorePreloadRecoveryPath, 'function');
  const errors = [];
  const originalConsoleError = console.error;
  console.error = (...args) => errors.push(args);
  const browser = {
    location: { href: 'https://pdv.example/__pdv-recovery/commit/index.html?__pdv_path=https%3A%2F%2Fevil.example' },
    history: { replaceState: () => assert.fail('invalid recovery paths must not be restored') },
  };

  try {
    assert.equal(restorePreloadRecoveryPath(browser), false);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(errors.length, 1);
});

test('does not reload when session storage cannot guard against a reload loop', () => {
  let reloadCount = 0;
  const browser = new EventTarget();
  browser.sessionStorage = {
    getItem: () => { throw new Error('Storage unavailable'); },
    setItem: () => {},
  };
  browser.location = { reload: () => { reloadCount += 1; } };

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    installPreloadErrorRecovery(browser, 'commit-123');
    const event = new Event('vite:preloadError', { cancelable: true });
    browser.dispatchEvent(event);

    assert.equal(event.defaultPrevented, false);
    assert.equal(reloadCount, 0);
  } finally {
    console.error = originalConsoleError;
  }
});
