const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Configuracoes = require('../../models/Configuracoes');
const { invalidate } = require('../../utils/queryCache');
const { invalidarCacheConfiguracaoGerente } = require('../../middleware/exigirAutorizacao');

let token;
beforeEach(async () => {
  invalidate('cardapio:');
  invalidate('produtos:');
  const admin = await User.create({ username: 'product-admin', password: 'isolated-password-123', role: 'admin' });
  token = jwt.sign({ id: admin.id, role: admin.role }, process.env.JWT_SECRET);
  await Product.create([
    { codigo: '1', nome: 'Café', tipo: 'venda', preco: 10, custo: 0, custoCalculado: null, fonteCalculo: 'indisponivel' },
    { codigo: '2', nome: 'Pão', tipo: 'venda', preco: 8, custo: 4, custoCalculado: 4, fonteCalculo: 'insumo', reajusteRecomendado: true },
    { codigo: '3', nome: 'Farinha', tipo: 'insumo', preco: 0, precoCompra: 5 },
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
  expect((await request(app).get('/api/products/sem-custo')).status).toBe(401);
});

test('PDV reuses active products and invalidates the cache after editing a product', async () => {
  const findSpy = jest.spyOn(Product, 'find');
  try {
    const first = await get('/api/products/pdv');
    const second = await get('/api/products/pdv');
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(findSpy).toHaveBeenCalledTimes(1);

    await Configuracoes.create({ _id: 'principal', exigirAutorizacaoGerente: false });
    invalidarCacheConfiguracaoGerente();
    const updated = await request(app)
      .put(`/api/products/${first.body[0]._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Produto atualizado', preco: 12 });
    expect(updated.status).toBe(200);
    expect(updated.body.preco).toBe(12);
    expect((await Product.findById(first.body[0]._id)).preco).toBe(12);

    const afterUpdate = await get('/api/products/pdv');
    expect(findSpy).toHaveBeenCalledTimes(2);
    expect(afterUpdate.body.find(product => product._id === first.body[0]._id)).toMatchObject({
      nome: 'Produto atualizado',
      preco: 12,
    });
  } finally {
    findSpy.mockRestore();
  }
});

test('applying a product price persists it and invalidates the PDV cache', async () => {
  await Configuracoes.create({ _id: 'principal', exigirAutorizacaoGerente: false });
  invalidarCacheConfiguracaoGerente();

  const product = await Product.findOne({ codigo: '1' });
  const initialPdv = await get('/api/products/pdv');
  expect(initialPdv.body.find(item => item._id === product.id).preco).toBe(10);

  const updated = await request(app)
    .put(`/api/products/${product.id}/aplicar-preco`)
    .set('Authorization', `Bearer ${token}`)
    .send({ preco: 12.5 });

  expect(updated.status).toBe(200);
  expect(updated.body.preco).toBe(12.5);
  expect((await Product.findById(product.id)).preco).toBe(12.5);
  const refreshedPdv = await get('/api/products/pdv');
  expect(refreshedPdv.body.find(item => item._id === product.id).preco).toBe(12.5);
});

test('product API persists group percentage on create and update', async () => {
  await Configuracoes.create({ _id: 'principal', exigirAutorizacaoGerente: false });
  invalidarCacheConfiguracaoGerente();

  const created = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({
      codigo: 'grupo-percentual',
      nome: 'Doce percentual',
      tipo: 'venda',
      categoria: 'Doces',
      preco: 20,
      grupoDesconto: { nome: 'Doces', quantidadeMinima: 2, percentualDesconto: 10, ativo: true },
    });

  expect(created.status).toBe(201);
  expect(created.body.grupoDesconto).toMatchObject({ nome: 'Doces', quantidadeMinima: 2, percentualDesconto: 10, ativo: true });

  const updated = await request(app)
    .put(`/api/products/${created.body._id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ grupoDesconto: { nome: 'Doces', quantidadeMinima: 3, percentualDesconto: 15, ativo: true } });

  expect(updated.status).toBe(200);
  expect(updated.body.grupoDesconto).toMatchObject({ quantidadeMinima: 3, percentualDesconto: 15 });

  const invalid = await request(app)
    .put(`/api/products/${created.body._id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ grupoDesconto: { nome: 'Doces', quantidadeMinima: 3, percentualDesconto: 101, ativo: true } });
  expect(invalid.status).toBe(400);
});

test('inventory list includes active stock items with normalized balances and no cost fields', async () => {
  await Product.create([
    { codigo: '10', nome: 'Bolo', tipo: 'venda', categoria: 'Doces', unidadeVenda: 'un', estoque: 6, preco: 12 },
    { codigo: '11', nome: 'Suco por peso', tipo: 'venda', categoria: 'Bebidas geladas', unidadeVenda: 'kg', pesoPorUnidade: 0.25, estoque: 8, estoquePesoKg: 1.75, estoquePesoNormalizado: true, preco: 5 },
    { codigo: '12', nome: 'Prato na hora', tipo: 'venda', tipoProduto: 'coz', aFazer: true, categoria: 'Pratos na Hora', estoque: 99, preco: 20 },
    { codigo: '13', nome: 'Bolo inativo', tipo: 'venda', ativo: false, estoque: 50, preco: 15 },
    { codigo: '14', nome: 'Farinha a granel', tipo: 'insumo', categoria: 'Insumos', unidade: 'kg', unidadeConteudo: 'kg', conteudoPorEmbalagem: 1, estoqueEmbalagens: 3, estoqueConteudoAberto: 0.5, preco: 0, precoCompra: 8 },
  ]);

  const response = await get('/api/products/inventory-list');

  expect(response.status).toBe(200);
  expect(response.body.map(item => item.codigo)).toEqual(['14', '3', '11', '10', '1', '2']);
  expect(response.body.find(item => item.codigo === '11')).toMatchObject({ unidade: 'kg', estoque: 1.75 });
  expect(response.body.find(item => item.codigo === '14')).toMatchObject({ unidade: 'kg', estoque: 3.5, tipo: 'insumo' });
  expect(response.body.some(item => ['12', '13'].includes(item.codigo))).toBe(false);
  expect(response.body.every(item => Object.keys(item).sort().join(',') === 'categoria,codigo,estoque,nome,tipo,unidade')).toBe(true);
});

test('inventory list requires an authenticated stock-management role', async () => {
  const response = await request(app).get('/api/products/inventory-list');

  expect(response.status).toBe(401);
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
