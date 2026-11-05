const request = require('supertest');
const trustProxyHopsOriginal = process.env.TRUST_PROXY_HOPS;
process.env.TRUST_PROXY_HOPS = '1';
const app = require('../../server');
if (trustProxyHopsOriginal === undefined) delete process.env.TRUST_PROXY_HOPS;
else process.env.TRUST_PROXY_HOPS = trustProxyHopsOriginal;
const Tenant = require('../../models/Tenant');
const Product = require('../../models/Product');
const PedidoEntrega = require('../../models/PedidoEntrega');
const Reserva = require('../../models/Reserva');

const criarTenant = (overrides = {}) => Tenant.create({
  nome: 'Café Teste',
  slug: 'cafe-teste',
  telefone: '11999999999',
  endereco: 'Rua Um, 1',
  ...overrides,
});

const reservaValida = () => ({
  data: '2026-11-20',
  horario: '19:30',
  pessoas: 4,
  nome: 'Ana Souza',
  telefone: '11999998888',
});

const pedidoValido = () => ({
  nomeCliente: 'Maria Souza',
  telefone: '11999997777',
  endereco: { rua: 'Rua Um', numero: '12', bairro: 'Centro' },
  itens: [{ codigo: 'CAFE-001', quantidade: 1 }],
});

beforeAll(async () => {
  await Promise.all([Tenant.init(), Product.init(), PedidoEntrega.init(), Reserva.init()]);
});

describe('limites para criação de recursos públicos', () => {
  test('configura a quantidade de proxies confiáveis explicitamente', () => {
    expect(app.get('trust proxy')).toBe(1);
  });

  test('usa o IP encaminhado pelo proxy para limitar reservas separadamente', async () => {
    await criarTenant();

    const respostas = [];
    for (let tentativa = 0; tentativa < 20; tentativa += 1) {
      respostas.push(await request(app)
        .post('/api/reservas')
        .set('X-Forwarded-For', '198.51.100.10')
        .send(reservaValida()));
    }
    respostas.push(await request(app)
      .post('/api/reservas')
      .set('X-Forwarded-For', '198.51.100.10')
      .send(reservaValida()));
    respostas.push(await request(app)
      .post('/api/reservas')
      .set('X-Forwarded-For', '198.51.100.11')
      .send(reservaValida()));

    expect(respostas.slice(0, 20).every(resposta => resposta.status === 201)).toBe(true);
    expect(respostas[20].status).toBe(429);
    expect(respostas[21].status).toBe(201);
    expect(await Reserva.countDocuments()).toBe(21);
  });

  test('limita pedidos de delivery por IP e não persiste solicitações excedentes', async () => {
    const tenant = await criarTenant({ pdvIntegrado: true });
    await Product.create({
      codigo: 'CAFE-001',
      nome: 'Café',
      tipo: 'venda',
      preco: 5,
    });

    const respostas = [];
    for (let tentativa = 0; tentativa < 21; tentativa += 1) {
      respostas.push(await request(app)
        .post('/api/publico/delivery/pedidos')
        .set('Idempotency-Key', `limite-${tenant.id}-${tentativa}`)
        .set('X-Forwarded-For', '198.51.100.20')
        .send(pedidoValido()));
    }

    expect(respostas.slice(0, 20).every(resposta => resposta.status === 201)).toBe(true);
    expect(respostas[20].status).toBe(429);
    expect(await PedidoEntrega.countDocuments({ tenantId: tenant._id })).toBe(20);
  });
});
