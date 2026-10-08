const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const Comanda = require('../../models/Comanda');
const PaymentSettings = require('../../models/PaymentSettings');
const { calcularOutrosMeios } = require('../../utils/caixa');

let token;
let operatorToken;
let product;
const api = (method, path, body, authToken = token) => request(app)[method](`/api${path}`).set('Authorization', `Bearer ${authToken}`).send(body);
const createMethod = async () => {
  const response = await api('post', '/payment-settings', { nome: 'Vale Refeição', taxaPercentual: 3 });
  expect(response.status).toBe(201);
  return response.body.formaPagamento;
};
const createCommand = async () => {
  const response = await api('post', '/comandas', { itens: [{ produtoId: product.id, quantidade: 1 }] });
  expect(response.status).toBe(201);
  return response.body;
};
beforeEach(async () => {
  const admin = await User.create({ username: 'payment-admin', password: 'test-password', role: 'admin' });
  const operator = await User.create({ username: 'payment-operator', password: 'test-password', role: 'operador' });
  token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role }, process.env.JWT_SECRET);
  operatorToken = jwt.sign({ id: operator.id, username: operator.username, role: operator.role }, process.env.JWT_SECRET);
  product = await Product.create({ codigo: 'payment-test', nome: 'Produto teste', preco: 100, estoque: 20 });
});

test('somente admin cadastra; operadores consultam e nomes duplicados/taxas inválidas são recusados', async () => {
  expect((await request(app).get('/api/payment-settings')).status).toBe(401);
  expect((await api('post', '/payment-settings', { nome: 'Vale', taxaPercentual: 3 }, operatorToken)).status).toBe(403);
  const method = await createMethod();
  expect(method).toMatchObject({ label: 'Vale Refeição', taxaPercentual: 3, personalizada: true });
  const catalog = await api('get', '/payment-settings', undefined, operatorToken);
  expect(catalog.status).toBe(200);
  expect(catalog.body.formasPagamento).toEqual(expect.arrayContaining([expect.objectContaining({ value: method.value, label: 'Vale Refeição' })]));
  expect((await api('post', '/payment-settings', { nome: ' vále REFEICAO ', taxaPercentual: 2 })).status).toBe(409);
  expect((await api('post', '/payment-settings', { nome: 'PIX', taxaPercentual: 2 })).status).toBe(409);
  for (const invalid of [-1, 101, 'inválida', null]) {
    expect((await api('post', '/payment-settings', { nome: 'Outra forma', taxaPercentual: invalid })).status).toBe(400);
  }
  expect((await PaymentSettings.findOne()).formasPersonalizadas).toHaveLength(1);
});

test('fechamento personalizado persiste taxa, nome, baixa única e dashboard líquido', async () => {
  const method = await createMethod();
  const command = await createCommand();
  const body = { metodoPagamento: method.value, operacaoId: 'custom-close' };
  const response = await api('post', `/comandas/${command._id}/fechar`, body);
  expect(response.status).toBe(200);
  expect(response.body.pedido.status).toBe('pago');
  expect(response.body.pedido.pagamentos[0]).toMatchObject({ tipo: method.value, rotuloPagamento: 'Vale Refeição', valorRecebido: 100, taxaPercentual: 3, taxaValor: 3, valorLiquido: 97 });
  expect((await api('post', `/comandas/${command._id}/fechar`, body)).status).toBe(200);
  expect(await Order.countDocuments()).toBe(1);
  expect((await Product.findById(product.id)).estoque).toBe(19);
  const dashboard = (await api('get', '/dashboard')).body;
  expect(dashboard.relatorioMes.pagamentos).toEqual(expect.arrayContaining([expect.objectContaining({ tipo: method.value, bruto: 100, taxa: 3, total: 97 })]));
  expect(dashboard.formasPagamento).toEqual(expect.arrayContaining([expect.objectContaining({ value: method.value, label: 'Vale Refeição' })]));
  const cash = calcularOutrosMeios(response.body.comanda.historicoPagamentos);
  expect(cash.total).toBe(100);
  expect(cash.totalLiquido).toBe(97);
});

test('recebe comanda parcialmente e quita pedido vinculado com taxa sem contar duas vezes', async () => {
  const method = await createMethod();
  const command = await createCommand();
  const received = await api('patch', `/comandas/${command._id}/receber-parcial`, { formaPagamento: method.value, valorRecebido: 40, operacaoId: 'custom-partial' });
  expect(received.status).toBe(200);
  expect(received.body.historicoPagamentos[0]).toMatchObject({ taxaValor: 1.2, valorLiquido: 38.8 });
  const closed = await api('post', `/comandas/${command._id}/fechar`, { metodoPagamento: 'credito_loja', operacaoId: 'custom-credit' });
  expect(closed.status).toBe(200);
  const paid = await api('patch', `/orders/${closed.body.pedido._id}/quitar`, { tipo: method.value, operacaoId: 'custom-linked' });
  expect(paid.status).toBe(200);
  expect(paid.body.status).toBe('pago');
  const stored = await Comanda.findById(command._id);
  expect(stored.historicoPagamentos.filter(p => p.formaPagamento === method.value)).toHaveLength(2);
  expect(stored.valorPago).toBe(100);
  const dashboard = (await api('get', '/dashboard')).body;
  expect(dashboard.relatorioMes.pagamentos.find(p => p.tipo === method.value)).toMatchObject({ bruto: 100, taxa: 3, total: 97 });
});

test('taxa alterada reprocessa somente o mês solicitado, tanto pedido quanto comanda', async () => {
  const method = await createMethod();
  const order = await Order.create({ atendente: 'payment-admin', total: 100, subtotal: 100, status: 'pendente', itens: [] });
  const paid = await api('patch', `/orders/${order.id}/pagar`, { tipo: method.value, valorRecebido: 100, operacaoId: 'custom-standalone' });
  expect(paid.status).toBe(200);
  expect(paid.body.pagamentos[0]).toMatchObject({ taxaValor: 3, valorLiquido: 97 });
  const oldOrder = await Order.create({ atendente: 'payment-admin', total: 100, subtotal: 100, status: 'pago', pagamentos: [{ tipo: method.value, valorRecebido: 100, taxaPercentual: 3, taxaValor: 3, valorLiquido: 97, dataPagamento: new Date('2020-01-15T12:00:00Z') }] });
  const command = await createCommand();
  expect((await api('post', `/comandas/${command._id}/fechar`, { metodoPagamento: method.value, operacaoId: 'custom-rate-command' })).status).toBe(200);
  const mes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  const changed = await api('patch', '/contabil/taxas-cartao', { mes, tipo: method.value, taxaPercentual: 4 });
  expect(changed.status).toBe(200);
  expect((await Order.findById(order.id)).pagamentos[0].taxaValor).toBe(4);
  expect((await Comanda.findById(command._id)).historicoPagamentos[0].taxaValor).toBe(4);
  expect((await Order.findById(oldOrder.id)).pagamentos[0].taxaValor).toBe(3);
  expect((await api('get', '/payment-settings')).body.formasPagamento.find(p => p.value === method.value).taxaPercentual).toBe(4);
});

test('código personalizado não cadastrado é rejeitado antes de receber dinheiro', async () => {
  const command = await createCommand();
  const response = await api('post', `/comandas/${command._id}/fechar`, { metodoPagamento: 'personalizado_000000000000000000000000', operacaoId: 'unregistered-payment' });
  expect(response.status).toBe(400);
  expect((await Comanda.findById(command._id)).historicoPagamentos).toHaveLength(0);
  expect(await Order.countDocuments()).toBe(0);
});
