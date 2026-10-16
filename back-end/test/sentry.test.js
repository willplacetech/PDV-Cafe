const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeEvent } = require('../instrument');

test('Sentry mantém só ID e stack sem dados do request ou mensagem original', () => {
  const result = sanitizeEvent({ release: 'sha', user: { id: '123', ip_address: 'privado', email: 'privado' }, request: { headers: { authorization: 'privado' }, data: 'privado' }, breadcrumbs: [{ message: 'privado' }], exception: { values: [{ type: 'Error', value: 'privado', stacktrace: { frames: [{ filename: 'server.js?senha=privado', lineno: 12, vars: { senha: 'privado' } }] } }] } });
  assert.equal(result.release, 'sha');
  assert.deepEqual(result.user, { id: '123' });
  assert.equal(result.exception.values[0].stacktrace.frames[0].lineno, 12);
  assert.doesNotMatch(JSON.stringify(result), /privado|email|ip_address|request|breadcrumbs/);
});
