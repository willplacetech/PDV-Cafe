const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const Order = require('../../models/Order');
const Comanda = require('../../models/Comanda');
const Tenant = require('../../models/Tenant');
const PedidoEntrega = require('../../models/PedidoEntrega');

let token;
let product;
let user;
let tenant;
beforeEach(async () => {
  tenant = await Tenant.create({ nome: 'Café teste', slug: 'cafe-teste', telefone: '11999999999', endereco: 'Rua Um' });
  user = await User.create({ username: 'comanda-test', password: 'test-password', role: 'admin', tenantId: tenant.id });
  token = jwt.sign({ id: user.id, username: user.username, role: user.role, tenantId: tenant.id }, process.env.JWT_SECRET);
  product = await Product.create({ codigo: 'cafe', nome: 'Café', categoria: 'Bebidas Quentes', tipo: 'venda', preco: 6, estoque: 20, unidadeVenda: 'un' });
});
const api = (method, url, payload) => request(app)[method](url).set('Authorization', `Bearer ${token}`).set(require('../approvalFixture').headers(method, url, token, payload)).send(payload);

test('preço editado persiste ao salvar, alterar quantidade e fechar venda', async () => {
  const created = await api('post', '/api/comandas', { tipoAtendimento: 'balcao', rascunho: true, itens: [{ produtoId: product.id, quantidade: 1, precoUnitarioManual: 5 }] });
  expect(created.status).toBe(201);
  expect(created.body.valorTotal).toBe(5);
  const id = created.body._id;
  const itemId = created.body.itens[0]._id;
  const updated = await api('patch', `/api/comandas/${id}/itens/${itemId}`, { quantidade: 2, precoUnitarioManual: 4.5 });
  expect(updated.status).toBe(200);
  expect(updated.body.valorTotal).toBe(9);
  const closed = await api('post', `/api/comandas/${id}/fechar`, { metodoPagamento: 'dinheiro', operacaoId: 'comanda-close-1' });
  expect(closed.status).toBe(200);
  expect(closed.body.pedido.total).toBe(9);
  const replay = await api('post', `/api/comandas/${id}/fechar`, { metodoPagamento: 'dinheiro', operacaoId: 'comanda-close-1' });
  expect(replay.body.pedido._id).toBe(closed.body.pedido._id);
});

test('comanda normal fechada soma um ponto de fidelidade ao cliente', async () => {
  const customer = await Customer.create({ nome: 'Cliente fidelidade', cafesFidelidade: 9 });
  const created = await api('post', '/api/comandas', {
    tipoAtendimento: 'balcao',
    clienteId: customer.id,
    rascunho: true,
    itens: [{ produtoId: product.id, quantidade: 1 }],
  });

  const closed = await api('post', `/api/comandas/${created.body._id}/fechar`, {
    metodoPagamento: 'dinheiro',
    operacaoId: 'fidelidade-comanda-1',
  });

  expect(closed.status).toBe(200);
  expect((await Customer.findById(customer.id)).cafesFidelidade).toBe(10);
});

test.each([-1, 'inválido', null])('preço manual inválido %p é recusado', async value => {
  const response = await api('post', '/api/comandas', { tipoAtendimento: 'balcao', itens: [{ produtoId: product.id, quantidade: 1, precoUnitarioManual: value }] });
  expect(response.status).toBe(400);
});

test('preço zero é preservado sem substituir pelo preço de catálogo', async () => {
  const created = await api('post', '/api/comandas', { tipoAtendimento: 'balcao', rascunho: true, itens: [{ produtoId: product.id, quantidade: 1, precoUnitarioManual: 0 }] });
  expect(created.status).toBe(201);
  expect(created.body.valorTotal).toBe(0);
});

