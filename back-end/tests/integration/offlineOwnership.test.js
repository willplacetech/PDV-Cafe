const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Tenant = require('../../models/Tenant');
const Comanda = require('../../models/Comanda');
const Product = require('../../models/Product');

let user;
let token;
let product;
let tenantA;
let tenantB;
beforeEach(async () => {
  tenantA = await Tenant.create({ nome: 'Tenant A', slug: 'offline-a', telefone: '11999999991', endereco: 'Rua A' });
  tenantB = await Tenant.create({ nome: 'Tenant B', slug: 'offline-b', telefone: '11999999992', endereco: 'Rua B' });
  user = await User.create({ username: 'offline-owner', password: 'test-password', role: 'operador', tenantId: tenantA._id });
  token = jwt.sign({ id: user.id, role: user.role, username: user.username }, process.env.JWT_SECRET);
  product = await Product.create({ codigo: 'ORIGIN', nome: 'Cafe', preco: 5, estoque: 10, tenantId: tenantA._id });
});
const send = origin => request(app).post('/api/comandas').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'offline-origin')
  .send({ idTemporario: 'offline-origin', itens: [{ produtoId: product.id, quantidade: 1 }], origemOffline: origin });

test('operador diferente recebe 409 antes de criar venda ou baixar estoque', async () => {
  const response = await send({ ownerId: 'outro-operador', tenantId: tenantA.id });
  expect(response.status).toBe(409);
  expect(response.body.code).toBe('OFFLINE_ORIGIN_MISMATCH');
  expect(await Comanda.countDocuments()).toBe(0);
  expect((await Product.findById(product.id)).estoque).toBe(10);
});

test('mesmo operador reassociado a outro tenant nao envia snapshot antigo', async () => {
  await User.updateOne({ _id: user.id }, { tenantId: tenantB._id });
  const response = await send({ ownerId: user.id, tenantId: tenantA.id });
  expect(response.status).toBe(409);
  expect(response.body.code).toBe('OFFLINE_ORIGIN_MISMATCH');
  expect(await Comanda.countDocuments()).toBe(0);
  expect((await Product.findById(product.id)).estoque).toBe(10);
});

test('origem coincidente cria uma venda e retry retorna o mesmo registro', async () => {
  const origin = { ownerId: user.id, tenantId: tenantA.id };
  const first = await send(origin);
  const replay = await send(origin);
  expect(first.status).toBe(201);
  expect(replay.body._id).toBe(first.body._id);
  expect(await Comanda.countDocuments()).toBe(1);
  expect((await Product.findById(product.id)).estoque).toBe(9);
});

test('snapshot sem owner valido recebe conflito estruturado', async () => {
  const response = await send({ tenantId: tenantA.id });
  expect(response.status).toBe(409);
  expect(response.body.code).toBe('OFFLINE_ORIGIN_MISMATCH');
});

test('reassociacao durante a transacao e detectada antes do commit com rollback', async () => {
  const original = Comanda.create.bind(Comanda);
  const spy = jest.spyOn(Comanda, 'create').mockImplementation(async (...args) => {
    const result = await original(...args);
    await User.updateOne({ _id: user.id }, { tenantId: tenantB._id });
    return result;
  });
  try {
    const response = await send({ ownerId: user.id, tenantId: tenantA.id });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('OFFLINE_ORIGIN_MISMATCH');
    expect(await Comanda.countDocuments()).toBe(0);
    expect((await Product.findById(product.id)).estoque).toBe(10);
  } finally { spy.mockRestore(); }
});
