const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Customer = require('../../models/Customer');

const jwtSecret = process.env.JWT_SECRET || 'desenvolvimento-altere-esta-chave';
let token;

beforeEach(async () => {
  const admin = await User.create({ username: 'fidelidade-admin', password: 'senha-segura-123', role: 'admin' });
  token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role }, jwtSecret, { expiresIn: '1h' });
});

test('ajuste manual salva total histórico inteiro e não negativo', async () => {
  const customer = await Customer.create({ nome: 'Cliente fidelidade' });
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
