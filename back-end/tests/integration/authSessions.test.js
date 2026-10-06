const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Tenant = require('../../models/Tenant');
const Entregador = require('../../models/Entregador');
const cookie = response => response.headers['set-cookie'].find(value => value.startsWith('pdv_refresh=')).split(';')[0];
const refresh = value => request(app).post('/api/auth/refresh').set('Origin', 'http://localhost:5173').set('X-CSRF-Protection', '1').set('Cookie', value);
let login;
beforeEach(async () => {
  await User.create({ username: 'session-test', password: 'session-password-123', role: 'admin' });
  login = await request(app).post('/api/auth/login').set('Origin', 'http://localhost:5173').send({ username: 'session-test', password: 'session-password-123' });
});
test('login issues short access token and HttpOnly refresh cookie restricted to auth', () => {
  const claims = jwt.verify(login.body.token, process.env.JWT_SECRET);
  expect(claims.exp - claims.iat).toBe(900);
  expect(login.headers['set-cookie'].join(';')).toMatch(/pdv_refresh=.*HttpOnly/);
  expect(login.headers['set-cookie'].join(';')).toContain('Path=/api/auth');
});
test('refresh requires explicit origin and custom CSRF header', async () => {
  expect((await request(app).post('/api/auth/refresh').set('Cookie', cookie(login))).status).toBe(403);
  expect((await refresh(cookie(login)).set('Origin', 'https://evil.example')).status).toBe(403);
  expect((await refresh(cookie(login))).status).toBe(200);
});
test('concurrent rotations converge and revoked session cannot refresh', async () => {
  const original = cookie(login);
  const results = await Promise.all([refresh(original), refresh(original)]);
  expect(results.map(result => result.status)).toEqual([200, 200]);
  expect(cookie(results[0])).toBe(cookie(results[1]));
  expect(cookie(results[0])).not.toBe(original);
  const logout = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${results[0].body.token}`);
  expect(logout.status).toBe(204);
  expect((await refresh(original)).status).toBe(401);
  expect((await refresh(cookie(results[0]))).status).toBe(401);
});
test('user version change revokes refresh and access without storing plaintext refresh', async () => {
  const AuthSession = require('../../models/AuthSession');
  const stored = await AuthSession.findOne().lean();
  expect(JSON.stringify(stored)).not.toContain(cookie(login).split('=')[1]);
  await User.updateOne({ username: 'session-test' }, { $inc: { tokenVersion: 1 } });
  expect((await refresh(cookie(login))).status).toBe(401);
});
test('wrong refresh secret for a known session id cannot revoke its valid credential', async () => {
  const original = cookie(login);
  const wrong = original.slice(0, original.indexOf('.') + 1) + 'A'.repeat(64);
  expect((await refresh(wrong)).status).toBe(401);
  expect((await refresh(original)).status).toBe(200);
});
test('cookie logout requires CSRF protection and prevents refresh and access', async () => {
  const original = cookie(login);
  expect((await request(app).post('/api/auth/logout').set('Cookie', original)).status).toBe(403);
  const response = await request(app).post('/api/auth/logout').set('Cookie', original).set('Origin', 'http://localhost:5173').set('X-CSRF-Protection', '1');
  expect(response.status).toBe(204);
  expect((await refresh(original)).status).toBe(401);
  expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`)).status).toBe(401);
});
test('login without Origin stays Bearer compatible and hostile login Origin cannot set cookies', async () => {
  const credentials = { username: 'session-test', password: 'session-password-123' };
  const bearer = await request(app).post('/api/auth/login').send(credentials);
  expect(bearer.status).toBe(200);
  expect(bearer.body.token).toBeTruthy();
  expect(bearer.headers['set-cookie']).toBeUndefined();
  expect((await request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send(credentials)).status).toBe(403);
});
test('Delivery admin and courier refresh cookies and logout routes remain separate', async () => {
  const tenant = await Tenant.create({ nome: 'Sessions', slug: 'session-cookie-tenant', telefone: '11999999999', endereco: 'Rua Um' });
  const owner = await User.create({ username: 'delivery-session', email: 'session@example.test', password: 'session-password-123', role: 'tenant_admin', tenantId: tenant.id });
  await Entregador.create({ nome: 'Courier', telefone: '11988888888', senhaAcesso: 'session-password-123', tenantId: tenant.id });
  const admin = await request(app).post('/api/delivery/login').set('Origin', 'http://localhost:5173').send({ email: owner.email, senha: 'session-password-123' });
  const courier = await request(app).post('/api/entregador/login').set('Origin', 'http://localhost:5173').send({ telefone: '11988888888', senha: 'session-password-123' });
  for (const [response, path, name, resource] of [[admin, 'delivery', 'delivery_refresh', '/tenant/configuracao'], [courier, 'entregador', 'courier_refresh', '/entregador/pedidos']]) {
    const refreshCookie = response.headers['set-cookie'].find(value => value.startsWith(name + '=')).split(';')[0];
    expect(response.headers['set-cookie'].join(';')).toContain(`Path=/api/${path}`);
    const renewed = await request(app).post(`/api/${path}/refresh`).set('Origin', 'http://localhost:5173').set('X-CSRF-Protection', '1').set('Cookie', refreshCookie);
    expect(renewed.status).toBe(200);
    expect((await request(app).post(`/api/${path}/logout`).set('Authorization', `Bearer ${renewed.body.token}`)).status).toBe(204);
    expect((await request(app).get(`/api${resource}`).set('Authorization', `Bearer ${renewed.body.token}`)).status).toBe(401);
    expect((await request(app).post(`/api/${path}/refresh`).set('Origin', 'http://localhost:5173').set('X-CSRF-Protection', '1').set('Cookie', refreshCookie)).status).toBe(401);
  }
});
