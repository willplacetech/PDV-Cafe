const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const MesasSettings = require('../../models/MesasSettings');
const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const Comanda = require('../../models/Comanda');
const StockMovement = require('../../models/StockMovement');

let token;
let product;

beforeEach(async () => {
  const user = await User.create({ username: 'autoatendimento-admin', password: 'test-password', role: 'admin' });
  token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET);
  product = await Product.create({
    codigo: 'qr-cafe',
    nome: 'Café',
    categoria: 'Bebidas Quentes',
    tipo: 'venda',
    preco: 6,
    estoque: 20,
    unidadeVenda: 'un',
  });
});

const api = (method, path, body) => {
  let req = request(app)[method](path).set('Authorization', `Bearer ${token}`);
  if (body !== undefined) req = req.send(body);
  return req;
};

const mesaToken = async () => (await api('get', '/api/mesas')).body.mesas[0].token;
const cotacoesQr = new WeakMap();
const pedidoQr = async (body, key = 'qr-order-test-1') => {
  let cotacaoToken = body.cotacaoToken;
  if (!cotacaoToken && body.mesaToken && Array.isArray(body.itens) && body.itens.length) {
    let cotacao = cotacoesQr.get(body);
    if (!cotacao) {
      cotacao = request(app)
        .post(`/api/pedidos/auto-atendimento/${body.mesaToken}/cotacao`)
        .send({ itens: body.itens.map(({ produtoId, quantidade }) => ({ produtoId, quantidade })) })
        .then((response) => response.status === 200 ? response.body.cotacaoToken : null);
      cotacoesQr.set(body, cotacao);
    }
    cotacaoToken = await cotacao;
  }
  const pedido = cotacaoToken ? { ...body, cotacaoToken } : body;
  return request(app)
    .post('/api/pedidos/auto-atendimento')
    .set('Idempotency-Key', key)
    .send(pedido);
};
const payloadQr = (tokenMesa, overrides = {}) => ({
  mesaToken: tokenMesa,
  clienteNome: 'Ana Cliente',
  clienteTelefone: '(11) 99999-8888',
  consentimentoWhatsApp: true,
  itens: [{ produtoId: String(product.id), quantidade: 1 }],
  ...overrides,
});

test('GET autenticado cria tokens aleatórios únicos e os preserva', async () => {
  const first = await api('get', '/api/mesas');

  expect(first.status).toBe(200);
  const tokens = first.body.mesas.map((mesa) => mesa.token);
  expect(tokens).toHaveLength(4);
  expect(tokens.every((value) => /^[A-Za-z0-9_-]{43}$/.test(value))).toBe(true);
  expect(new Set(tokens).size).toBe(tokens.length);
  expect((await MesasSettings.findById('principal')).mesas.map((mesa) => mesa.token)).toEqual(tokens);

  const second = await api('get', '/api/mesas');
  expect(second.body.mesas.map((mesa) => mesa.token)).toEqual(tokens);
});

