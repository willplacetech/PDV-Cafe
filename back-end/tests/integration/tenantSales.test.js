const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const Tenant = require('../../models/Tenant');
const User = require('../../models/User');
const Product = require('../../models/Product');
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
    { codigo: 'SALE-B', nome: 'Produto B', categoria: 'Outros', preco: 5, tenantId: tenantB._id },
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
  const productB = await Product.findOne({ codigo: 'SALE-B', tenantId: tenantB._id });
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
