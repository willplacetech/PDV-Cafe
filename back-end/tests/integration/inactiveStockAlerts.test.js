const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Product = require('../../models/Product');

let token;

beforeEach(async () => {
  const admin = await User.create({ username: 'stock-alert-admin', password: 'test-password', role: 'admin' });
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
