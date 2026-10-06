const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Tenant = require('../../models/Tenant');
const PedidoEntrega = require('../../models/PedidoEntrega');
const Entregador = require('../../models/Entregador');
const Comanda = require('../../models/Comanda');
const Product = require('../../models/Product');
const outbox = require('../../utils/deliveryOutbox');

let tenant, outro, token, tokenOutro, platformToken;
const dados = () => ({
  origem: { nomeCliente: 'Maria', telefone: '11988888888', endereco: { rua: 'Rua Um', numero: '12', bairro: 'Centro' } },
  itens: [{ descricao: 'Café', quantidade: 2, precoUnitario: 8 }], valorTotal: 16, taxaEntrega: 4,
});
const assinar = (user) => jwt.sign({ id: user.id, username: user.username, role: user.role, tenantId: user.tenantId }, process.env.JWT_SECRET);
const api = (method, path, auth = token) => request(app)[method](`/api${path}`).set('Authorization', `Bearer ${auth}`);
const criarPedido = async () => (await api('post', '/tenant/pedidos').send(dados())).body;
const criarEntregador = async () => (await api('post', '/tenant/entregadores').send({ nome: 'João', telefone: '11977777777', senha: 'senha-segura-123' })).body;

beforeAll(async () => { await Promise.all([Tenant.init(), PedidoEntrega.init()]); });
beforeEach(async () => {
  tenant = await Tenant.create({ nome: 'Café', slug: 'cafe', telefone: '11999999999', endereco: 'Rua Um' });
  outro = await Tenant.create({ nome: 'Mercado', slug: 'mercado', telefone: '11999999998', endereco: 'Rua Dois' });
  token = assinar(await User.create({ username: 'dono@cafe.test', email: 'dono@cafe.test', password: 'senha-segura-123', role: 'tenant_admin', tenantId: tenant._id }));
  tokenOutro = assinar(await User.create({ username: 'dono@mercado.test', email: 'dono@mercado.test', password: 'senha-segura-123', role: 'tenant_admin', tenantId: outro._id }));
  platformToken = assinar(await User.create({ username: 'plataforma@teste.test', email: 'plataforma@teste.test', password: 'senha-segura-123', role: 'admin_plataforma' }));
});

test('login por email reutiliza User e não aceita login de PDV no portal', async () => {
  const login = await request(app).post('/api/delivery/login').send({ email: 'dono@cafe.test', senha: 'senha-segura-123' });
  expect(login.status).toBe(200);
  expect(login.body.user.tenantId).toBe(String(tenant._id));
  expect(login.body.user.password).toBeUndefined();
  expect((await request(app).post('/api/delivery/login').send({ email: { $ne: '' }, senha: 'x' })).status).toBe(400);
});

test('comércio não pode criar, listar, cancelar ou despachar pedido de outro tenant', async () => {
  const pedido = await criarPedido();
  expect(pedido.tenantId).toBe(String(tenant._id));
  const forjado = await api('post', '/tenant/pedidos').send({ ...dados(), tenantId: outro.id, status: 'entregue' });
  expect(forjado.body.tenantId).toBe(String(tenant._id));
  expect(forjado.body.status).toBe('pendente');
  expect((await api('get', '/tenant/pedidos', tokenOutro)).body.pedidos).toHaveLength(0);
  expect((await api('post', `/tenant/pedidos/${pedido._id}/cancelar`, tokenOutro).send({ motivo: 'Teste' })).status).toBe(404);
});

