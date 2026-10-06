const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../../server');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Comanda = require('../../models/Comanda');
const Order = require('../../models/Order');
const { carregarPagamentosDoPeriodo } = require('../../utils/pagamento');

let token, product, source, destination, order;
const receiptDate = new Date('2026-09-02T12:00:00Z');
const period = { inicio: new Date('2026-09-02T00:00:00Z'), fim: new Date('2026-09-03T00:00:00Z') };
const move = () => request(app).patch(`/api/orders/${order.id}/alterar-comanda`).set('Authorization', `Bearer ${token}`).send({ comandaId: destination.id });
const pay = (id, key) => request(app).patch(`/api/orders/${id}/pagar`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send({ tipo: 'pix', valorRecebido: 5 });
beforeEach(async () => {
  const user = await User.create({ username: 'transfer-admin', password: 'test-password', role: 'admin' });
  token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET);
  product = await Product.create({ codigo: 'TRANSFER', nome: 'Cafe', preco: 20, estoque: 9 });
  source = await Comanda.create({ atendente: user.username, status: 'fechada', valorTotal: 20, estoqueBaixado: true,
    itens: [{ produtoId: product.id, nome: product.nome, precoUnitario: 20, quantidade: 1 }],
    historicoPagamentos: [{ valor: 5, formaPagamento: 'dinheiro', data: receiptDate, usuario: user.username }, { valor: 15, formaPagamento: 'credito_loja', data: receiptDate }] });
  order = await Order.create({ numero: '000001', atendente: user.username, subtotal: 20, total: 20, status: 'parcial', comandaId: source.id, itens: source.itens });
  source.pedidoId = order.id;
  await source.save();
  destination = await Comanda.create({ atendente: user.username, numero: '0002' });
});
afterEach(() => jest.restoreAllMocks());

test('transfer preserves debt, historical receipts and period revenue, then accepts another receipt', async () => {
  const before = await carregarPagamentosDoPeriodo(period);
  expect(before.filter(p => p.tipo !== 'credito_loja').reduce((sum, p) => sum + p.valorRecebido, 0)).toBe(5);
  expect((await move()).status).toBe(200);
  const list = await request(app).get('/api/orders').set('Authorization', `Bearer ${token}`);
  const listed = list.body.find(p => p._id === order.id);
  expect(listed.status).toBe('parcial');
  expect(listed.pagamentos.filter(p => p.tipo !== 'credito_loja').reduce((sum, p) => sum + p.valorRecebido, 0)).toBe(5);
  const savedDestination = await Comanda.findById(destination.id);
  expect(savedDestination.valorTotal).toBe(20);
  expect(savedDestination.saldoDevedor).toBe(15);
  expect(savedDestination.historicoPagamentos.map(p => String(p._id))).toEqual(source.historicoPagamentos.map(p => String(p._id)));
  const after = await carregarPagamentosDoPeriodo(period);
  expect(after.map(p => [p.tipo, p.valorRecebido, p.dataPagamento.toISOString()])).toEqual(before.map(p => [p.tipo, p.valorRecebido, p.dataPagamento.toISOString()]));
  expect((await pay(order.id, 'after-transfer')).status).toBe(200);
  expect((await Comanda.findById(destination.id)).saldoDevedor).toBe(10);
  const receivables = await request(app).get('/api/orders?status=pendente,parcial').set('Authorization', `Bearer ${token}`);
  expect(receivables.body.find(p => p._id === order.id).comandaId).toBe(destination.id);
  expect(receivables.body.find(p => p._id === order.id).status).toBe('parcial');
  expect((await Product.findById(product.id)).estoque).toBe(9);
  const savedOrder = await Order.findById(order.id);
  expect(savedOrder.transferenciasComanda[0].origem.comandaId.toString()).toBe(source.id);
  expect(savedOrder.transferenciasComanda[0].origem.valorTotal).toBe(20);
  expect(savedOrder.transferenciasComanda[0].origem.historicoPagamentos).toHaveLength(2);
  expect(savedOrder.transferenciasComanda[0].origem.itens).toHaveLength(1);
  expect(savedDestination.status).toBe('fechada');
  expect((await move()).status).toBe(200);
  expect((await Order.findById(order.id)).transferenciasComanda).toHaveLength(1);
});

