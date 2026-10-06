const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Comanda = require('../../models/Comanda');
const Order = require('../../models/Order');
const { carregarPagamentosDoPeriodo } = require('../../utils/pagamento');

let token, product, comanda;
const receiptDate = new Date('2026-09-02T12:00:00Z');
const period = { inicio: new Date('2026-09-02T00:00:00Z'), fim: new Date('2026-09-03T00:00:00Z') };
const cancel = (kind, id) => request(app).patch(`/api/${kind}/${id}/cancelar`).set('Authorization', `Bearer ${token}`);
const makeOrder = async (extra = {}) => {
  const order = await Order.create({ numero: '000001', atendente: 'cancel-admin', subtotal: 20, total: 20, itens: comanda.itens, ...extra });
  if (extra.comandaId) { comanda.pedidoId = order.id; await comanda.save(); }
  return order;
};
beforeEach(async () => {
  const user = await User.create({ username: 'cancel-admin', password: 'test-password', role: 'admin' });
  token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET);
  product = await Product.create({ codigo: 'CANCEL', nome: 'Cafe', preco: 20, estoque: 9 });
  comanda = await Comanda.create({ atendente: user.username, valorTotal: 20, estoqueBaixado: true,
    itens: [{ produtoId: product.id, nome: product.nome, precoUnitario: 20, quantidade: 1, controleEstoque: 'produto' }] });
});

test('partial receipt blocks cancellation and preserves revenue, receipts and stock', async () => {
  const receipt = await request(app).patch(`/api/comandas/${comanda.id}/receber-parcial`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'cancel-receipt').send({ valorRecebido: 10, formaPagamento: 'pix' });
  expect(receipt.status).toBe(200);
  const before = await Comanda.findById(comanda.id).lean();
  const response = await cancel('comandas', comanda.id);
  expect(response.status).toBe(409);
  expect(response.body.msg).toMatch(/estorno|regulariza/i);
  expect(await Comanda.findById(comanda.id).lean()).toEqual(before);
  expect((await Product.findById(product.id)).estoque).toBe(9);
});

test.each(['standalone', 'linked'])('order cancellation blocks real receipt from %s canonical source', async kind => {
  const order = await makeOrder(kind === 'linked' ? { comandaId: comanda.id, status: 'parcial' } : { status: 'parcial', pagamentos: [{ tipo: 'pix', valorRecebido: 10, dataPagamento: receiptDate }] });
  if (kind === 'linked') { comanda.historicoPagamentos = [{ valor: 10, formaPagamento: 'pix', data: receiptDate }]; await comanda.save(); }
  const before = await Order.findById(order.id).lean();
  expect((await cancel('orders', order.id)).status).toBe(409);
  expect(await Order.findById(order.id).lean()).toEqual(before);
  expect((await Product.findById(product.id)).estoque).toBe(9);
});

test.each(['autorizada', 'processando'])('both cancellation paths block NFC-e %s before changing stock', async status => {
  const order = await makeOrder({ comandaId: comanda.id, nfce: { status } });
  expect((await cancel('comandas', comanda.id)).status).toBe(409);
  expect((await cancel('orders', order.id)).status).toBe(409);
  expect((await Product.findById(product.id)).estoque).toBe(9);
  expect((await Comanda.findById(comanda.id)).status).toBe('aberta');
});

test.each(['pendente', 'emitido'])('order cancellation blocks payment fiscal document %s', async status => {
  const order = await makeOrder({ pagamentos: [{ tipo: 'credito_loja', valorRecebido: 20, fiscal: { status } }] });
  expect((await cancel('orders', order.id)).status).toBe(409);
  expect((await Product.findById(product.id)).estoque).toBe(9);
});

test('legacy cancelled comanda receipts remain in their original period exactly once', async () => {
  comanda.status = 'cancelada';
  comanda.historicoPagamentos = [{ valor: 10, formaPagamento: 'pix', data: receiptDate }];
  await comanda.save();
  const order = await makeOrder({ comandaId: comanda.id, status: 'cancelado', pagamentos: [{ tipo: 'pix', valorRecebido: 10, dataPagamento: receiptDate }] });
  await Order.create({ numero: '000002', atendente: 'cancel-admin', subtotal: 20, total: 20, comandaId: comanda.id, pagamentos: order.pagamentos });
  const receipts = await carregarPagamentosDoPeriodo(period);
  expect(receipts).toHaveLength(1);
  expect(receipts[0].valorRecebido).toBe(10);
  expect(String(receipts[0].comandaId)).toBe(comanda.id);
});

test('store credit comanda without receipts cancels and restores stock only once', async () => {
  comanda.historicoPagamentos = [{ valor: 20, formaPagamento: 'credito_loja' }];
  await comanda.save();
  expect((await cancel('comandas', comanda.id)).status).toBe(200);
  expect((await cancel('comandas', comanda.id)).status).toBe(400);
  expect((await Product.findById(product.id)).estoque).toBe(10);
  expect((await Comanda.findById(comanda.id)).estoqueBaixado).toBe(false);
});

test('closing an untracked unpaid comanda records stock withdrawal and cancellation restores it once', async () => {
  comanda.estoqueBaixado = false;
  await comanda.save();
  const close = await request(app).post(`/api/comandas/${comanda.id}/fechar`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'close-unpaid').send({ metodoPagamento: 'credito_loja' });
  expect(close.status).toBe(200);
  expect((await Comanda.findById(comanda.id)).estoqueBaixado).toBe(true);
  expect((await Product.findById(product.id)).estoque).toBe(8);
  expect((await cancel('orders', close.body.pedido._id)).status).toBe(200);
  expect((await cancel('orders', close.body.pedido._id)).status).toBe(400);
  expect((await Product.findById(product.id)).estoque).toBe(9);
});
