const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Order = require('../../models/Order');
const Comanda = require('../../models/Comanda');

let token;

beforeEach(async () => {
  const admin = await User.create({ username: 'orders-page-admin', password: 'isolated-password-123', role: 'admin' });
  token = jwt.sign({ id: admin.id, role: admin.role }, process.env.JWT_SECRET);
  await Order.create([
    { numero: '900001', subtotal: 10, total: 10, status: 'pago', atendente: admin.username, clienteNome: 'Pago' },
    { numero: '900002', subtotal: 10, total: 10, status: 'pendente', atendente: admin.username, clienteNome: 'Pendente A' },
    { numero: '900003', subtotal: 10, total: 10, status: 'pendente', atendente: admin.username, clienteNome: 'Pendente B' },
  ]);
});

const get = path => request(app).get(path).set('Authorization', `Bearer ${token}`);

test('order history paginates after applying status filters and keeps legacy arrays', async () => {
  const legacy = await get('/api/orders');
  expect(legacy.status).toBe(200);
  expect(Array.isArray(legacy.body)).toBe(true);
  expect(legacy.body).toHaveLength(3);

  const page = await get('/api/orders?status=pendente&pagina=2&limite=1');
  expect(page.status).toBe(200);
  expect(page.body).toMatchObject({ total: 2, pagina: 2, limite: 1, totalPaginas: 2 });
  expect(page.body.dados).toHaveLength(1);
  expect(page.body.dados[0].clienteNome).toBe('Pendente A');
  expect(page.body.totais).toMatchObject({ totalBruto: 20, totalEmAberto: 20, totalPago: 0 });
});

test('open receivable tabs return the standard pagination envelope', async () => {
  await Comanda.create([
    {
      numero: 'R-001',
      valorTotal: 12,
      atendente: 'orders-page-admin',
      clienteNome: 'Conta A',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      historicoPagamentos: [
        { valor: 2, formaPagamento: 'dinheiro' },
        { valor: 5, formaPagamento: 'credito_loja' },
      ],
    },
    { numero: 'R-002', valorTotal: 18, atendente: 'orders-page-admin', clienteNome: 'Conta B', createdAt: new Date('2026-01-02T00:00:00.000Z') },
  ]);

  const response = await get('/api/comandas/a-receber?pagina=2&limite=1');

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ total: 2, pagina: 2, limite: 1, totalPaginas: 2 });
  expect(response.body.dados).toHaveLength(1);
  expect(response.body.dados[0].clienteNome).toBe('Conta A');
  expect(response.body.totais).toMatchObject({ totalBruto: 30, totalEmAberto: 28, totalPago: 2 });
});