test('despacho e entrega exigem o entregador atribuído e transições válidas', async () => {
  const entregador = await criarEntregador();
  expect(entregador.senhaAcesso).toBeUndefined();
  const login = await request(app).post('/api/entregador/login').send({ telefone: '11977777777', senha: 'senha-segura-123' });
  expect(login.status).toBe(200);
  const courierToken = login.body.token;
  expect((await api('post', '/entregador/disponibilidade', courierToken).send({ disponivel: true })).status).toBe(200);
  const pedido = await criarPedido();
  const despacho = await api('post', `/tenant/pedidos/${pedido._id}/despachar`).send({ entregadorId: entregador._id });
  expect(despacho.status).toBe(200);
  expect((await api('post', `/tenant/pedidos/${pedido._id}/despachar`).send({ entregadorId: entregador._id })).status).toBe(409);
  expect((await api('post', `/entregador/pedido/${pedido._id}/status`, courierToken).send({ novoStatus: 'entregue' })).status).toBe(409);
  expect((await api('post', `/entregador/pedido/${pedido._id}/status`, courierToken).send({ novoStatus: 'a_caminho' })).status).toBe(200);
  expect((await api('post', `/entregador/pedido/${pedido._id}/status`, courierToken).send({ novoStatus: 'entregue' })).status).toBe(200);
  expect((await api('post', `/tenant/pedidos/${pedido._id}/cancelar`).send({ motivo: 'Tarde' })).status).toBe(409);
  const salvo = await PedidoEntrega.findById(pedido._id);
  expect(salvo.statusHistorico.map(h => h.status)).toEqual(['pendente', 'despachado', 'a_caminho', 'entregue']);
  expect(salvo.statusHistorico[3].por.tipo).toBe('entregador');
});

test('rastreio público e WhatsApp não expõem informações privadas nem dependem de provedor', async () => {
  const pedido = await criarPedido();
  const rastreio = await request(app).get(`/api/rastreio/${pedido.tokenRastreamento}`);
  expect(rastreio.status).toBe(200);
  expect(rastreio.body).toMatchObject({ status: 'pendente', nomeComercio: 'Café' });
  for (const campo of ['_id', 'tenantId', 'origem', 'entregadorId', 'valorTotal']) expect(rastreio.body[campo]).toBeUndefined();
  expect(rastreio.body.statusHistorico[0].por).toBeUndefined();
  expect((await request(app).get(`/api/rastreio/${pedido._id}`)).status).toBe(404);
  const whatsapp = await api('post', `/tenant/pedidos/${pedido._id}/enviar-whatsapp`).send({});
  expect(whatsapp.status).toBe(200);
  expect(whatsapp.body.mensagemPronta).toContain(`/pedido/${pedido.tokenRastreamento}`);
  expect(whatsapp.body.enviado).toBe(false);
});

test('tenant desativado perde acesso mesmo com JWT anterior', async () => {
  await Tenant.updateOne({ _id: tenant._id }, { ativo: false });
  expect((await api('get', '/tenant/pedidos')).status).toBe(403);
});

test('integração PDV exige vínculo e não duplica pedido no reenvio', async () => {
  const pdv = await User.create({ username: 'pdv-delivery', password: 'senha-segura-123', role: 'admin', tenantId: tenant._id });
  const pdvToken = assinar(pdv);
  const payload = { ...dados(), tenantSlug: 'cafe', idTemporario: 'venda-pdv-1' };
  const primeira = await api('post', '/pedidos/integracao', pdvToken).send(payload);
  expect(primeira.status).toBe(201);
  expect((await api('post', '/pedidos/integracao', pdvToken).send(payload)).body._id).toBe(primeira.body._id);
  expect((await api('post', '/pedidos/integracao', pdvToken).send({ ...payload, tenantSlug: 'mercado' })).status).toBe(403);
  expect(await PedidoEntrega.countDocuments({ tenantId: tenant._id })).toBe(1);
});

test('plataforma cria comércio e usuário sem permitir acesso do tenant ao CRUD global', async () => {
  const criado = await api('post', '/plataforma/tenants', platformToken).send({ nome: 'Padaria', slug: 'padaria', telefone: '11955555555', endereco: 'Rua Três', adminEmail: 'dono@padaria.test', adminSenha: 'senha-segura-123' });
  expect(criado.status).toBe(201);
  expect(await User.exists({ email: 'dono@padaria.test', tenantId: criado.body._id })).toBeTruthy();
  expect((await api('get', '/plataforma/tenants')).status).toBe(403);
});