test('PUT preserva tokens por id, ignora token forjado e cria token para mesa nova', async () => {
  const initial = await api('get', '/api/mesas');
  const originalToken = initial.body.mesas[0].token;
  const mesas = [
    { ...initial.body.mesas[0], nome: 'Mesa atualizada', token: 'token-forjado' },
    ...initial.body.mesas.slice(1).map((mesa) => ({ ...mesa, token: 'token-forjado' })),
    { id: 5, numero: 5, nome: 'Mesa nova', lugares: 2, ativa: true, token: 'token-forjado' },
  ];

  const updated = await api('put', '/api/mesas', { mesas, oferecerBalcao: true });

  expect(updated.status).toBe(200);
  expect(updated.body.mesas[0].token).toBe(originalToken);
  expect(updated.body.mesas.every((mesa) => mesa.token !== 'token-forjado')).toBe(true);
  expect(new Set(updated.body.mesas.map((mesa) => mesa.token)).size).toBe(updated.body.mesas.length);
  expect(updated.body.mesas.find((mesa) => mesa.id === 5).token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect((await MesasSettings.findById('principal')).mesas.map((mesa) => mesa.token)).toEqual(updated.body.mesas.map((mesa) => mesa.token));
});

test('GET de mesas continua exigindo autenticação', async () => {
  const response = await request(app).get('/api/mesas');

  expect(response.status).toBe(401);
});

test('cardápio público retorna somente produtos ativos e campos públicos', async () => {
  const inactiveProduct = await Product.create({
    codigo: 'qr-cafe-inativo',
    nome: 'Café inativo',
    categoria: 'Bebidas Quentes',
    tipo: 'venda',
    preco: 7,
    estoque: 10,
    ativo: false,
  });
  const ingredient = await Product.create({
    codigo: 'qr-insumo',
    nome: 'Grão de café',
    categoria: 'Insumos',
    tipo: 'insumo',
    preco: 2,
    precoCompra: 1,
    estoque: 10,
  });
  const response = await request(app).get(`/api/pedidos/auto-atendimento/${await mesaToken()}`);

  expect(response.status).toBe(200);
  expect(response.body.mesa).toMatchObject({ numero: 1, nome: 'Mesa 1' });
  expect(response.body.produtos).toEqual([{
    produtoId: String(product.id),
    nome: product.nome,
    categoria: product.categoria,
    preco: product.preco,
    unidadeVenda: product.unidadeVenda,
  }]);
  expect(JSON.stringify(response.body)).not.toContain(String(inactiveProduct.id));
  expect(JSON.stringify(response.body)).not.toContain(String(ingredient.id));
  expect(JSON.stringify(response.body)).not.toContain('estoque');
  expect(JSON.stringify(response.body)).not.toContain('telefone');
});

test('cardápio público recusa token inválido e mesa inativa', async () => {
  const tokenMesa = await mesaToken();
  const invalid = await request(app).get('/api/pedidos/auto-atendimento/token-inválido');
  expect(invalid.status).toBe(404);

  const settings = await api('get', '/api/mesas');
  const mesas = settings.body.mesas.map((mesa) => ({ ...mesa, ativa: mesa.numero === 1 ? false : mesa.ativa }));
  const updated = await api('put', '/api/mesas', { mesas, oferecerBalcao: settings.body.oferecerBalcao });
  expect(updated.status).toBe(200);
  expect(updated.body.mesas.find((mesa) => mesa.numero === 1).ativa).toBe(false);
  expect((await MesasSettings.findById('principal').lean()).mesas.find((mesa) => mesa.numero === 1).ativa).toBe(false);
  const inactive = await request(app).get(`/api/pedidos/auto-atendimento/${tokenMesa}`);
  expect(inactive.status).toBe(404);
});

test.each([
  ['nome ausente', { clienteNome: undefined }],
  ['telefone ausente', { clienteTelefone: undefined }],
  ['telefone curto', { clienteTelefone: '123456789' }],
  ['telefone longo', { clienteTelefone: '12345678901234' }],
  ['consentimento ausente', { consentimentoWhatsApp: undefined }],
  ['consentimento falso', { consentimentoWhatsApp: false }],
  ['sem itens', { itens: [] }],
  ['quantidade inválida', { itens: [{ produtoId: '000000000000000000000001', quantidade: 1.5 }] }],
  ['chave não prevista', { campoPrivado: 'não permitido' }],
])('pedido público valida %s sem persistir dados', async (_nome, overrides) => {
  const response = await pedidoQr(payloadQr(await mesaToken(), overrides));

  expect(response.status).toBe(400);
  expect(await Comanda.countDocuments()).toBe(0);
  expect(await Customer.countDocuments()).toBe(0);
});

test('pedido usa mesa e preço do servidor, preserva Cliente existente e oculta telefone da resposta', async () => {
  const customer = await Customer.create({ nome: 'Nome já cadastrado', telefone: '11999998888' });
  const tokenMesa = await mesaToken();
  const response = await pedidoQr(payloadQr(tokenMesa, {
    clienteNome: 'Nome enviado pelo QR',
    mesa: '999',
    preco: 0.01,
    nomeProduto: 'Produto falso',
    itens: [{
      produtoId: String(product.id),
      quantidade: 2,
      observacao: 'sem açúcar',
      preco: 0.01,
      nomeProduto: 'Produto falso',
    }],
  }));

  expect(response.status).toBe(201);
  expect(response.body).toMatchObject({
    status: 'aberta',
    mesa: '1',
  });
  expect(JSON.stringify(response.body)).not.toContain('11999998888');
  expect(response.body).not.toHaveProperty('clienteTelefone');

  const comanda = await Comanda.findById(response.body.comandaId);
  const registeredCustomer = await Customer.findById(customer.id);
  expect(comanda.toObject()).toMatchObject({
    origem: 'qr',
    status: 'aberta',
    statusPagamento: 'pendente',
    clienteId: customer._id,
    clienteNome: 'Nome já cadastrado',
    clienteTelefone: '11999998888',
    mesa: '1',
    valorTotal: 12,
    atendente: 'Autoatendimento QR',
  });
  expect(comanda.itens[0]).toMatchObject({
    nome: 'Café',
    precoUnitario: 6,
    quantidade: 2,
    observacao: 'sem açúcar',
  });
  expect(comanda.consentimentoWhatsApp.aceito).toBe(true);
  expect(comanda.consentimentoWhatsApp.registradoEm).toBeInstanceOf(Date);
  expect(registeredCustomer.nome).toBe('Nome já cadastrado');
  expect((await Product.findById(product.id)).estoque).toBe(18);
  expect(await StockMovement.countDocuments({ produtoId: product.id })).toBe(1);
});

test('cotação pública aplica descontos por quantidade e por grupo do servidor', async () => {
  await Product.findByIdAndUpdate(product.id, {
    descontosPorQuantidade: [{ quantidadeMinima: 2, precoUnitario: 5 }],
    grupoDesconto: { nome: 'Combo QR', quantidadeMinima: 3, precoPromocional: 4, ativo: true },
  });
  const segundoProduto = await Product.create({
    codigo: 'qr-bolo',
    nome: 'Bolo',
    categoria: 'Doces',
    tipo: 'venda',
    preco: 8,
    estoque: 20,
    unidadeVenda: 'un',
    grupoDesconto: { nome: 'Combo QR', quantidadeMinima: 3, precoPromocional: 5, ativo: true },
  });
  const tokenMesa = await mesaToken();

  const response = await request(app)
    .post(`/api/pedidos/auto-atendimento/${tokenMesa}/cotacao`)
    .send({
      itens: [
        { produtoId: String(product.id), quantidade: 2 },
        { produtoId: String(segundoProduto.id), quantidade: 1 },
      ],
    });

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    itens: [
      { produtoId: String(product.id), quantidade: 2, precoUnitario: 4, total: 8 },
      { produtoId: String(segundoProduto.id), quantidade: 1, precoUnitario: 5, total: 5 },
    ],
    total: 13,
    cotacaoToken: expect.any(String),
  });
  expect(await Comanda.countDocuments()).toBe(0);
  expect((await Product.findById(product.id)).estoque).toBe(20);
});

