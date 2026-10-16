const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Customer = require('../../models/Customer');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const Comanda = require('../../models/Comanda');

let token;
let product;
beforeEach(async () => {
  const user = await User.create({ username: 'internal-admin', password: 'test-password', role: 'admin' });
  token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET);
  product = await Product.create({ codigo: 'cafe-interno', nome: 'Café', categoria: 'Bebidas Quentes', tipo: 'venda', preco: 6, precoCompra: 2, estoque: 20, unidadeVenda: 'un' });
});
const api = (method, url, body) => request(app)[method](url).set('Authorization', `Bearer ${token}`).set(require('../approvalFixture').headers(method, url, token, body)).send(body);
const interno = async () => (await api('get', '/api/customers')).body.find(c => c.clienteInterno);

test('cadastro disponibiliza um único Cliente Interno sem telefone e protege sua identidade', async () => {
  const cliente = await interno();
  expect(cliente).toMatchObject({ nome: 'Cliente Interno', clienteInterno: true });
  await api('get', '/api/customers');
  expect(await Customer.countDocuments({ clienteInterno: true })).toBe(1);
  expect((await api('put', `/api/customers/${cliente._id}`, { nome: 'Venda comum' })).status).toBe(409);
  expect((await api('delete', `/api/customers/${cliente._id}`)).status).toBe(409);
});

test('consumo interno fecha sem pagamento, não gera dívida e baixa estoque uma vez', async () => {
  const cliente = await Customer.create({ nome: 'Cliente Interno', clienteInterno: true });
  const created = await api('post', '/api/comandas', { clienteId: cliente.id, itens: [{ produtoId: product.id, quantidade: 2 }] });
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({ utilizacaoInterna: true, valorTotal: 0, saldoDevedor: 0 });
  const payment = await api('patch', `/api/comandas/${created.body._id}/receber-parcial`, { formaPagamento: 'dinheiro', valorRecebido: 1, operacaoId: 'interno-receber' });
  expect(payment.status).toBe(400);
  const closed = await api('post', `/api/comandas/${created.body._id}/fechar`, { operacaoId: 'interno-fechar', utilizacaoInterna: false });
  expect(closed.status).toBe(200);
  expect(closed.body.pedido).toMatchObject({ utilizacaoInterna: true, total: 0, status: 'pago', pagamentos: [] });
  expect(closed.body.pedido.itens[0].custoUnitarioHistorico).toBe(2);
  expect(closed.body.comanda).toMatchObject({ valorPago: 0, saldoDevedor: 0, historicoPagamentos: [] });
  await api('post', `/api/comandas/${created.body._id}/fechar`, { operacaoId: 'interno-fechar', utilizacaoInterna: false });
  expect((await Product.findById(product.id)).estoque).toBe(18);
  expect(await Order.countDocuments()).toBe(1);
  expect((await Customer.findById(cliente.id)).cafesFidelidade).toBe(0);
  expect((await api('get', '/api/comandas/a-receber')).body).toEqual([]);
});

test('alterar itens ou trocar cliente mantém o valor correto sem cobrança interna', async () => {
  const cliente = await Customer.create({ nome: 'Cliente Interno', clienteInterno: true });
  const created = await api('post', '/api/comandas', { clienteId: cliente.id, itens: [{ produtoId: product.id, quantidade: 1 }] });
  const changed = await api('patch', `/api/comandas/${created.body._id}/itens/${created.body.itens[0]._id}`, { quantidade: 3 });
  expect(changed.body).toMatchObject({ utilizacaoInterna: true, valorTotal: 0, saldoDevedor: 0 });
  const regular = await api('patch', `/api/comandas/${created.body._id}/detalhes`, { tipoAtendimento: 'balcao', clienteNome: 'Comum' });
  expect(regular.body).toMatchObject({ utilizacaoInterna: false, valorTotal: 18, saldoDevedor: 18 });
  const internal = await api('patch', `/api/comandas/${created.body._id}/detalhes`, { tipoAtendimento: 'balcao', clienteId: cliente.id });
  expect(internal.body).toMatchObject({ utilizacaoInterna: true, valorTotal: 0, saldoDevedor: 0 });
});

test('pedido direto para Cliente Interno registra consumo sem pagamento', async () => {
  const cliente = await Customer.create({ nome: 'Cliente Interno', clienteInterno: true });
  const response = await api('post', '/api/orders', { clienteId: cliente.id, itens: [{ produtoId: product.id, quantidade: 2 }] });
  expect(response.status).toBe(201);
  expect(response.body).toMatchObject({ utilizacaoInterna: true, total: 0, status: 'pago', clienteNome: cliente.nome, pagamentos: [] });
});

test('DRE contabiliza custo interno separado do CMV e lucro das vendas', async () => {
  const item = { produtoId: product.id, nome: 'Café', precoUnitario: 6, quantidade: 2, custoUnitarioHistorico: 2 };
  await Order.create({ atendente: 'internal-admin', itens: [item], subtotal: 12, total: 0, status: 'pago', utilizacaoInterna: true });
  await Order.create({ atendente: 'internal-admin', itens: [{ ...item, quantidade: 1 }], subtotal: 6, total: 6, status: 'pago' });
  await Order.create({ atendente: 'internal-admin', itens: [item], subtotal: 12, total: 0, status: 'cancelado', utilizacaoInterna: true });
  await Product.findByIdAndUpdate(product.id, { precoCompra: 99 });
  const response = await api('get', '/api/contabil/dre');
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ receitaBruta: 6, cmv: 2, lucroBruto: 4, lucroLiquido: 4, custoConsumoInterno: 4 });
});

test('comanda com recebimento não pode ser convertida em consumo interno', async () => {
  const cliente = await Customer.create({ nome: 'Cliente Interno', clienteInterno: true });
  const created = await api('post', '/api/comandas', { itens: [{ produtoId: product.id, quantidade: 2 }] });
  await api('patch', `/api/comandas/${created.body._id}/receber-parcial`, { formaPagamento: 'dinheiro', valorRecebido: 1, operacaoId: 'parcial-antes' });
  const response = await api('patch', `/api/comandas/${created.body._id}/detalhes`, { tipoAtendimento: 'balcao', clienteId: cliente.id });
  expect(response.status).toBe(400);
  expect((await Comanda.findById(created.body._id)).utilizacaoInterna).toBe(false);
});

test('dashboard exclui consumo interno dos indicadores de lucro e vendas por produto', async () => {
  await Order.create({ atendente: 'internal-admin', itens: [{ produtoId: product.id, nome: product.nome, precoUnitario: 6, quantidade: 2 }], subtotal: 12, total: 0, status: 'pago', utilizacaoInterna: true });
  const response = await api('get', '/api/dashboard');
  expect(response.status).toBe(200);
  expect(response.body.insights.curvaABC).toEqual([]);
  expect(response.body.insights.margemProdutos.find(p => p.produtoId === product.id)).toMatchObject({ quantidade: 0, receita: 0, lucro: 0 });
  const receita = await api('get', '/api/dashboard/receita-7-dias');
  expect(receita.status).toBe(200);
  expect(receita.body.reduce((sum, dia) => sum + dia.pedidos, 0)).toBe(0);
  const ranking = await api('get', '/api/products/mais-vendidos');
  expect(ranking.status).toBe(200);
  expect(ranking.body).toEqual([]);
});