test('paginação, coordenadas e entrada externa são validadas', async () => {
  expect((await api('get', '/tenant/pedidos?data=2026-99-99')).status).toBe(400);
  expect((await api('post', '/tenant/pedidos').send({ ...dados(), valorTotal: -1 })).status).toBe(400);
  expect((await api('post', '/tenant/pedidos/invalido/despachar').send({ entregadorId: 'x' })).status).toBe(400);
});

test('sessões DeliveryLink não acessam dados globais do PDV', async () => {
  expect((await api('get', '/products', token)).status).toBe(403);
  expect((await api('get', '/insumos', platformToken)).status).toBe(403);
});

test('entregador livre recebe pedidos de vários tenants, vinculado não cruza comércios', async () => {
  const livre = await api('post', '/plataforma/entregadores', platformToken).send({ nome: 'Livre', telefone: '11966666666', senha: 'senha-segura-123' });
  const entregadorId = livre.body._id;
  await Entregador.updateOne({ _id: entregadorId }, { status: 'disponivel' });
  const primeiro = await criarPedido();
  const segundo = (await api('post', '/tenant/pedidos', tokenOutro).send(dados())).body;
  expect((await api('post', `/tenant/pedidos/${primeiro._id}/despachar`).send({ entregadorId })).status).toBe(200);
  expect((await api('post', `/tenant/pedidos/${segundo._id}/despachar`, tokenOutro).send({ entregadorId })).status).toBe(200);
  const login = await request(app).post('/api/entregador/login').send({ telefone: '11966666666', senha: 'senha-segura-123' });
  const lista = await api('get', '/entregador/pedidos', login.body.token);
  expect(lista.body.pedidos).toHaveLength(2);
  const vinculado = await criarEntregador();
  await Entregador.updateOne({ _id: vinculado._id }, { status: 'disponivel' });
  const terceiro = (await api('post', '/tenant/pedidos', tokenOutro).send(dados())).body;
  expect((await api('post', `/tenant/pedidos/${terceiro._id}/despachar`, tokenOutro).send({ entregadorId: vinculado._id })).status).toBe(400);
});

test('token de integração de sistema é restrito ao comércio e não acessa o portal', async () => {
  const credencial = await api('post', `/plataforma/tenants/${tenant.id}/token-integracao`, platformToken).send({});
  const payload = { ...dados(), tenantSlug: tenant.slug, idTemporario: 'venda-sistema-1' };
  expect((await api('post', '/pedidos/integracao', credencial.body.token).send(payload)).status).toBe(201);
  expect((await api('get', '/tenant/pedidos', credencial.body.token)).status).toBe(403);
  expect((await api('post', '/pedidos/integracao', credencial.body.token).send({ ...payload, tenantSlug: outro.slug })).status).toBe(403);
});

test('PDV persiste entrega na venda e processa idempotentemente sem bloquear em erro', async () => {
  const pdv = await User.create({ username: 'operador-entrega', password: 'senha-segura-123', role: 'admin', tenantId: tenant._id });
  const produto = await Product.create({ codigo: 'DEL-1', nome: 'Café', tipo: 'venda', categoria: 'Bebidas Quentes', preco: 8, estoque: 10 });
  const entrega = { telefone: '11988888888', endereco: dados().origem.endereco, taxaEntrega: 4 };
  const venda = await api('post', '/comandas', assinar(pdv)).send({ clienteNome: 'Maria', itens: [{ produtoId: produto.id, quantidade: 1 }], entrega });
  expect(venda.status).toBe(201);
  expect(venda.body.entrega.status).toBe('pendente');
  await outbox.processar(); await outbox.processar();
  const comanda = await Comanda.findById(venda.body._id);
  expect(comanda.entrega.status).toBe('processado');
  expect(await PedidoEntrega.countDocuments({ referenciaIntegracao: `comanda:${comanda.id}` })).toBe(1);
  const invalida = await api('post', '/comandas', assinar(pdv)).send({ clienteNome: 'Maria', itens: [{ produtoId: produto.id, quantidade: 1 }], entrega: { telefone: '123' } });
  expect(invalida.status).toBe(201);
  await outbox.processar();
  expect((await Comanda.findById(invalida.body._id)).entrega.status).toBe('erro');
});

