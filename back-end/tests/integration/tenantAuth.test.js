const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Tenant = require('../../models/Tenant');
const auth = require('../../middleware/auth');

const app = express();
app.use(express.json());
app.all('/tenant', auth.exigirTenant, (req, res) => {
  res.json({ tenantId: req.tenantId, tenantNome: req.tenant.nome });
});

const emitirToken = user => jwt.sign(
  { id: user.id, username: user.username, role: user.role },
  process.env.JWT_SECRET,
  { algorithm: 'HS256' },
);

let tenant;
let user;
let semTenant;

beforeEach(async () => {
  tenant = await Tenant.create({
    nome: 'Café tenant auth',
    slug: 'cafe-tenant-auth',
    telefone: '11999999999',
    endereco: 'Rua de teste, 10',
  });
  user = await User.create({
    username: 'tenant-auth-user',
    password: 'senha-segura-123',
    role: 'admin',
    tenantId: tenant._id,
  });
  semTenant = await User.create({
    username: 'tenant-auth-sem-tenant',
    password: 'senha-segura-123',
    role: 'admin',
    tenantId: null,
  });
});

test('requisição protegida sem token retorna 403 e token inválido continua 401', async () => {
  expect((await request(app).get('/tenant')).status).toBe(403);
  expect((await request(app).get('/tenant').set('Authorization', 'Bearer invalido')).status).toBe(401);
});

test('recusa usuário sem tenant associado ou com tenant inativo', async () => {
  expect((await request(app).get('/tenant').set('Authorization', `Bearer ${emitirToken(semTenant)}`)).status).toBe(403);

  await Tenant.updateOne({ _id: tenant._id }, { $set: { ativo: false } });
  expect((await request(app).get('/tenant').set('Authorization', `Bearer ${emitirToken(user)}`)).status).toBe(403);
});

test('carrega o tenant ativo associado no servidor e ignora tenantId informado pelo cliente', async () => {
  const outroTenantId = '507f1f77bcf86cd799439011';
  const token = emitirToken(user);
  const response = await request(app)
    .post(`/tenant?tenantId=${outroTenantId}`)
    .set('Authorization', `Bearer ${token}`)
    .set('X-Tenant-Id', outroTenantId)
    .send({ tenantId: outroTenantId });

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ tenantId: String(tenant._id), tenantNome: tenant.nome });
});
