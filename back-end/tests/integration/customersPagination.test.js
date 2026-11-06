const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Tenant = require('../../models/Tenant');
const Customer = require('../../models/Customer');

let token;
let tenant;

beforeEach(async () => {
  tenant = await Tenant.create({ nome: 'Customer page', slug: 'customer-page', telefone: '11999999999', endereco: 'Rua de teste' });
  const admin = await User.create({
    username: 'customer-page-admin',
    password: 'isolated-password-123',
    role: 'admin',
    tenantId: tenant._id,
  });
  token = jwt.sign({ id: admin.id, role: admin.role }, process.env.JWT_SECRET);
  await Customer.create([
    { nome: 'Ana', telefone: '1111111111', cpf: '12345678901', tenantId: tenant._id },
    { nome: 'Beatriz', telefone: '2222222222', tenantId: tenant._id },
    { nome: 'Carla', telefone: '3333333333', tenantId: tenant._id },
  ]);
});

const get = path => request(app).get(path).set('Authorization', `Bearer ${token}`);

test('customer pagination preserves legacy array responses and paginates filtered records', async () => {
  const legacy = await get('/api/customers');
  expect(legacy.status).toBe(200);
  expect(Array.isArray(legacy.body)).toBe(true);
  expect(legacy.body).toHaveLength(4);

  const page = await get('/api/customers?search=Ana%7CBeatriz%7CCarla&pagina=2&limite=1');
  expect(page.status).toBe(200);
  expect(page.body).toMatchObject({ total: 3, pagina: 2, limite: 1, totalPaginas: 3 });
  expect(page.body.dados).toHaveLength(1);
  expect(page.body.dados[0].nome).toBe('Beatriz');
});

test('customer pagination rejects page sizes above the safe maximum', async () => {
  const response = await get('/api/customers?pagina=1&limite=101');
  expect(response.status).toBe(400);
});

test('customer CPF uniqueness is enforced by the server across pages', async () => {
  const response = await request(app)
    .post('/api/customers')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome: 'Ana duplicada', telefone: '99999999999', cpf: '123.456.789-01' });

  expect(response.status).toBe(409);
  expect(response.body.msg).toBe('CPF já cadastrado');
});
