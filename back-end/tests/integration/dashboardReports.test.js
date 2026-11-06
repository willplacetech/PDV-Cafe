const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Customer = require('../../models/Customer');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const Tenant = require('../../models/Tenant');

let token;
let product;
let tenant;
beforeEach(async () => {
  tenant = await Tenant.create({ nome: 'Dashboard reports', slug: 'dashboard-reports', telefone: '11999999999', endereco: 'Rua de teste' });
  const user = await User.create({ username: 'reports-admin', password: 'test-password', role: 'admin', tenantId: tenant._id });
  token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET);
  product = await Product.create({ codigo: 'reports-coffee', nome: 'Cafe', categoria: 'Outros', preco: 10, precoCompra: 8, estoque: 20, tenantId: tenant._id });
});
const dashboard = () => request(app).get('/api/dashboard').set('Authorization', `Bearer ${token}`);
const sale = (extra = {}) => Order.create({
  atendente: 'reports-admin', subtotal: 20, total: 20, status: 'pago',
  itens: [{ produtoId: product.id, nome: product.nome, quantidade: 2, precoUnitario: 10, custoUnitarioHistorico: 3 }],
  tenantId: tenant._id,
  ...extra,
});

test('vendas fora de 08h-20h entram nos rankings e no estoque vendido', async () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  date.setUTCHours(2, 0, 0, 0); // 23h do dia anterior em Sao Paulo.
  await sale({ createdAt: date });
  const response = await dashboard();
  expect(response.status).toBe(200);
  expect(response.body.insights.curvaABC).toEqual([expect.objectContaining({ produtoId: product.id, quantidade: 2, receita: 20 })]);
  expect(response.body.insights.estoqueParado).toEqual([]);
  expect(response.body.insights.vendasPorHora.reduce((sum, hour) => sum + hour.total, 0)).toBe(0);
});

test('margem usa o custo historico em vez de custo atual ou campo inexistente', async () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  date.setUTCHours(15, 0, 0, 0);
  await sale({ createdAt: date });
  const response = await dashboard();
  expect(response.status).toBe(200);
  expect(response.body.insights.margemProdutos[0]).toMatchObject({ quantidade: 2, receita: 20, custo: 3, lucro: 14, margemPercentual: 70 });
});

test('relatorio de clientes soma vendas e recebimentos sem incluir canceladas', async () => {
  const customer = await Customer.create({ nome: 'Cliente relatorio', tenantId: tenant._id });
  const date = new Date();
  await sale({ clienteId: customer.id, clienteNome: customer.nome, status: 'parcial', pagamentos: [{ tipo: 'pix', valorRecebido: 5, dataPagamento: date }] });
  await sale({ clienteId: customer.id, clienteNome: customer.nome, status: 'cancelado' });
  const response = await dashboard();
  expect(response.status).toBe(200);
  expect(response.body.relatorioClientes).toMatchObject({ clientesComCompra: 1, totalVendido: 20, totalRecebido: 5, totalPendente: 15 });
  expect(response.body.relatorioClientes.clientes.find(item => item.id === customer.id)).toMatchObject({ pedidos: 1, total: 20, recebido: 5, pendente: 15 });
});

test('margem legada converte custo por peca para kg', async () => {
  await Product.findByIdAndUpdate(product.id, { unidadeVenda: 'kg', pesoPorUnidade: 0.5, precoCompra: 5 });
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  date.setUTCHours(15, 0, 0, 0);
  await sale({ createdAt: date, itens: [{ produtoId: product.id, nome: product.nome, quantidade: 1, precoUnitario: 20, unidadeVenda: 'kg', pesoPorUnidade: 0.5, tipoVenda: 'inteiro' }] });
  const response = await dashboard();
  expect(response.status).toBe(200);
  expect(response.body.insights.margemProdutos[0]).toMatchObject({ quantidade: 0.5, custo: 10, lucro: 15 });
});