test('duas confirmações simultâneas gravam uma única transição', async () => {
  const entregador = await criarEntregador();
  await Entregador.updateOne({ _id: entregador._id }, { status: 'disponivel' });
  const pedido = await criarPedido();
  await api('post', `/tenant/pedidos/${pedido._id}/despachar`).send({ entregadorId: entregador._id });
  const courierToken = jwt.sign({ role: 'entregador', entregadorId: entregador._id }, process.env.JWT_SECRET);
  const respostas = await Promise.all([1, 2].map(() => api('post', `/entregador/pedido/${pedido._id}/status`, courierToken).send({ novoStatus: 'a_caminho' })));
  expect(respostas.map(r => r.status).sort()).toEqual([200, 409]);
  expect((await PedidoEntrega.findById(pedido._id)).statusHistorico.filter(h => h.status === 'a_caminho')).toHaveLength(1);
});

test('entregador diferente não altera pedido e GPS desaparece após finalizar', async () => {
  const entregador = await criarEntregador();
  await Entregador.updateOne({ _id: entregador._id }, { status: 'disponivel' });
  const pedido = await criarPedido();
  await api('post', `/tenant/pedidos/${pedido._id}/despachar`).send({ entregadorId: entregador._id });
  const courierToken = jwt.sign({ role: 'entregador', entregadorId: entregador._id }, process.env.JWT_SECRET);
  const outroEntregador = await Entregador.create({ nome: 'Outro', telefone: '11944444444', senhaAcesso: 'senha-segura-123' });
  const outroToken = jwt.sign({ role: 'entregador', entregadorId: outroEntregador._id }, process.env.JWT_SECRET);
  expect((await api('post', `/entregador/pedido/${pedido._id}/status`, outroToken).send({ novoStatus: 'a_caminho' })).status).toBe(404);
  await api('post', `/entregador/pedido/${pedido._id}/status`, courierToken).send({ novoStatus: 'a_caminho' });
  expect((await api('post', '/entregador/posicao', courierToken).send({ lat: 91, lng: 0 })).status).toBe(400);
  await api('post', '/entregador/posicao', courierToken).send({ lat: -23.5, lng: -46.6 });
  expect((await request(app).get(`/api/rastreio/${pedido.tokenRastreamento}`)).body.posicaoEntregador).toEqual({ lat: -23.5, lng: -46.6 });
  await api('post', `/entregador/pedido/${pedido._id}/status`, courierToken).send({ novoStatus: 'entregue' });
  expect((await request(app).get(`/api/rastreio/${pedido.tokenRastreamento}`)).body.posicaoEntregador).toBeUndefined();
});

test('SSE publica estado sem dados privados e remove assinatura ao desconectar', async () => {
  const http = require('node:http');
  const service = require('../../utils/deliveryService');
  const pedido = await criarPedido();
  const server = await new Promise(resolve => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
  let fechar;
  const fechado = new Promise(resolve => { fechar = resolve; });
  server.once('request', (req, res) => res.once('close', fechar));
  let client;
  let response;
  const mensagens = [];
  let notificar;
  const aguardar = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SSE não publicou o estado esperado')), 5000);
    notificar = valor => { clearTimeout(timer); resolve(valor); };
  });
  try {
    const inicial = aguardar();
    client = http.get(`http://127.0.0.1:${server.address().port}/api/rastreio/${pedido.tokenRastreamento}/stream`, res => {
      response = res;
      let buffer = '';
      res.on('data', chunk => {
        buffer += chunk.toString();
        let fim;
        while ((fim = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, fim); buffer = buffer.slice(fim + 2);
          if (frame.startsWith('data: ')) { const valor = JSON.parse(frame.slice(6)); mensagens.push(valor); notificar?.(valor); }
        }
      });
    });
    expect((await inicial).status).toBe('pendente');
    const cancelado = aguardar();
    await api('post', `/tenant/pedidos/${pedido._id}/cancelar`).send({ motivo: 'Cliente desistiu' });
    expect((await cancelado).status).toBe('cancelado');
    expect(mensagens.every(m => !m.origem && !m._id && !m.tenantId)).toBe(true);
  } finally {
    response?.destroy(); client?.destroy();
    await fechado;
    await new Promise(resolve => server.close(resolve));
  }
  expect(service.eventos.listenerCount(pedido.tokenRastreamento)).toBe(0);
});

