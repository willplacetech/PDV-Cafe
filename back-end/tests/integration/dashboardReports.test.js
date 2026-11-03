const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Customer = require('../../models/Customer');
const Product = require('../../models/Product');
const Order = require('../../models/Order');

let token;
let product;
beforeEach(async () => {
  const user = await User.create({ username: 'reports-admin', password: 'test-password', role: 'admin' });
  token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET);
  product = await Product.create({ codigo: 'reports-coffee', nome: 'Cafe', categoria: 'Outros', preco: 10, precoCompra: 8, estoque: 20 });
});
const dashboard = () => request(app).get('/api/dashboard').set('Authorization', `Bearer ${token}`);
const sale = (extra = {}) => Order.create({
  atendente: 'reports-admin', subtotal: 20, total: 20, status: 'pago',
  itens: [{ produtoId: product.id, nome: product.nome, quantidade: 2, precoUnitario: 10, custoUnitarioHistorico: 3 }],
  ...extra,
});

test('fechamento mensal usa o mes informado sem misturar vendas de outro mes', async () => {
  await sale({ createdAt: new Date('2025-11-15T15:00:00.000Z') });
  await sale({ createdAt: new Date('2025-12-15T15:00:00.000Z'), total: 35 });

  const response = await dashboard().query({ mes: '2025-12' });

  expect(response.status).toBe(200);
  expect(response.body.relatorioMes.total).toBe(35);
  expect(response.body.relatorioMes.pedidos).toBe(1);
  expect(response.body.relatorioMes.periodo).toBe('01/12/2025 a 31/12/2025');
});

test('fechamento mensal inclui o inicio e exclui o primeiro instante do mes seguinte na virada do ano', async () => {
  await sale({ createdAt: new Date('2025-12-01T03:00:00.000Z'), total: 12 });
  await sale({ createdAt: new Date('2026-01-01T02:59:59.999Z'), total: 18 });
  await sale({ createdAt: new Date('2026-01-01T03:00:00.000Z'), total: 24 });

  const response = await dashboard().query({ mes: '2025-12' });

  expect(response.status).toBe(200);
  expect(response.body.relatorioMes.total).toBe(30);
  expect(response.body.relatorioMes.periodo).toBe('01/12/2025 a 31/12/2025');
});

test('mes ausente conserva o fechamento do mes atual', async () => {
  const response = await dashboard();
  const hoje = new Date();
  const mesAtual = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(hoje);

  expect(response.status).toBe(200);
  expect(response.body.relatorioMes.periodo).toContain(`/${mesAtual.slice(0, 4)}`);
});

test.each(['2025-13', '2025-2', '2025-00'])('mes invalido %s retorna erro de validacao', async (mes) => {
  const response = await dashboard().query({ mes });

  expect(response.status).toBe(400);
  expect(response.body.msg).toMatch(/m[eê]s/i);
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
  const customer = await Customer.create({ nome: 'Cliente relatorio' });
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
