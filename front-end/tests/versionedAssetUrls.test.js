import test from 'node:test';
import assert from 'node:assert/strict';
import viteConfig from '../vite.config.js';

const config = viteConfig({ mode: 'test', command: 'build' });
const plugin = config.plugins.find(({ name }) => name === 'versioned-asset-urls');
const appVersion = JSON.parse(config.define['import.meta.env.VITE_APP_VERSION']);

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
