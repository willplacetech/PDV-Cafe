const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Tenant = require('../../models/Tenant');

let token;
let tenant;
beforeEach(async () => {
  tenant = await Tenant.create({ nome: 'Products', slug: 'products-compatibility', telefone: '11999999998', endereco: 'Rua de teste' });
  const admin = await User.create({ username: 'product-admin', password: 'isolated-password-123', role: 'admin', tenantId: tenant._id });
  token = jwt.sign({ id: admin.id, role: admin.role }, process.env.JWT_SECRET);
  await Product.create([
    { codigo: '1', nome: 'Café', tipo: 'venda', preco: 10, custo: 0, custoCalculado: null, fonteCalculo: 'indisponivel', tenantId: tenant._id },
    { codigo: '2', nome: 'Pão', tipo: 'venda', preco: 8, custo: 4, custoCalculado: 4, fonteCalculo: 'insumo', reajusteRecomendado: true, tenantId: tenant._id },
    { codigo: '3', nome: 'Farinha', tipo: 'insumo', preco: 0, precoCompra: 5, tenantId: tenant._id },
  ]);
});
const get = path => request(app).get(path).set('Authorization', `Bearer ${token}`);

test('dashboard product lists retain the array contract while catalog supports pagination', async () => {
  const list = await get('/api/products');
  expect(list.status).toBe(200);
  expect(Array.isArray(list.body)).toBe(true);
  expect(list.body).toHaveLength(3);
  const page = await get('/api/products?pagina=1&limite=1&tipo=venda');
  expect(page.status).toBe(200);
  expect(page.body.dados).toHaveLength(1);
  expect(page.body).toMatchObject({ total: 2, pagina: 1, limite: 1, totalPaginas: 2 });
});

test('dashboard cost endpoints return products rather than the SPA fallback', async () => {
  const missingCost = await get('/api/products/sem-custo');
  expect(missingCost.status).toBe(200);
  expect(missingCost.body).toEqual([]);
  const recommended = await get('/api/products/reajuste-recomendado');
  expect(recommended.status).toBe(200);
  expect(recommended.body.map(product => product.codigo)).toContain('2');
});

test('paginated search keeps bounded pages and rejects structured filter values', async () => {
  const page = await get('/api/products?pagina=-1&limite=1001&busca=Caf');
  expect(page.status).toBe(200);
  expect(page.body).toMatchObject({ total: 1, pagina: 1, limite: 100, totalPaginas: 1 });
  expect(page.body.dados[0].codigo).toBe('1');
  expect((await get('/api/products?busca[nome]=Caf')).status).toBe(400);
});

test('PDV product endpoints and authentication remain available', async () => {
  const pdv = await get('/api/products/pdv');
  expect(pdv.status).toBe(200);
  expect(pdv.body.map(product => product.codigo).sort()).toEqual(['1', '2']);
  const ranking = await get('/api/products/mais-vendidos');
  expect(ranking.status).toBe(200);
  expect(ranking.body).toEqual([]);
  expect((await request(app).get('/api/products/sem-custo')).status).toBe(403);
});

});

test('PDV compatibility returns the percentage price for each product in a discount group', async () => {
  await Product.create([
    {
      codigo: 'grupo-20',
      nome: 'Doce de 20',
      tipo: 'venda',
      preco: 20,
      grupoDesconto: { nome: 'Doces', quantidadeMinima: 2, percentualDesconto: 10, ativo: true },
      tenantId: tenant._id,
    },
    {
      codigo: 'grupo-40',
      nome: 'Doce de 40',
      tipo: 'venda',
      preco: 40,
      grupoDesconto: { nome: 'Doces', quantidadeMinima: 2, percentualDesconto: 10, ativo: true },
      tenantId: tenant._id,
    },
  ]);

  const response = await get('/api/products/pdv');

  expect(response.status).toBe(200);
  expect(response.body.find(product => product.codigo === 'grupo-20').grupoDesconto.precoPromocional).toBe(18);
  expect(response.body.find(product => product.codigo === 'grupo-40').grupoDesconto.precoPromocional).toBe(36);
});

test('unknown API paths return JSON 404 without trying to open the frontend index', async () => {
  const sendFile = jest.spyOn(require('express').response, 'sendFile');
  try {
    const response = await get('/api/rota-inexistente');
    expect(response.status).toBe(404);
    expect(response.body.msg).not.toMatch(/ENOENT|index\.html|dist/);
    expect(sendFile).not.toHaveBeenCalled();
  } finally {
    sendFile.mockRestore();
  }
});
