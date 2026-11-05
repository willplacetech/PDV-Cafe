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
      tenantId: tenant._id,
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

  test('catálogo e pedido público usam somente os produtos do tenant integrado', async () => {
    const tenantA = await criarTenant({ pdvIntegrado: true });
    const tenantB = await criarTenant({ slug: 'outro-cafe' });
    await Product.create([
      { codigo: 'CAFE-COMPARTILHADO', nome: 'Café A', tipo: 'venda', preco: 5, tenantId: tenantA._id },
      { codigo: 'CAFE-COMPARTILHADO', nome: 'Café B', tipo: 'venda', preco: 9, tenantId: tenantB._id },
      { codigo: 'CAFE-SOMENTE-B', nome: 'Produto B privado', tipo: 'venda', preco: 3, tenantId: tenantB._id },
    ]);

    const catalogo = await request(app).get('/api/publico/delivery/catalogo');
    expect(catalogo.status).toBe(200);
    expect(catalogo.body.produtos.map(({ codigo, nome, preco }) => ({ codigo, nome, preco }))).toEqual([
      { codigo: 'CAFE-COMPARTILHADO', nome: 'Café A', preco: 5 },
    ]);

    const pedidoCompartilhado = await request(app)
      .post('/api/publico/delivery/pedidos')
      .set('Idempotency-Key', 'delivery-tenant-a')
      .send({ ...pedidoValido(), itens: [{ codigo: 'CAFE-COMPARTILHADO', quantidade: 1 }] });
    expect(pedidoCompartilhado.status).toBe(201);
    expect(pedidoCompartilhado.body.pedido.itens).toEqual([
      { descricao: 'Café A', quantidade: 1, precoUnitario: 5 },
    ]);
    expect(String(pedidoCompartilhado.body.pedido.tenantId)).toBe(String(tenantA._id));

    const produtoDoTenantB = await request(app)
      .post('/api/publico/delivery/pedidos')
      .set('Idempotency-Key', 'delivery-tenant-b-product')
      .send({ ...pedidoValido(), itens: [{ codigo: 'CAFE-SOMENTE-B', quantidade: 1 }] });
    expect(produtoDoTenantB.status).toBe(400);
    expect(await PedidoEntrega.countDocuments({ tenantId: tenantA._id })).toBe(1);
    expect(await PedidoEntrega.countDocuments({ tenantId: tenantB._id })).toBe(0);
  });

  test('catálogo público não retorna produtos quando não há tenant integrado', async () => {
    await Product.create({
      codigo: 'CAFE-LEGADO',
      nome: 'Produto sem tenant integrado',
      tipo: 'venda',
      preco: 5,
    });

    const response = await request(app).get('/api/publico/delivery/catalogo');

    expect(response.status).toBe(503);
    expect(response.body.produtos).toBeUndefined();
  });
});