test('falha do provedor WhatsApp retorna mensagem de contingência', async () => {
  const pedido = await criarPedido();
  const urlAnterior = process.env.WHATSAPP_API_URL;
  const tokenAnterior = process.env.WHATSAPP_ACCESS_TOKEN;
  process.env.WHATSAPP_API_URL = 'https://graph.facebook.com/test/messages';
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-only-token';
  const fetchMock = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Provedor indisponível'));
  try {
    const resposta = await api('post', `/tenant/pedidos/${pedido._id}/enviar-whatsapp`).send({});
    expect(resposta.status).toBe(200);
    expect(resposta.body.enviado).toBe(false);
    expect(resposta.body.mensagemPronta).toContain(pedido.tokenRastreamento);
  } finally {
    fetchMock.mockRestore();
    if (urlAnterior === undefined) delete process.env.WHATSAPP_API_URL; else process.env.WHATSAPP_API_URL = urlAnterior;
    if (tokenAnterior === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN; else process.env.WHATSAPP_ACCESS_TOKEN = tokenAnterior;
  }
});

test('venda com JWT antigo preserva comércio de origem após reatribuir operador', async () => {
  const pdv = await User.create({ username: 'pdv-antigo', password: 'senha-segura-123', role: 'admin', tenantId: tenant._id });
  const jwtAntigo = jwt.sign({ id: pdv.id, username: pdv.username, role: pdv.role }, process.env.JWT_SECRET);
  const produto = await Product.create({ codigo: 'DEL-2', nome: 'Café', tipo: 'venda', categoria: 'Bebidas Quentes', preco: 8, estoque: 10 });
  const venda = await api('post', '/comandas', jwtAntigo).send({ clienteNome: 'Maria', itens: [{ produtoId: produto.id, quantidade: 1 }], entrega: { telefone: '11988888888', endereco: dados().origem.endereco } });
  expect(venda.status).toBe(201);
  await User.updateOne({ _id: pdv._id }, { tenantId: outro._id });
  await outbox.processar();
  expect(await PedidoEntrega.countDocuments({ tenantId: outro._id })).toBe(0);
  expect((await Comanda.findById(venda.body._id)).entrega.tenantId.toString()).toBe(tenant.id);
});

test('SSE desconectado durante consulta inicial não conserva listeners', async () => {
  const http = require('node:http');
  const service = require('../../utils/deliveryService');
  const pedido = await criarPedido();
  const original = service.rastrear;
  let iniciar, liberar, terminar, fechar;
  const iniciado = new Promise(resolve => { iniciar = resolve; });
  const liberado = new Promise(resolve => { liberar = resolve; });
  const terminado = new Promise(resolve => { terminar = resolve; });
  const fechado = new Promise(resolve => { fechar = resolve; });
  const spy = jest.spyOn(service, 'rastrear').mockImplementationOnce(async token => {
    iniciar(); await liberado;
    const resultado = await original(token); terminar(); return resultado;
  });
  const server = await new Promise(resolve => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
  server.once('request', (req, res) => res.once('close', fechar));
  const client = http.get(`http://127.0.0.1:${server.address().port}/api/rastreio/${pedido.tokenRastreamento}/stream`);
  client.on('error', () => {});
  try {
    await iniciado; client.destroy(); await fechado; liberar(); await terminado;
    await new Promise(resolve => setImmediate(resolve));
    expect(service.eventos.listenerCount(pedido.tokenRastreamento)).toBe(0);
  } finally {
    liberar(); spy.mockRestore(); client.destroy();
    service.eventos.removeAllListeners(pedido.tokenRastreamento);
    await new Promise(resolve => server.close(resolve));
  }
});

test('taxa de entrega é cobrada no caixa, preservada no recálculo e no fechamento', async () => {
  const pdv = await User.create({ username: 'caixa-delivery', password: 'senha-segura-123', role: 'admin', tenantId: tenant._id });
  const pdvToken = assinar(pdv);
  const produto = await Product.create({ codigo: 'DEL-3', nome: 'Café', tipo: 'venda', categoria: 'Bebidas Quentes', preco: 8, estoque: 10 });
  const venda = await api('post', '/comandas', pdvToken).send({ clienteNome: 'Maria', itens: [{ produtoId: produto.id, quantidade: 1 }], entrega: { telefone: '11988888888', endereco: dados().origem.endereco, taxaEntrega: 4 } });
  expect(venda.body.valorTotal).toBe(12);
  expect(venda.body.saldoDevedor).toBe(12);
  const alterada = await api('patch', `/comandas/${venda.body._id}/itens/${venda.body.itens[0]._id}`, pdvToken).send({ quantidade: 2 });
  expect(alterada.body.valorTotal).toBe(20);
  const parcial = await api('patch', `/comandas/${venda.body._id}/receber-parcial`, pdvToken).set('Idempotency-Key', require('crypto').randomUUID()).send({ valorRecebido: 5, formaPagamento: 'dinheiro' });
  expect(parcial.status).toBe(200);
  expect(parcial.body.saldoDevedor).toBe(15);
  const fechar = await api('post', `/comandas/${venda.body._id}/fechar`, pdvToken).set('Idempotency-Key', require('crypto').randomUUID()).send({ metodoPagamento: 'dinheiro', desconto: 0 });
  expect(fechar.status).toBe(200);
  expect(fechar.body.pedido).toMatchObject({ subtotal: 16, taxaEntrega: 4, total: 20 });
  expect(fechar.body.comanda.valorPago).toBe(20);
  await outbox.processar();
  const entrega = await PedidoEntrega.findOne({ referenciaIntegracao: `comanda:${venda.body._id}` });
  expect(entrega.valorTotal + entrega.taxaEntrega).toBe(20);
});

test('adicionar itens a pedido A Receber conserva a taxa de entrega e o saldo', async () => {
  const pdv = await User.create({ username: 'caixa-credito-delivery', password: 'senha-segura-123', role: 'admin', tenantId: tenant._id });
  const pdvToken = assinar(pdv);
  const produto = await Product.create({ codigo: 'DEL-4', nome: 'Cafe', tipo: 'venda', categoria: 'Bebidas Quentes', preco: 8, estoque: 10 });
  const venda = await api('post', '/comandas', pdvToken).send({ clienteNome: 'Maria', itens: [{ produtoId: produto.id, quantidade: 1 }], entrega: { telefone: '11988888888', endereco: dados().origem.endereco, taxaEntrega: 4 } });
  const fechar = await api('post', `/comandas/${venda.body._id}/fechar`, pdvToken).set('Idempotency-Key', require('crypto').randomUUID()).send({ metodoPagamento: 'credito_loja', desconto: 0 });
  expect(fechar.status).toBe(200);
  const adicionado = await api('patch', `/orders/${fechar.body.pedido._id}/adicionar-itens`, pdvToken).send({ itens: [{ produtoId: produto.id, quantidade: 1 }] });
  expect(adicionado.status).toBe(200);
  expect(adicionado.body).toMatchObject({ subtotal: 16, taxaEntrega: 4, total: 20 });
  const comanda = await Comanda.findById(venda.body._id);
  expect(comanda.valorTotal).toBe(20);
  expect(comanda.saldoDevedor).toBe(20);
});
