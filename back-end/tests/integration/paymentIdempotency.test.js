const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Comanda = require('../../models/Comanda');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const FechamentoCaixa = require('../../models/FechamentoCaixa');

let token;
let comanda;
beforeEach(async () => {
  const user = await User.create({ username: 'payment-admin', password: 'test-password', role: 'admin' });
  token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET);
  const product = await Product.create({ codigo: 'PAY', nome: 'Cafe', preco: 20, estoque: 10 });
  comanda = await Comanda.create({ atendente: user.username, valorTotal: 20, estoqueBaixado: true, itens: [{ produtoId: product.id, nome: product.nome, precoUnitario: 20, quantidade: 1 }] });
});
afterEach(() => jest.restoreAllMocks());
const partial = (key, body = { valorRecebido: 5, formaPagamento: 'dinheiro' }) => {
  const req = request(app).patch(`/api/comandas/${comanda.id}/receber-parcial`).set('Authorization', `Bearer ${token}`);
  return (key === undefined ? req : req.set('Idempotency-Key', key)).send(body);
};
const payOrder = (id, path, key, body = {}) => request(app).patch(`/api/orders/${id}/${path}`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(body);

test('response lost: replay of partial returns exact previous result and records only five', async () => {
  const first = await partial('partial-1');
  const replay = await partial('partial-1');
  expect(first.status).toBe(200);
  expect(replay.status).toBe(200);
  expect(replay.body).toEqual(first.body);
  const saved = await Comanda.findById(comanda.id);
  expect(saved.valorPago).toBe(5);
  expect(saved.historicoPagamentos).toHaveLength(1);
});
test('concurrent same operation commits one payment', async () => {
  const responses = await Promise.all([partial('concurrent'), partial('concurrent')]);
  expect(responses.map(r => r.status)).toEqual([200, 200]);
  expect(responses[0].body).toEqual(responses[1].body);
  expect((await Comanda.findById(comanda.id)).valorPago).toBe(5);
});
test('concurrent different operations serialize balance and preserve both legitimate equal receipts', async () => {
  const responses = await Promise.all([partial('different-a'), partial('different-b')]);
  expect(responses.map(r => r.status)).toEqual([200, 200]);
  const saved = await Comanda.findById(comanda.id);
  expect(saved.valorPago).toBe(10);
  expect(saved.historicoPagamentos).toHaveLength(2);
});
test('same key different payload conflicts; different keys permit legitimate equal payments', async () => {
  expect((await partial('first')).status).toBe(200);
  expect((await partial('first', { valorRecebido: 6, formaPagamento: 'dinheiro' })).status).toBe(409);
  expect((await partial('second')).status).toBe(200);
  expect((await Comanda.findById(comanda.id)).valorPago).toBe(10);
});
test('requires valid operation key and accepts operacaoId body', async () => {
  expect((await partial()).status).toBe(400);
  expect((await partial('not valid')).status).toBe(400);
  const body = { valorRecebido: 5, operacaoId: 'body-operation' };
  expect((await partial(undefined, body)).status).toBe(200);
  expect((await partial(undefined, body)).status).toBe(200);
  expect((await Comanda.findById(comanda.id)).valorPago).toBe(5);
});
test.each(['pagar', 'quitar'])('order %s replays final payment', async (path) => {
  const order = await Order.create({ numero: '0001', subtotal: 20, total: 20, atendente: 'payment-admin', itens: comanda.itens });
  const body = path === 'pagar' ? { tipo: 'pix', valorRecebido: 20 } : {};
  const first = await payOrder(order.id, path, 'order-operation', body);
  const replay = await payOrder(order.id, path, 'order-operation', body);
  expect(first.status).toBe(200);
  expect(replay.status).toBe(200);
  expect(replay.body).toEqual(first.body);
  expect((await Order.findById(order.id)).pagamentos).toHaveLength(1);
});
test('linked order receipt replays single source of truth in comanda', async () => {
  const order = await Order.create({ numero: '0001', subtotal: 20, total: 20, atendente: 'payment-admin', itens: comanda.itens, comandaId: comanda.id });
  const body = { tipo: 'pix', valorRecebido: 5 };
  const first = await payOrder(order.id, 'pagar', 'linked', body);
  const replay = await payOrder(order.id, 'pagar', 'linked', body);
  expect(first.status).toBe(200);
  expect(replay.body).toEqual(first.body);
  expect((await Comanda.findById(comanda.id)).valorPago).toBe(5);
  expect((await Order.findById(order.id)).pagamentos).toHaveLength(0);
});
test('customer settlement is atomic and replays original batch even after a new debt', async () => {
  const customerId = new (require('mongoose').Types.ObjectId)();
  for (let i = 1; i <= 2; i++) await Order.create({ numero: `000${i}`, subtotal: 20, total: 20, clienteId: customerId, atendente: 'payment-admin', itens: comanda.itens });
  const settle = () => request(app).patch(`/api/orders/cliente/${customerId}/quitar`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'batch').send({ tipo: 'pix' });
  const first = await settle();
  await Order.create({ numero: '0003', subtotal: 20, total: 20, clienteId: customerId, atendente: 'payment-admin', itens: comanda.itens });
  const replay = await settle();
  expect(first.status).toBe(200);
  expect(first.body.pedidos).toHaveLength(2);
  expect(replay.body).toEqual(first.body);
  expect(await Order.countDocuments({ status: 'pendente' })).toBe(1);
});
test('closing comanda replays order without another payment or order', async () => {
  const close = () => request(app).post(`/api/comandas/${comanda.id}/fechar`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'close').send({ metodoPagamento: 'dinheiro' });
  const first = await close();
  const replay = await close();
  expect(first.status).toBe(200);
  expect(replay.status).toBe(200);
  expect(replay.body).toEqual(first.body);
  expect(await Order.countDocuments({})).toBe(1);
  expect((await Comanda.findById(comanda.id)).historicoPagamentos).toHaveLength(1);
});
test('failed customer batch rolls back earlier receipts and the operation ledger', async () => {
  const customerId = new (require('mongoose').Types.ObjectId)();
  const valid = await Order.create({ numero: '0001', subtotal: 20, total: 20, clienteId: customerId, atendente: 'payment-admin', itens: comanda.itens });
  await Order.create({ numero: '0002', subtotal: 20, total: 20, clienteId: customerId, atendente: 'payment-admin', itens: comanda.itens, comandaId: new (require('mongoose').Types.ObjectId)() });
  const response = await request(app).patch(`/api/orders/cliente/${customerId}/quitar`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'failed-batch').send({ tipo: 'pix' });
  expect(response.status).toBe(400);
  expect((await Order.findById(valid.id)).pagamentos).toHaveLength(0);
  expect(await require('../../models/OperacaoFinanceira').countDocuments({ operacaoId: 'failed-batch' })).toBe(0);
});

const openCash = async () => {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const response = await request(app).post('/api/caixa/abrir').set('Authorization', `Bearer ${token}`).send({ data: day });
  expect(response.status).toBe(201);
  return response.body._id;
};
const pauseCashRead = () => {
  let release, ready;
  const blocked = new Promise(resolve => { release = resolve; });
  const reached = new Promise(resolve => { ready = resolve; });
  const original = FechamentoCaixa.findById;
  let remaining = 1;
  jest.spyOn(FechamentoCaixa, 'findById').mockImplementation(function (...args) {
    const query = original.apply(this, args);
    if (remaining-- > 0) {
      const exec = query.exec;
      query.exec = async function (...params) {
        const result = await exec.apply(this, params);
        ready();
        await blocked;
        return result;
      };
    }
    return query;
  });
  return { release, reached };
};
test('receipt winning race invalidates stale cash closing snapshot', async () => {
  const id = await openCash();
  const pause = pauseCashRead();
  const close = request(app).post(`/api/caixa/${id}/fechar`).set('Authorization', `Bearer ${token}`).send({ valorContado: 0 }).then(r => r);
  await pause.reached;
  let receipt;
  try { receipt = await partial('race-receipt'); } finally { pause.release(); }
  expect(receipt.status).toBe(200);
  expect((await close).status).toBe(409);
  expect((await FechamentoCaixa.findById(id)).status).toBe('aberto');
});
test('cash closing winning race aborts receipt and ledger together', async () => {
  const id = await openCash();
  const pause = pauseCashRead();
  const receipt = partial('race-closing').then(r => r);
  await pause.reached;
  let close;
  try { close = await request(app).post(`/api/caixa/${id}/fechar`).set('Authorization', `Bearer ${token}`).send({ valorContado: 0 }); } finally { pause.release(); }
  expect(close.status).toBe(200);
  expect((await receipt).status).toBe(409);
  expect((await Comanda.findById(comanda.id)).valorPago).toBe(0);
  expect(await require('../../models/OperacaoFinanceira').countDocuments({ operacaoId: 'race-closing' })).toBe(0);
});
test('receipt after completed closing never changes its frozen snapshot', async () => {
  const id = await openCash();
  const close = await request(app).post(`/api/caixa/${id}/fechar`).set('Authorization', `Bearer ${token}`).send({ valorContado: 0 });
  expect(close.status).toBe(200);
  expect((await partial('after-closing')).status).toBe(200);
  expect((await FechamentoCaixa.findById(id).lean()).__v).toBe(close.body.__v);
  expect((await FechamentoCaixa.findById(id).lean()).sistema.entradasDinheiro).toBe(0);
});
