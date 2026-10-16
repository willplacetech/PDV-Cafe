import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_GIT_HASH, fetchPublishedAppVersion, waitForServiceWorkerUpdate } from '../src/services/appVersion.js';

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
