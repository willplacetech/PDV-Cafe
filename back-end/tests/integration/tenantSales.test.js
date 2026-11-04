const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const server = require('../../server');
const Tenant = require('../../models/Tenant');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const auth = require('../../middleware/auth');

const app = express();
app.use(express.json());
app.get('/products', auth.exigirTenant, async (req, res, next) => {
  try {
    res.json(await Product.find({}).select('nome tenantId').lean());
  } catch (error) {
    next(error);
  }
});
app.post('/products', auth.exigirTenant, async (req, res, next) => {
  try {
    const product = await Product.create({
      codigo: req.body.codigo,
      nome: req.body.nome,
      categoria: 'Outros',
      preco: 5,
    });
    res.status(201).json({ id: String(product._id), tenantId: String(product.tenantId) });
  } catch (error) {
    next(error);
  }
});
app.patch('/products/:id', auth.exigirTenant, async (req, res, next) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: { nome: req.body.nome } },
      { new: true },
    ).lean();
    if (!product) return res.sendStatus(404);
    return res.json(product);
  } catch (error) {
    return next(error);
  }
});
app.get('/products/aggregate', auth.exigirTenant, async (req, res, next) => {
  try {
    res.json(await Product.aggregate([{ $group: { _id: null, names: { $push: '$nome' } } }]));
  } catch (error) {
    next(error);
  }
});

let tenantA;
let tokenA;

beforeEach(async () => {
  tenantA = await Tenant.create({
    nome: 'Tenant A',
    slug: 'tenant-a-sales',
    telefone: '11999999991',
    endereco: 'Rua A',
  });
  const tenantB = await Tenant.create({
    nome: 'Tenant B',
    slug: 'tenant-b-sales',
    telefone: '11999999992',
    endereco: 'Rua B',
  });
  const userA = await User.create({
    username: 'sales-tenant-a',
    password: 'senha-segura-123',
    role: 'admin',
    tenantId: tenantA._id,
  });
  tokenA = jwt.sign(
    { id: String(userA._id), role: 'admin' },
    process.env.JWT_SECRET,
    { algorithm: 'HS256' },
  );
  await Product.create([
    { codigo: 'SALE-A', nome: 'Produto A', categoria: 'Outros', preco: 5, tenantId: tenantA._id },
    { codigo: 'SALE-A', nome: 'Produto B', categoria: 'Outros', preco: 5, tenantId: tenantB._id },
  ]);
});

test('lista somente produtos do tenant autenticado', async () => {
  const response = await request(app).get('/products').set('Authorization', `Bearer ${tokenA}`);

  expect(response.status).toBe(200);
  expect(response.body.map(product => product.nome)).toEqual(['Produto A']);
});

test('atribui tenant autenticado aos novos produtos sem aceitar tenant do cliente', async () => {
  const response = await request(app)
    .post('/products')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ codigo: 'SALE-NEW', nome: 'Novo produto' });

  expect(response.status).toBe(201);
  expect(response.body.tenantId).toBe(String(tenantA._id));
});

test('não altera por ID um produto de outro tenant', async () => {
  const tenantB = await Tenant.findOne({ slug: 'tenant-b-sales' });
  const productB = await Product.findOne({ codigo: 'SALE-A', tenantId: tenantB._id });
  const response = await request(app)
    .patch(`/products/${productB.id}`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ nome: 'Alterado por A' });

  expect(response.status).toBe(404);
  expect((await Product.findById(productB.id)).nome).toBe('Produto B');
});

test('agregações também são limitadas ao tenant autenticado', async () => {
  const response = await request(app)
    .get('/products/aggregate')
    .set('Authorization', `Bearer ${tokenA}`);

  expect(response.status).toBe(200);
  expect(response.body[0].names).toEqual(['Produto A']);
});

test('rotas reais do PDV isolam produtos e clientes entre tenants', async () => {
  const tenantB = await Tenant.findOne({ slug: 'tenant-b-sales' });
  const userB = await User.create({
    username: 'sales-tenant-b',
    password: 'senha-segura-123',
    role: 'admin',
    tenantId: tenantB._id,
  });
  const tokenB = jwt.sign(
    { id: String(userB._id), role: 'admin' },
    process.env.JWT_SECRET,
    { algorithm: 'HS256' },
  );
  const customerA = await Customer.create({
    nome: 'Cliente A',
    telefone: '11999990001',
    tenantId: tenantA._id,
  });
  const customerB = await Customer.create({
    nome: 'Cliente B',
    telefone: '11999990001',
    tenantId: tenantB._id,
  });

  const [responseA, responseB, customersA, customersB, customerFromB] = await Promise.all([
    request(server).get('/api/products').set('Authorization', `Bearer ${tokenA}`),
    request(server).get('/api/products').set('Authorization', `Bearer ${tokenB}`),
    request(server).get('/api/customers').set('Authorization', `Bearer ${tokenA}`),
    request(server).get('/api/customers').set('Authorization', `Bearer ${tokenB}`),
    request(server).get(`/api/customers/${customerB.id}`).set('Authorization', `Bearer ${tokenA}`),
  ]);

  expect(responseA.status).toBe(200);
  expect(responseA.body.map(product => product.nome)).toEqual(['Produto A']);
  expect(responseB.status).toBe(200);
  expect(responseB.body.map(product => product.nome)).toEqual(['Produto B']);
  expect(customersA.status).toBe(200);
  expect(customersA.body.map(customer => customer.nome)).toContain(customerA.nome);
  expect(customersA.body.map(customer => customer.nome)).not.toContain(customerB.nome);
  expect(customersB.status).toBe(200);
  expect(customersB.body.map(customer => customer.nome)).toContain(customerB.nome);
  expect(customersB.body.map(customer => customer.nome)).not.toContain(customerA.nome);
  expect(customerFromB.status).toBe(404);
});

test('rota real do PDV não revela produto de outro tenant por ID', async () => {
  const productB = await Product.findOne({ nome: 'Produto B' });
  const response = await request(server)
    .get(`/api/products/${productB.id}`)
    .set('Authorization', `Bearer ${tokenA}`);

  expect(response.status).toBe(404);
  expect((await Product.findById(productB.id)).nome).toBe('Produto B');
});
