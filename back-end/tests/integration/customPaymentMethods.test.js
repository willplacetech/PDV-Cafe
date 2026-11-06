const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Tenant = require('../../models/Tenant');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const Comanda = require('../../models/Comanda');
const PaymentSettings = require('../../models/PaymentSettings');
const { calcularOutrosMeios } = require('../../utils/caixa');

let token;
let operatorToken;
let product;
let tenant;
const api = (method, path, body, authToken = token) => request(app)[method](`/api${path}`).set('Authorization', `Bearer ${authToken}`).set(require('../approvalFixture').headers(method, path, authToken, body, jwt.decode(token).id)).send(body);
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
  tenant = await Tenant.create({ nome: 'Payments', slug: 'payments', telefone: '11999999999', endereco: 'Rua de teste' });
  const admin = await User.create({ username: 'payment-admin', password: 'test-password', role: 'admin', tenantId: tenant._id });
  const operator = await User.create({ username: 'payment-operator', password: 'test-password', role: 'operador', tenantId: tenant._id });
  token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role }, process.env.JWT_SECRET);
  operatorToken = jwt.sign({ id: operator.id, username: operator.username, role: operator.role }, process.env.JWT_SECRET);
  product = await Product.create({ codigo: 'payment-test', nome: 'Produto teste', preco: 100, estoque: 20, tenantId: tenant._id });
});

test('somente admin cadastra; operadores consultam e nomes duplicados/taxas inválidas são recusados', async () => {
  expect((await request(app).get('/api/payment-settings')).status).toBe(403);
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
  const order = await Order.create({ atendente: 'payment-admin', total: 100, subtotal: 100, status: 'pendente', itens: [], tenantId: tenant._id });
  const paid = await api('patch', `/orders/${order.id}/pagar`, { tipo: method.value, valorRecebido: 100, operacaoId: 'custom-standalone' });
  expect(paid.status).toBe(200);
  expect(paid.body.pagamentos[0]).toMatchObject({ taxaValor: 3, valorLiquido: 97 });
  const oldOrder = await Order.create({ atendente: 'payment-admin', total: 100, subtotal: 100, status: 'pago', pagamentos: [{ tipo: method.value, valorRecebido: 100, taxaPercentual: 3, taxaValor: 3, valorLiquido: 97, dataPagamento: new Date('2020-01-15T12:00:00Z') }], tenantId: tenant._id });
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

test('edita nome e taxa juntos, recusa duplicidade e preserva o nome histórico', async () => {
  const method = await createMethod();
  const command = await createCommand();
  await api('post', `/comandas/${command._id}/fechar`, { metodoPagamento: method.value, operacaoId: 'edit-history' });
  const mes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  const path = '/contabil/taxas-cartao';
  const body = { mes, tipo: method.value, nome: 'Vale Alimentação', taxaPercentual: 4 };
  expect((await api('patch', path, body, operatorToken)).status).toBe(403);
  expect((await api('patch', path, { ...body, nome: 'PIX' })).status).toBe(409);
  expect((await api('patch', path, { ...body, nome: ' ' })).status).toBe(400);
  await api('post', '/payment-settings', { nome: 'Outro Vale', taxaPercentual: 1 });
  expect((await api('patch', path, { ...body, nome: ' outro vále ' })).status).toBe(409);
  expect((await api('patch', path, body)).status).toBe(200);
  const catalog = (await api('get', '/payment-settings')).body.formasPagamento;
  expect(catalog.find(p => p.value === method.value)).toMatchObject({ label: body.nome, taxaPercentual: 4 });
  expect((await Comanda.findById(command._id)).historicoPagamentos[0]).toMatchObject({ rotuloPagamento: 'Vale Refeição', taxaValor: 4 });
});

test('exclui forma personalizada sem apagar recebimentos e impede novo uso', async () => {
  const method = await createMethod();
  const command = await createCommand();
  await api('post', `/comandas/${command._id}/fechar`, { metodoPagamento: method.value, operacaoId: 'delete-history' });
  const path = `/payment-settings/${method.value}`;
  expect((await api('delete', path, undefined, operatorToken)).status).toBe(403);
  const deleted = await api('delete', path);
  expect(deleted.status).toBe(200);
  expect(deleted.body.formasPagamento.some(p => p.value === method.value)).toBe(false);
  expect((await Comanda.findById(command._id)).historicoPagamentos[0]).toMatchObject({ rotuloPagamento: 'Vale Refeição', taxaValor: 3, valorLiquido: 97 });
  const next = await createCommand();
  expect((await api('post', `/comandas/${next._id}/fechar`, { metodoPagamento: method.value, operacaoId: 'deleted-use' })).status).toBe(400);
  expect((await api('delete', path)).status).toBe(404);
  expect((await api('get', '/dashboard')).body.relatorioMes.pagamentos).toEqual(expect.arrayContaining([expect.objectContaining({ tipo: method.value, bruto: 100, taxa: 3, total: 97 })]));
});

test('renomeia e exclui forma pré-cadastrada sem apagar histórico e impede novo uso', async () => {
  const command = await createCommand();
  const original = await api('post', `/comandas/${command._id}/fechar`, { metodoPagamento: 'cartao_credito', operacaoId: 'default-before-rename' });
  expect(original.status).toBe(200);
  const mes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  const renamed = await api('patch', '/contabil/taxas-cartao', { mes, tipo: 'cartao_credito', nome: 'Crédito Empresa', taxaPercentual: 0 });
  expect(renamed.status).toBe(200);
  expect(renamed.body.formasPagamento.find(forma => forma.value === 'cartao_credito')).toMatchObject({ label: 'Crédito Empresa', gerenciavel: true });

  const nextCommand = await createCommand();
  const nextPayment = await api('post', `/comandas/${nextCommand._id}/fechar`, { metodoPagamento: 'cartao_credito', operacaoId: 'default-after-rename' });
  expect(nextPayment.status).toBe(200);
  expect(nextPayment.body.pedido.pagamentos[0].rotuloPagamento).toBe('Crédito Empresa');

  const deleted = await api('delete', '/payment-settings/cartao_credito');
  expect(deleted.status).toBe(200);
  expect(deleted.body.formasPagamento.some(forma => forma.value === 'cartao_credito')).toBe(false);
  expect((await Comanda.findById(command._id)).historicoPagamentos[0].valor).toBe(100);

  const afterDelete = await createCommand();
  const rejected = await api('post', `/comandas/${afterDelete._id}/fechar`, { metodoPagamento: 'cartao_credito', operacaoId: 'deleted-default-use' });
  expect(rejected.status).toBe(400);
  expect((await Comanda.findById(afterDelete._id)).historicoPagamentos).toHaveLength(0);
});
