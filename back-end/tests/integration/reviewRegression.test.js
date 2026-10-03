const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Comanda = require('../../models/Comanda');
const Order = require('../../models/Order');
const StockMovement = require('../../models/StockMovement');
const RuntimeSettings = require('../../models/RuntimeSettings');

let token;
beforeEach(async () => {
  const user = await User.create({ username: 'review-admin', password: 'test-password', role: 'admin' });
  token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET);
});

const api = (method, path, body) => request(app)[method](path).set('Authorization', `Bearer ${token}`).send(body);
const bolo = async (extra = {}) => Product.create({
  codigo: 'peso', nome: 'Bolo', categoria: 'Doces', tipo: 'venda', preco: 40,
  estoque: 5, estoquePesoKg: 2.5, unidadeVenda: 'kg', pesoPorUnidade: 0.5,
  unidadePeso: 'kg', precoCompra: 5, ...extra,
});
const fatia = (produto, peso = 0.2) => ({ produtoId: produto.id, quantidade: 1, tipoVenda: 'peso', pesoVendidoKg: peso });

test('excluir fatia devolve somente peso e zera cobrança', async () => {
  const produto = await bolo();
  const created = await api('post', '/api/comandas', { itens: [fatia(produto)] });
  expect(created.status).toBe(201);
  expect(created.body.valorTotal).toBe(8);
  expect((await Product.findById(produto.id)).estoquePesoKg).toBeCloseTo(2.3);
  const removed = await api('delete', `/api/comandas/${created.body._id}/itens/${created.body.itens[0]._id}`);
  expect(removed.status).toBe(200);
  expect(removed.body.valorTotal).toBe(0);
  const after = await Product.findById(produto.id);
  expect(after.estoquePesoKg).toBeCloseTo(2.5);
  expect(after.estoque).toBe(5);
});

test('acrescentar e editar fatia conserva peças', async () => {
  const produto = await bolo();
  const created = await api('post', '/api/comandas', { itens: [] });
  const added = await api('post', `/api/comandas/${created.body._id}/itens`, fatia(produto));
  expect(added.status).toBe(200);
  const changed = await api('patch', `/api/comandas/${created.body._id}/itens/${added.body.itens[0]._id}`, { quantidade: 1, pesoVendidoKg: 0.3 });
  expect(changed.status).toBe(200);
  expect(changed.body.valorTotal).toBe(12);
  const after = await Product.findById(produto.id);
  expect(after.estoque).toBe(5);
  expect(after.estoquePesoKg).toBeCloseTo(2.2);
});

test('dividir comanda preserva estoque e recalcula origem e destino', async () => {
  const produto = await bolo();
  const created = await api('post', '/api/comandas', { itens: [fatia(produto), fatia(produto, 0.3)] });
  const movements = await StockMovement.countDocuments();
  const moved = await api('post', `/api/comandas/${created.body._id}/mover`, { itemIds: [created.body.itens[0]._id] });
  expect(moved.status).toBe(200);
  expect(moved.body.comandaOrigem.valorTotal).toBe(12);
  expect(moved.body.novaComanda.valorTotal).toBe(8);
  expect(moved.body.novaComanda.itens[0].movimentoEstoque.pesoKg).toBe(0.2);
  expect(await StockMovement.countDocuments()).toBe(movements);
});

test('idempotência evita segunda comanda e segunda baixa', async () => {
  const produto = await bolo();
  const send = () => request(app).post('/api/comandas').set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', 'review-intention-1').send({ itens: [fatia(produto)] });
  const first = await send();
  const second = await send();
  expect(first.status).toBe(201);
  expect(second.status).toBe(200);
  expect(second.body._id).toBe(first.body._id);
  expect(await Comanda.countDocuments()).toBe(1);
  expect((await Product.findById(produto.id)).estoquePesoKg).toBeCloseTo(2.3);
});

test('peso zerado não reaparece após vender todo o peso', async () => {
  const produto = await bolo();
  const first = await api('post', '/api/comandas', { itens: [fatia(produto, 2.5)] });
  expect(first.status).toBe(201);
  const second = await api('post', '/api/comandas', { itens: [fatia(produto)] });
  expect(second.status).toBe(400);
  expect(await Comanda.countDocuments()).toBe(1);
  expect((await Product.findById(produto.id)).estoquePesoKg).toBe(0);
});

test('cancelamento de pedido estorna peso e não cria peças', async () => {
  const produto = await bolo();
  const created = await api('post', '/api/orders', { itens: [fatia(produto)] });
  expect(created.status).toBe(201);
  const canceled = await api('patch', `/api/orders/${created.body._id}/cancelar`);
  expect(canceled.status).toBe(200);
  const after = await Product.findById(produto.id);
  expect(after.estoquePesoKg).toBeCloseTo(2.5);
  expect(after.estoque).toBe(5);
});