test('dashboard inclui venda delivery paga antes da entrega e isola faturamento de outro comércio', async () => {
  const order = await Order.create({ atendente: user.username, subtotal: 20, total: 25, taxaEntrega: 5, status: 'pago', tipoAtendimento: 'delivery' });
  const comanda = await Comanda.create({ atendente: user.username, tipoAtendimento: 'delivery', status: 'fechada', pedidoId: order.id, entrega: { tenantId: tenant.id } });
  order.comandaId = comanda.id;
  await order.save();
  await Order.create({ atendente: user.username, subtotal: 25, total: 25, status: 'pago', tipoAtendimento: 'balcao' });
  const other = await Tenant.create({ nome: 'Outro', slug: 'outro', telefone: '11888888888', endereco: 'Rua Dois' });
  const otherUser = await User.create({ username: 'outro-admin', password: 'test-password', role: 'admin', tenantId: other.id });
  await Order.create({ atendente: otherUser.username, subtotal: 500, total: 500, status: 'pago', tipoAtendimento: 'balcao' });
  const response = await api('get', '/api/dashboard/delivery?periodo=hoje');
  expect(response.status).toBe(200);
  expect(response.body.totalPedidos).toBe(1);
  expect(response.body.receitaTotal).toBe(25);
  expect(response.body.freteTotal).toBe(5);
  expect(response.body.porcentagemFaturamento).toBe(50);
  expect(response.body.ticketMedioPresencial).toBe(25);
  expect(response.body.tempoMedioMinutos).toBeNull();
});

test('dashboard inclui delivery criado diretamente em Entregas, sem venda PDV', async () => {
  const data = { tenantId: tenant.id, fonte: 'formulario', origem: { nomeCliente: 'Maria', telefone: '11999999999', endereco: { rua: 'Rua Um', numero: '1', bairro: 'Centro' } }, valorTotal: 20, taxaEntrega: 5 };
  await PedidoEntrega.create({ ...data, status: 'entregue', statusHistorico: [{ status: 'despachado', data: new Date(Date.now() - 20 * 60000), por: { tipo: 'sistema' } }, { status: 'entregue', data: new Date(), por: { tipo: 'sistema' } }] });
  await PedidoEntrega.create({ ...data, status: 'cancelado' });
  await PedidoEntrega.create({ ...data, status: 'pronto' });
  const other = await Tenant.create({ nome: 'Outro', slug: 'outro', telefone: '11888888888', endereco: 'Rua Dois' });
  await PedidoEntrega.create({ ...data, tenantId: other.id, status: 'entregue' });
  const response = await api('get', '/api/dashboard/delivery?periodo=hoje');
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ totalPedidos: 1, receitaTotal: 25, freteTotal: 5, ticketMedio: 25, porcentagemFaturamento: 100, tempoMedioMinutos: 20 });
  expect(response.body.porEntregador.find(item => item.nome === 'Sem entregador atribuído')).toMatchObject({ pedidos: 1, receita: 25, frete: 5 });
});

test('delivery vinculado ao PDV é contado uma vez quando também foi entregue', async () => {
  const order = await Order.create({ atendente: user.username, subtotal: 20, total: 25, taxaEntrega: 5, status: 'pago', tipoAtendimento: 'delivery' });
  const comanda = await Comanda.create({ atendente: user.username, tipoAtendimento: 'delivery', status: 'fechada', pedidoId: order.id, entrega: { tenantId: tenant.id } });
  order.comandaId = comanda.id;
  await order.save();
  await PedidoEntrega.create({ tenantId: tenant.id, fonte: 'pdv', vendaId: comanda.id, origem: { nomeCliente: 'Maria', telefone: '11999999999', endereco: { rua: 'Rua Um', numero: '1', bairro: 'Centro' } }, valorTotal: 20, taxaEntrega: 5, status: 'entregue' });
  const response = await api('get', '/api/dashboard/delivery?periodo=hoje');
  expect(response.body).toMatchObject({ totalPedidos: 1, receitaTotal: 25, freteTotal: 5, porcentagemFaturamento: 100 });
});

test('delivery direto entra no período da entrega, mesmo criado em outro dia', async () => {
  const agora = new Date();
  const ontem = new Date(Date.now() - 86400000);
  const data = { tenantId: tenant.id, fonte: 'api', origem: { nomeCliente: 'Maria', telefone: '11999999999', endereco: { rua: 'Rua Um', numero: '1', bairro: 'Centro' } }, valorTotal: 20, taxaEntrega: 5, status: 'entregue' };
  await PedidoEntrega.create({ ...data, criadoEm: ontem, statusHistorico: [{ status: 'entregue', data: agora, por: { tipo: 'sistema' } }] });
  await PedidoEntrega.create({ ...data, statusHistorico: [{ status: 'entregue', data: ontem, por: { tipo: 'sistema' } }] });
  const response = await api('get', '/api/dashboard/delivery?periodo=hoje');
  expect(response.body).toMatchObject({ totalPedidos: 1, receitaTotal: 25, freteTotal: 5 });
});
