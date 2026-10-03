const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');

test('configuração de mesas exige autenticação', async () => {
  const res = await request(app).get('/api/mesas');
  assert.equal(res.status, 401);
});

test('origens Render de terceiros são recusadas', async () => {
  const res = await request(app).get('/api').set('Origin', 'https://third-party-example.onrender.com');
  assert.equal(res.status, 403);
});

test('origem configurada continua funcionando', async () => {
  const res = await request(app).get('/api').set('Origin', 'https://sabordabraco.onrender.com');
  assert.equal(res.status, 200);
  assert.equal(res.headers['access-control-allow-origin'], 'https://sabordabraco.onrender.com');
});
