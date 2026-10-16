const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Auditoria = require('../../models/Auditoria');
const Product = require('../../models/Product');
const Comanda = require('../../models/Comanda');
const Order = require('../../models/Order');
const Customer = require('../../models/Customer');
const FechamentoCaixa = require('../../models/FechamentoCaixa');
const approval = require('../approvalFixture');

const password = 'senha-gerente-teste-123';
let manager, operator, bearer;
const call = (path, body, token = bearer) => request(app).post(`/api${path}`).set('Authorization', `Bearer ${token}`).send(body);
beforeEach(async () => {
  manager = await User.create({ username: 'gerente', password, role: 'gerente' });
  operator = await User.create({ username: 'operador', password: 'senha-operador-teste-123', role: 'operador' });
  bearer = jwt.sign({ id: operator.id, tokenVersion: 0 }, process.env.JWT_SECRET);
});

test('operador solicita senha de gerente, JWT dura 5min e não serve como login', async () => {
  expect((await call('/auth/autorizar', { acao: 'sangria_suprimento' })).status).toBe(400);
  const response = await call('/auth/autorizar', { senha: password, acao: 'sangria_suprimento' });
  expect(response.status).toBe(200);
  const claims = jwt.verify(response.body.tokenAutorizacao, process.env.JWT_SECRET);
  expect(claims.exp - claims.iat).toBe(300);
  expect(claims.solicitante).toBe(operator.id);
  expect(claims.username).toBeUndefined();
  expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${response.body.tokenAutorizacao}`)).status).toBe(401);
  const legacy = jwt.sign({ id: manager.id, role: 'gerente', acao: 'fechar_caixa' }, process.env.JWT_SECRET);
  expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${legacy}`)).status).toBe(401);
});

test('três erros bloqueiam no servidor por 60s, mesmo com senha correta, e auditam', async () => {
  for (let i = 0; i < 3; i++) {
    const response = await call('/auth/autorizar', { senha: 'errada', acao: 'fechar_caixa' });
    expect(response.status).toBe(i === 2 ? 429 : 403);
  }
  expect((await call('/auth/autorizar', { senha: password, acao: 'fechar_caixa' })).status).toBe(429);
  expect(await Auditoria.exists({ motivoFalha: 'bloqueio_60s' })).toBeTruthy();
  await User.updateOne({ _id: operator.id }, { $set: { autorizacaoBloqueadaAte: new Date(Date.now() - 1) } });
  expect((await call('/auth/autorizar', { senha: password, acao: 'fechar_caixa' })).status).toBe(200);
});

test('token é obrigatório, restrito à ação, solicitante e gerente ativo', async () => {
  const path = '/caixa/000000000000000000000001/movimentos';
  expect((await call(path, {})).status).toBe(403);
  const approved = await call('/auth/autorizar', { senha: password, acao: 'sangria_suprimento' });
  const send = (token = bearer) => call(path, {}, token).set('X-Autorizacao-Gerente', approved.body.tokenAutorizacao);
  expect((await send()).status).toBe(404);
  expect((await call('/caixa/000000000000000000000001/fechar', {}).set('X-Autorizacao-Gerente', approved.body.tokenAutorizacao)).status).toBe(403);
  const other = jwt.sign({ id: manager.id, tokenVersion: 0 }, process.env.JWT_SECRET);
  expect((await send(other)).status).toBe(403);
  await User.updateOne({ _id: manager.id }, { $set: { ativo: false } });
  expect((await send()).status).toBe(403);
});

test('gerente/admin autenticado autoriza a própria ação sem redigitar senha', async () => {
  const admin = await User.create({ username: 'admin', password: 'senha-admin-teste-123', role: 'admin' });
  const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);
  for (const [user, bearerToken] of [[manager, jwt.sign({ id: manager.id, tokenVersion: 0 }, process.env.JWT_SECRET)], [admin, token]]) {
    const response = await call('/auth/autorizar', { acao: 'criar_usuario' }, bearerToken);
    expect(response.status).toBe(200);
    const claims = jwt.verify(response.body.tokenAutorizacao, process.env.JWT_SECRET);
    expect(claims.id).toBe(user.id);
    expect(claims.solicitante).toBe(user.id);
    expect(claims.acao).toBe('criar_usuario');
    expect(await Auditoria.exists({ usuarioSolicitante: user._id, usuarioAutorizou: user._id, acao: 'criar_usuario', sucesso: true })).toBeTruthy();
  }
});

test('criação de usuário e remoção de item exigem autorização antes de mutar', async () => {
  const admin = await User.create({ username: 'admin', password, role: 'admin' });
  const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);
  expect((await call('/auth/register', { username: 'novo', password }, token)).status).toBe(403);
  expect((await request(app).delete('/api/comandas/000000000000000000000001/itens/000000000000000000000002').set('Authorization', `Bearer ${bearer}`)).status).toBe(403);
});

