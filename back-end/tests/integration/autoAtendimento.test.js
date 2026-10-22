const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const MesasSettings = require('../../models/MesasSettings');

let token;

beforeEach(async () => {
  const user = await User.create({ username: 'autoatendimento-admin', password: 'test-password', role: 'admin' });
  token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET);
});

const api = (method, path, body) => {
  let req = request(app)[method](path).set('Authorization', `Bearer ${token}`);
  if (body !== undefined) req = req.send(body);
  return req;
};

test('GET autenticado cria tokens aleatórios únicos e os preserva', async () => {
  const first = await api('get', '/api/mesas');

  expect(first.status).toBe(200);
  const tokens = first.body.mesas.map((mesa) => mesa.token);
  expect(tokens).toHaveLength(4);
  expect(tokens.every((value) => /^[A-Za-z0-9_-]{43}$/.test(value))).toBe(true);
  expect(new Set(tokens).size).toBe(tokens.length);
  expect((await MesasSettings.findById('principal')).mesas.map((mesa) => mesa.token)).toEqual(tokens);

  const second = await api('get', '/api/mesas');
  expect(second.body.mesas.map((mesa) => mesa.token)).toEqual(tokens);
});

test('PUT preserva tokens por id, ignora token forjado e cria token para mesa nova', async () => {
  const initial = await api('get', '/api/mesas');
  const originalToken = initial.body.mesas[0].token;
  const mesas = [
    { ...initial.body.mesas[0], nome: 'Mesa atualizada', token: 'token-forjado' },
    ...initial.body.mesas.slice(1).map((mesa) => ({ ...mesa, token: 'token-forjado' })),
    { id: 5, numero: 5, nome: 'Mesa nova', lugares: 2, ativa: true, token: 'token-forjado' },
  ];

  const updated = await api('put', '/api/mesas', { mesas, oferecerBalcao: true });

  expect(updated.status).toBe(200);
  expect(updated.body.mesas[0].token).toBe(originalToken);
  expect(updated.body.mesas.every((mesa) => mesa.token !== 'token-forjado')).toBe(true);
  expect(new Set(updated.body.mesas.map((mesa) => mesa.token)).size).toBe(updated.body.mesas.length);
  expect(updated.body.mesas.find((mesa) => mesa.id === 5).token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect((await MesasSettings.findById('principal')).mesas.map((mesa) => mesa.token)).toEqual(updated.body.mesas.map((mesa) => mesa.token));
});

test('GET de mesas continua exigindo autenticação', async () => {
  const response = await request(app).get('/api/mesas');

  expect(response.status).toBe(401);
});
