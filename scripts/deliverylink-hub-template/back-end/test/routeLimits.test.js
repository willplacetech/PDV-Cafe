const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const express = require('express');
const { createRouteLimit } = require('../src/routeLimits');

test('route limit rejects requests after the configured quota', async () => {
  const app = express();
  app.get('/limited', createRouteLimit({ windowMs: 60_000, limit: 1 }), (_req, res) => {
    res.sendStatus(204);
  });
  const server = app.listen(0);
  after(() => server.close());

  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/limited`;
  const first = await fetch(url);
  const second = await fetch(url);

  assert.equal(first.status, 204);
  assert.equal(second.status, 429);
});