test('desconto de 10% passa; acima exige JWT antes de criar pedido', async () => {
  const admin = await User.create({ username: 'admin', password, role: 'admin' });
  const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);
  const product = await Product.create({ codigo: 'coffee', nome: 'Cafe', preco: 100, estoque: 10 });
  const body = { itens: [{ produtoId: product.id, quantidade: 1 }], desconto: 10 };
  expect((await call('/orders', body, token)).status).toBe(201);
  const blocked = await call('/orders', { ...body, desconto: 10.01 }, token);
  expect(blocked.status).toBe(403);
  expect(blocked.body.acao).toBe('desconto_acima_10');
  expect(await Order.countDocuments()).toBe(1);
  expect((await call('/orders', { ...body, desconto: 11 }, token).set('X-Autorizacao-Gerente', approval(token, 'desconto_acima_10'))).status).toBe(201);
});

test('preço manual e redução de peso vendido exigem autorização sem alterar estoque', async () => {
  const product = await Product.create({ codigo: 'peso', nome: 'Bolo', preco: 100, estoque: 10 });
  expect((await call('/comandas', { itens: [{ produtoId: product.id, quantidade: 1, precoUnitarioManual: 1 }] })).status).toBe(403);
  const comanda = await Comanda.create({ atendente: 'operador', itens: [{ produtoId: product.id, nome: 'Bolo', quantidade: 1, tipoVenda: 'peso', pesoVendidoKg: 1, precoUnitario: 100 }], valorTotal: 100 });
  const response = await request(app).patch(`/api/comandas/${comanda.id}/itens/${comanda.itens[0].id}`).set('Authorization', `Bearer ${bearer}`).send({ quantidade: 1, pesoVendidoKg: 0.001 });
  expect(response.status).toBe(403);
  expect(response.body.acao).toBe('excluir_item');
  expect((await Comanda.findById(comanda.id)).itens[0].pesoVendidoKg).toBe(1);
});

test('reabrir/fechar comanda preserva recebimentos, pedido único, fidelidade e estoque', async () => {
  const product = await Product.create({ codigo: 'coffee', nome: 'Cafe', preco: 10, estoque: 9 });
  const itens = [{ produtoId: product.id, nome: 'Cafe', quantidade: 1, precoUnitario: 10 }];
  const customer = await Customer.create({ nome: 'Cliente teste', cafesFidelidade: 1 });
  const comanda = await Comanda.create({ atendente: 'operador', clienteId: customer.id, itens, status: 'fechada', estoqueBaixado: true, valorTotal: 10, historicoPagamentos: [{ formaPagamento: 'dinheiro', valor: 10, valorLiquido: 10 }] });
  const order = await Order.create({ itens, subtotal: 10, total: 10, status: 'pago', atendente: 'operador', comandaId: comanda._id });
  comanda.pedidoId = order._id;
  await comanda.save();
  expect((await call(`/comandas/${comanda.id}/reabrir`, {})).status).toBe(403);
  const reopened = await call(`/comandas/${comanda.id}/reabrir`, {}).set('X-Autorizacao-Gerente', approval(bearer, 'reabrir_comanda', manager.id));
  expect(reopened.status).toBe(200);
  expect(reopened.body.cicloFechamento).toBe(1);
  expect(reopened.body.historicoPagamentos).toHaveLength(1);
  const closed = await call(`/comandas/${comanda.id}/fechar`, { metodoPagamento: 'dinheiro', desconto: 0 }).set('Idempotency-Key', 'approval-reclose-123456');
  expect(closed.status).toBe(200);
  expect(closed.body.pedido._id).toBe(order.id);
  expect(closed.body.comanda.historicoPagamentos).toHaveLength(1);
  expect(await Order.countDocuments()).toBe(1);
  expect((await Product.findById(product.id)).estoque).toBe(9);
  expect((await Customer.findById(customer.id)).cafesFidelidade).toBe(1);
});

test('reabertura de caixa exige JWT e preserva snapshot anterior', async () => {
  const caixa = await FechamentoCaixa.create({ data: new Date(), usuarioAbertura: 'operador', status: 'fechado', contagemFisica: { valorContado: 17 } });
  expect((await call(`/caixa/${caixa.id}/reabrir`, {})).status).toBe(403);
  const response = await call(`/caixa/${caixa.id}/reabrir`, {}).set('X-Autorizacao-Gerente', approval(bearer, 'reabrir_caixa', manager.id));
  expect(response.status).toBe(200);
  expect(response.body.status).toBe('aberto');
  expect(response.body.reaberturas[0].fechamento.status).toBe('fechado');
  expect(response.body.reaberturas[0].fechamento.contagemFisica.valorContado).toBe(17);
});

test('tentativas paralelas mantêm bloqueio e não expõem senha em auditoria', async () => {
  await Promise.all(Array.from({ length: 4 }, () => call('/auth/autorizar', { senha: 'errada', acao: 'fechar_caixa' })));
  expect((await call('/auth/autorizar', { senha: password, acao: 'fechar_caixa' })).status).toBe(429);
  expect(JSON.stringify(await Auditoria.find().lean())).not.toContain(password);
});