test.each(['items', 'payments', 'order', 'internal', 'delivery', 'customer'])('rejects incompatible destination %s without changing any document', async (kind) => {
  if (kind === 'items') { destination.itens = source.itens; destination.valorTotal = 20; }
  if (kind === 'payments') destination.historicoPagamentos = [{ valor: 3, formaPagamento: 'pix' }];
  if (kind === 'order') destination.pedidoId = new mongoose.Types.ObjectId();
  if (kind === 'internal') destination.utilizacaoInterna = true;
  if (kind === 'delivery') destination.entrega = { status: 'pendente' };
  if (kind === 'customer') destination.clienteId = new mongoose.Types.ObjectId();
  await destination.save();
  const before = JSON.stringify(await Promise.all([Order.findById(order.id).lean(), Comanda.findById(source.id).lean(), Comanda.findById(destination.id).lean()]));
  expect((await move()).status).toBe(409);
  const after = JSON.stringify(await Promise.all([Order.findById(order.id).lean(), Comanda.findById(source.id).lean(), Comanda.findById(destination.id).lean()]));
  expect(after).toBe(before);
});

test.each(['fiscal', 'delivery'])('rejects source with %s binding', async (kind) => {
  if (kind === 'fiscal') { order.nfce.status = 'autorizada'; await order.save(); }
  if (kind === 'delivery') { source.entrega = { status: 'processado' }; await source.save(); }
  expect((await move()).status).toBe(409);
  expect((await Order.findById(order.id)).comandaId.toString()).toBe(source.id);
});

test('a failure writing destination rolls back source and order together', async () => {
  const original = Comanda.prototype.save;
  jest.spyOn(Comanda.prototype, 'save').mockImplementation(function (...args) {
    if (this.id === destination.id) return Promise.reject(new Error('simulated write failure'));
    return original.apply(this, args);
  });
  expect((await move()).status).toBe(400);
  expect((await Order.findById(order.id)).comandaId.toString()).toBe(source.id);
  expect((await Comanda.findById(source.id)).historicoPagamentos).toHaveLength(2);
  expect((await Comanda.findById(destination.id)).pedidoId).toBeUndefined();
});

test('standalone partial order transfers receipts without duplicating period revenue', async () => {
  order.comandaId = undefined;
  order.pagamentos = [{ tipo: 'pix', valorRecebido: 5, dataPagamento: receiptDate }];
  await order.save();
  await Comanda.deleteOne({ _id: source.id });
  expect((await move()).status).toBe(200);
  expect((await Comanda.findById(destination.id)).saldoDevedor).toBe(15);
  expect((await Order.findById(order.id)).pagamentos).toHaveLength(0);
  expect((await carregarPagamentosDoPeriodo(period)).reduce((sum, p) => sum + p.valorRecebido, 0)).toBe(5);
  expect((await pay(order.id, 'standalone-after-transfer')).status).toBe(200);
});

test('concurrent transfers to the same empty destination commit a single audit record', async () => {
  const responses = await Promise.all([move(), move()]);
  expect(responses.map(r => r.status)).toEqual([200, 200]);
  expect((await Order.findById(order.id)).transferenciasComanda).toHaveLength(1);
  expect((await Comanda.findById(destination.id)).historicoPagamentos).toHaveLength(2);
  expect((await carregarPagamentosDoPeriodo(period)).filter(p => p.tipo !== 'credito_loja').reduce((sum, p) => sum + p.valorRecebido, 0)).toBe(5);
});

test('missing origin cannot silently discard financial history', async () => {
  await Comanda.deleteOne({ _id: source.id });
  expect((await move()).status).toBe(409);
  expect((await Order.findById(order.id)).comandaId.toString()).toBe(source.id);
});
