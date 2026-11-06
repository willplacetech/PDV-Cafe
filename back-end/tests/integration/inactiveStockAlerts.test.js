const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Tenant = require('../../models/Tenant');
const Product = require('../../models/Product');

let token;
let tenant;

beforeEach(async () => {
  tenant = await Tenant.create({ nome: 'Stock alerts', slug: 'stock-alerts', telefone: '11999999999', endereco: 'Rua de teste' });
  const admin = await User.create({ username: 'stock-alert-admin', password: 'test-password', role: 'admin', tenantId: tenant._id });
  token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role }, process.env.JWT_SECRET);
  await Product.create([
    {
      codigo: 'ACTIVE-LOW',
      nome: 'Insumo ativo baixo',
      tipo: 'insumo',
      preco: 0,
      precoCompra: 1,
      estoqueEmbalagens: 1,
      estoqueMinimoEmbalagens: 5,
      conteudoPorEmbalagem: 1,
      unidadeCompra: 'kg',
      tenantId: tenant._id,
    },
    {
      codigo: 'INACTIVE-LOW',
      nome: 'Insumo inativo baixo',
      tipo: 'insumo',
      preco: 0,
      precoCompra: 1,
      ativo: false,
      estoqueEmbalagens: 1,
      estoqueMinimoEmbalagens: 5,
      conteudoPorEmbalagem: 1,
      unidadeCompra: 'kg',
      tenantId: tenant._id,
    },
  ]);
});

test('production dashboard excludes inactive products from low-stock alerts', async () => {
  const response = await request(app)
    .get('/api/production/dashboard')
    .set('Authorization', `Bearer ${token}`);

  expect(response.status).toBe(200);
  expect(response.body.baixoEstoque.map((product) => product.nome)).toEqual(['Insumo ativo baixo']);
});
