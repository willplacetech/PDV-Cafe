const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Comanda = require('../../models/Comanda');
const Product = require('../../models/Product');
const tenantA = '507f1f77bcf86cd799439011';
const tenantB = '507f1f77bcf86cd799439012';

let user;
let token;
let product;
beforeEach(async () => {
  user = await User.create({ username: 'offline-owner', password: 'test-password', role: 'operador', tenantId: tenantA });
  token = jwt.sign({ id: user.id, role: user.role, username: user.username }, process.env.JWT_SECRET);
  product = await Product.create({ codigo: 'ORIGIN', nome: 'Cafe', preco: 5, estoque: 10 });
});
const send = origin => request(app).post('/api/comandas').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'offline-origin')
  .send({ idTemporario: 'offline-origin', itens: [{ produtoId: product.id, quantidade: 1 }], origemOffline: origin });

test('operador diferente recebe 409 antes de criar venda ou baixar estoque', async () => {
  const response = await send({ ownerId: 'outro-operador', tenantId: tenantA });
  expect(response.status).toBe(409);
  expect(response.body.code).toBe('OFFLINE_ORIGIN_MISMATCH');
  expect(await Comanda.countDocuments()).toBe(0);
  expect((await Product.findById(product.id)).estoque).toBe(10);
});

test('mesmo operador reassociado a outro tenant nao envia snapshot antigo', async () => {
  await User.updateOne({ _id: user.id }, { tenantId: tenantB });
  const response = await send({ ownerId: user.id, tenantId: tenantA });
  expect(response.status).toBe(409);
  expect(response.body.code).toBe('OFFLINE_ORIGIN_MISMATCH');
  expect(await Comanda.countDocuments()).toBe(0);
  expect((await Product.findById(product.id)).estoque).toBe(10);
});

test('origem coincidente cria uma venda e retry retorna o mesmo registro', async () => {
  const origin = { ownerId: user.id, tenantId: tenantA };
  const first = await send(origin);
  const replay = await send(origin);
  expect(first.status).toBe(201);
  expect(replay.body._id).toBe(first.body._id);
  expect(await Comanda.countDocuments()).toBe(1);
  expect((await Product.findById(product.id)).estoque).toBe(9);
});

test('snapshot sem owner valido recebe conflito estruturado', async () => {
  const response = await send({ tenantId: tenantA });
  expect(response.status).toBe(409);
  expect(response.body.code).toBe('OFFLINE_ORIGIN_MISMATCH');
});

test('reassociacao durante a transacao e detectada antes do commit com rollback', async () => {
  const original = Comanda.create.bind(Comanda);
  const spy = jest.spyOn(Comanda, 'create').mockImplementation(async (...args) => {
    const result = await original(...args);
    await User.updateOne({ _id: user.id }, { tenantId: tenantB });
    return result;
  });
  try {
    const response = await send({ ownerId: user.id, tenantId: tenantA });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('OFFLINE_ORIGIN_MISMATCH');
    expect(await Comanda.countDocuments()).toBe(0);
    expect((await Product.findById(product.id)).estoque).toBe(10);
  } finally { spy.mockRestore(); }
});
