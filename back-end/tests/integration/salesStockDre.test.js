const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Tenant = require('../../models/Tenant');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const StockMovement = require('../../models/StockMovement');

test('venda paga baixa estoque, registra custo historico e aparece no DRE', async () => {
  const tenant = await Tenant.create({ nome: 'Sales stock DRE', slug: 'sales-stock-dre', telefone: '11999999999', endereco: 'Rua de teste' });
  const user = await User.create({ username: 'sales-stock-dre-admin', password: 'test-password', role: 'admin', tenantId: tenant._id });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET);
  const product = await Product.create({
    codigo: 'sales-stock-dre-coffee',
    nome: 'Cafe de teste E2E',
    categoria: 'Bebidas Quentes',
    preco: 10,
    precoCompra: 3,
    estoque: 10,
    tenantId: tenant._id,
  });

  const saleResponse = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ itens: [{ produtoId: product.id, quantidade: 2 }] });

  expect(saleResponse.status).toBe(201);
  expect(saleResponse.body.itens[0].custoUnitarioHistorico).toBe(3);

  const paymentResponse = await request(app)
    .patch(`/api/orders/${saleResponse.body._id}/pagar`)
    .set('Authorization', `Bearer ${token}`)
    .send({ tipo: 'dinheiro', valorRecebido: 20, operacaoId: 'sales-stock-dre-payment' });

  expect(paymentResponse.status).toBe(200);
  expect(paymentResponse.body.status).toBe('pago');

  const updatedProduct = await Product.findById(product.id);
  expect(updatedProduct.estoque).toBe(8);

  const movements = await StockMovement.find({ produtoId: product.id, tipo: 'saida', origem: 'venda' });
  expect(movements).toHaveLength(1);
  expect(movements[0].quantidade).toBe(2);

  const mes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
  const dreResponse = await request(app)
    .get('/api/contabil/dre')
    .query({ mes })
    .set('Authorization', `Bearer ${token}`);

  expect(dreResponse.status).toBe(200);
  expect(dreResponse.body.receitaBruta).toBe(20);
  expect(dreResponse.body.cmv).toBe(6);
  expect(dreResponse.body.lucroBruto).toBe(14);

  const dashboardResponse = await request(app)
    .get('/api/dashboard')
    .query({ mes })
    .set('Authorization', `Bearer ${token}`);

  expect(dashboardResponse.status).toBe(200);
  expect(dashboardResponse.body.vendasHoje).toMatchObject({ pedidos: 1, itens: 2, total: 20, recebido: 20, pendente: 0 });
  expect(dashboardResponse.body.relatorioMes).toMatchObject({ pedidos: 1, vendas: 1, total: 20, recebido: 20, pendente: 0 });
  expect(dashboardResponse.body.insights.curvaABC).toEqual([
    expect.objectContaining({ produtoId: product.id, quantidade: 2, receita: 20 }),
  ]);
  expect(dashboardResponse.body.insights.margemProdutos).toEqual([
    expect.objectContaining({ produtoId: product.id, quantidade: 2, receita: 20, custo: 3, lucro: 14, margemPercentual: 70 }),
  ]);

  const savedOrder = await Order.findById(saleResponse.body._id).lean();
  expect(savedOrder.status).toBe('pago');
  expect(savedOrder.itens[0].custoUnitarioHistorico).toBe(3);
});
