import test from 'node:test';
import assert from 'node:assert/strict';
import viteConfig, { scriptCacheOptions } from '../vite.config.js';

const plugin = viteConfig.plugins.find(({ name }) => name === 'versioned-asset-urls');
const appVersion = JSON.parse(viteConfig.define['import.meta.env.VITE_APP_VERSION']);

test('adds the app version to JavaScript asset URLs in emitted chunks', () => {
  assert.ok(plugin, 'Vite must version JavaScript asset URLs');
  const code = 'import "./Dashboard.js"; const deps = ["/assets/usePagination.js"];';

  assert.equal(
    plugin.renderChunk(code).code,
    `import "./Dashboard.js?v=${appVersion}"; const deps = ["/assets/usePagination.js?v=${appVersion}"];`,
  );
});

test('adds the app version to emitted JavaScript URLs in the HTML shell', () => {
  assert.ok(plugin, 'Vite must version JavaScript asset URLs');
  const html = '<script src="/assets/index.js"></script><link href="/assets/vendor.js">';

  assert.equal(
    plugin.transformIndexHtml.handler(html),
    `<script src="/assets/index.js?v=${appVersion}"></script><link href="/assets/vendor.js?v=${appVersion}">`,
  );
});

test('caches runtime scripts only when the response is JavaScript', () => {
  assert.equal(scriptCacheOptions.cacheName, 'static-scripts-v2');
  assert.deepEqual(scriptCacheOptions.cacheableResponse, {
    statuses: [200],
    headers: { 'content-type': 'application/javascript' },
  });
});