test('pedido exige cotação assinada e rejeita preços alterados sem efeitos parciais', async () => {
  const tokenMesa = await mesaToken();
  const body = payloadQr(tokenMesa);
  const cotacao = await request(app)
    .post(`/api/pedidos/auto-atendimento/${tokenMesa}/cotacao`)
    .send({ itens: body.itens });

  expect(cotacao.status).toBe(200);
  expect(cotacao.body.cotacaoToken).toEqual(expect.any(String));
  await Product.findByIdAndUpdate(product.id, { preco: 7 });

  const response = await pedidoQr({ ...body, cotacaoToken: cotacao.body.cotacaoToken }, 'qr-stale-quote-key');

  expect(response.status).toBe(409);
  expect(response.body.code).toBe('COTACAO_DESATUALIZADA');
  expect(await Customer.countDocuments()).toBe(0);
  expect(await Comanda.countDocuments()).toBe(0);
  expect(await StockMovement.countDocuments({ produtoId: product.id })).toBe(0);
  expect((await Product.findById(product.id)).estoque).toBe(20);
});

test('pedido sem token de cotação não altera estoque nem cria Cliente', async () => {
  const response = await request(app)
    .post('/api/pedidos/auto-atendimento')
    .set('Idempotency-Key', 'qr-without-quote-key')
    .send(payloadQr(await mesaToken()));

  expect(response.status).toBe(400);
  expect(await Customer.countDocuments()).toBe(0);
  expect(await Comanda.countDocuments()).toBe(0);
  expect((await Product.findById(product.id)).estoque).toBe(20);
});

