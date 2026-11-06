const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Tenant = require('../../models/Tenant');
const Customer = require('../../models/Customer');

const jwtSecret = process.env.JWT_SECRET || 'desenvolvimento-altere-esta-chave';
let token;
let tenant;

beforeEach(async () => {
  tenant = await Tenant.create({ nome: 'Fidelidade', slug: 'fidelidade', telefone: '11999999999', endereco: 'Rua de teste' });
  const admin = await User.create({ username: 'fidelidade-admin', password: 'senha-segura-123', role: 'admin', tenantId: tenant._id });
  token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role }, jwtSecret, { expiresIn: '1h' });
});

test('ajuste manual salva total histórico inteiro e não negativo', async () => {
  const customer = await Customer.create({ nome: 'Cliente fidelidade', tenantId: tenant._id });
  const atualizado = await request(app)
    .put(`/api/customers/${customer.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ cafesFidelidade: 20 });

  expect(atualizado.status).toBe(200);
  expect(atualizado.body.cafesFidelidade).toBe(20);

  for (const valor of [-1, 10.5, '20', null]) {
    const invalido = await request(app)
      .put(`/api/customers/${customer.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cafesFidelidade: valor });
    expect(invalido.status).toBe(400);
  }

  expect((await Customer.findById(customer.id)).cafesFidelidade).toBe(20);
});