test('liberação de venda sem ingrediente não cria estoque ao cancelar', async () => {
  const insumo = await Product.create({ codigo: 'ingrediente', nome: 'Farinha', categoria: 'Insumos', tipo: 'insumo', preco: 0, precoCompra: 10, unidadeConteudo: 'kg', conteudoPorEmbalagem: 1, estoqueEmbalagens: 10, estoqueInsumos: 10 });
  const produto = await Product.create({ codigo: 'coz', nome: 'Preparado', categoria: 'Outros', tipo: 'venda', tipoProduto: 'coz', aFazer: true, preco: 10, permitirVendaSemInsumo: true, fichaTecnica: [{ produtoId: insumo.id, quantidade: 0.2, unidade: 'kg' }] });
  const created = await api('post', '/api/comandas', { itens: [{ produtoId: produto.id, quantidade: 1 }] });
  expect(created.status).toBe(201);
  const canceled = await api('patch', `/api/comandas/${created.body._id}/cancelar`);
  expect(canceled.status).toBe(200);
  expect((await Product.findById(insumo.id)).estoqueEmbalagens).toBe(10);
});

test('mesas são persistidas e lidas pela mesma API', async () => {
  const settings = { mesas: [{ id: 7, numero: 7, nome: 'Varanda', lugares: 2, ativa: true }], oferecerBalcao: true };
  expect((await api('put', '/api/mesas', settings)).status).toBe(200);
  expect((await api('get', '/api/mesas')).body).toEqual(settings);
  const duplicate = await api('put', '/api/mesas', { ...settings, mesas: [settings.mesas[0], settings.mesas[0]] });
  expect(duplicate.status).toBe(400);
  expect((await api('get', '/api/mesas')).body).toEqual(settings);
});

test('chave automática persiste e é diferente da chave pública antiga', async () => {
  const { initializeAuth, getJwtSecret } = require('../../utils/authConfig');
  const configured = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    await initializeAuth();
    const first = getJwtSecret();
    expect(first.length).toBeGreaterThanOrEqual(64);
    expect(first).not.toBe('desenvolvimento-altere-esta-chave');
    await initializeAuth();
    expect(getJwtSecret()).toBe(first);
    expect(await RuntimeSettings.countDocuments()).toBe(1);
  } finally { process.env.JWT_SECRET = configured; }
});

test('provisionamento não altera administrador existente nem cria senha padrão', async () => {
  const provisionarAdmin = require('../../utils/provisionarAdmin');
  const previous = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  try {
    await provisionarAdmin();
    expect(await User.countDocuments()).toBe(1);
    await User.deleteMany({});
    await expect(provisionarAdmin()).rejects.toThrow('ADMIN_PASSWORD');
    expect(await User.countDocuments()).toBe(0);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previous;
  }
});

test('ID fiscal inválido devolve 400 sem rejeição assíncrona', async () => {
  expect((await api('post', '/api/fiscal/orders/invalid/emitir')).status).toBe(400);
});

test('NFC-e pendente mantém estado indeterminado e bloqueia reenvio', async () => {
  const produto = await bolo();
  const order = await Order.create({ numero: '1', atendente: 'review-admin', itens: [{ produtoId: produto.id, precoUnitario: 10, quantidade: 1 }], subtotal: 10, total: 10 });
  const keys = ['NFCE_CNPJ', 'NFCE_IE', 'NFCE_RAZAO_SOCIAL', 'NFCE_ENDERECO_LOGRADOURO', 'NFCE_ENDERECO_NUMERO', 'NFCE_ENDERECO_BAIRRO', 'NFCE_ENDERECO_MUNICIPIO', 'NFCE_ENDERECO_UF', 'NFCE_ENDERECO_CEP', 'NFCE_CERTIFICATE_PFX_BASE64', 'NFCE_CERTIFICATE_PASSWORD', 'NFCE_PROVIDER_URL'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => { process.env[key] = 'test-placeholder'; });
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 202, json: async () => ({ status: 'processando' }) });
  try {
    const first = await api('post', `/api/fiscal/orders/${order.id}/emitir`);
    expect(first.status).toBe(409);
    expect(first.body.nfce.status).toBe('processando');
    expect((await api('post', `/api/fiscal/orders/${order.id}/emitir`)).status).toBe(409);
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally {
    fetch.mockRestore();
    keys.forEach((key) => { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; });
  }
});