test('repetir chave de idempotência não cria comanda nem baixa estoque novamente', async () => {
  const body = payloadQr(await mesaToken());
  const first = await pedidoQr(body, 'qr-replay-key');
  const replay = await pedidoQr(body, 'qr-replay-key');

  expect(first.status).toBe(201);
  expect(replay.status).toBe(200);
  expect(replay.body.comandaId).toBe(first.body.comandaId);
  expect(await Comanda.countDocuments()).toBe(1);
  expect((await Product.findById(product.id)).estoque).toBe(19);
});

test('requisições concorrentes com a mesma chave criam uma comanda e baixam estoque uma vez', async () => {
  const body = payloadQr(await mesaToken());
  const responses = await Promise.all([
    pedidoQr(body, 'qr-concurrent-key'),
    pedidoQr(body, 'qr-concurrent-key'),
  ]);

  expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
  expect(responses[0].body.comandaId).toBe(responses[1].body.comandaId);
  expect(await Comanda.countDocuments()).toBe(1);
  expect((await Product.findById(product.id)).estoque).toBe(19);
});

test('reutilizar chave com conteúdo diferente retorna conflito sem nova baixa', async () => {
  const tokenMesa = await mesaToken();
  const first = await pedidoQr(payloadQr(tokenMesa), 'qr-conflict-key');
  const conflict = await pedidoQr(payloadQr(tokenMesa, {
    itens: [{ produtoId: String(product.id), quantidade: 2 }],
  }), 'qr-conflict-key');

  expect(first.status).toBe(201);
  expect(conflict.status).toBe(409);
  expect(await Comanda.countDocuments()).toBe(1);
  expect((await Product.findById(product.id)).estoque).toBe(19);
});

test('estoque insuficiente não persiste Cliente nem comanda parcial', async () => {
  await Product.findByIdAndUpdate(product.id, { estoque: 0 });
  const response = await pedidoQr(payloadQr(await mesaToken()), 'qr-no-stock-key');

  expect(response.status).toBe(400);
  expect(await Customer.countDocuments()).toBe(0);
  expect(await Comanda.countDocuments()).toBe(0);
  expect(await StockMovement.countDocuments({ produtoId: product.id })).toBe(0);
  expect((await Product.findById(product.id)).estoque).toBe(0);
});

test('KDS inclui todos os itens QR e continua filtrando itens comuns por A Fazer', async () => {
  const tokenMesa = await mesaToken();
  const pedidoQrResponse = await pedidoQr(payloadQr(tokenMesa, {
    itens: [{ produtoId: String(product.id), quantidade: 1, observacao: 'sem açúcar' }],
  }), 'qr-kitchen-key');
  expect(pedidoQrResponse.status).toBe(201);

  const comandaComum = await Comanda.create({
    atendente: 'Atendente comum',
    clienteNome: 'Cliente comum',
    mesa: '2',
    tipoAtendimento: 'mesa',
    status: 'aberta',
    itens: [
      { produtoId: product.id, nome: 'Item sem preparo', precoUnitario: 6, quantidade: 1, aFazer: false },
      { produtoId: product.id, nome: 'Item em preparo', precoUnitario: 6, quantidade: 1, aFazer: true },
    ],
  });

  const response = await api('get', '/api/comandas/cozinha');
  const comandaQr = response.body.find((comanda) => comanda.origem === 'qr');
  const comandaCozinhaComum = response.body.find((comanda) => String(comanda._id) === String(comandaComum._id));

  expect(response.status).toBe(200);
  expect(comandaQr.itens).toHaveLength(1);
  expect(comandaQr.itens[0]).toMatchObject({ aFazer: false, observacao: 'sem açúcar' });
  expect(comandaQr).not.toHaveProperty('clienteTelefone');
  expect(JSON.stringify(response.body)).not.toContain('11999998888');
  expect(comandaCozinhaComum.itens.map((item) => item.nome)).toEqual(['Item em preparo']);
});
