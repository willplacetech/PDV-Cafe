const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Tenant = require('../../models/Tenant');
const Entregador = require('../../models/Entregador');

const password = 'senha-de-teste-123';
const assinar = (user, claims = {}) => jwt.sign({ id: user.id, username: user.username, role: user.role, ...claims }, process.env.JWT_SECRET, { algorithm: 'HS256' });
const api = (method, path, token) => request(app)[method](`/api${path}`).set('Authorization', `Bearer ${token}`);
let admin, operador, adminToken, token;

beforeEach(async () => {
  admin = await User.create({ username: 'admin-revogacao', password, role: 'admin' });
  operador = await User.create({ username: 'operador-revogacao', password, role: 'operador' });
  adminToken = assinar(admin);
  token = assinar(operador);
});

test('JWT antigo sem tokenVersion continua válido para usuário existente na versão zero', async () => {
  await User.collection.updateOne({ _id: operador._id }, { $unset: { ativo: '', tokenVersion: '' } });
  const response = await api('get', '/auth/me', token);
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ id: operador.id, username: 'operador-revogacao', role: 'operador' });
});

test('JWT com usuário inexistente é recusado em /me e rotas PDV', async () => {
  const inexistente = assinar({ id: new mongoose.Types.ObjectId().toString(), username: 'ausente', role: 'admin' });
  expect((await api('get', '/auth/me', inexistente)).status).toBe(401);
  expect((await api('get', '/products', inexistente)).status).toBe(401);
});

test('excluir usuário revoga token já emitido', async () => {
  expect((await api('get', '/auth/me', token)).status).toBe(200);
  await User.deleteOne({ _id: operador._id });
  expect((await api('get', '/auth/me', token)).status).toBe(401);
});

test('desativar usuário impede uso de token e novo login', async () => {
  await User.updateOne({ _id: operador._id }, { $set: { ativo: false } });
  expect((await api('get', '/auth/me', token)).status).toBe(401);
  expect((await request(app).post('/api/auth/login').send({ username: operador.username, password })).status).toBe(401);
});

test.each([undefined, 0, 1])('incrementar versão revoga token com versão %s', async (version) => {
  const antigo = assinar(operador, version === undefined ? {} : { tokenVersion: version });
  await User.updateOne({ _id: operador._id }, { $set: { tokenVersion: 2 } });
  expect((await api('get', '/auth/me', antigo)).status).toBe(401);
});

test.each([null, '0', -1, 0.5, 1])('JWT com versão inválida ou divergente %s é recusado', async (version) => {
  expect((await api('get', '/auth/me', assinar(operador, { tokenVersion: version }))).status).toBe(401);
});

test('login emite a versão atual após revogação', async () => {
  await User.updateOne({ _id: operador._id }, { $set: { tokenVersion: 3 } });
  const response = await request(app).post('/api/auth/login').send({ username: operador.username, password });
  expect(response.status).toBe(200);
  expect(jwt.verify(response.body.token, process.env.JWT_SECRET).tokenVersion).toBe(3);
  expect((await api('get', '/auth/me', response.body.token)).status).toBe(200);
  expect(response.body.user.password).toBeUndefined();
});

test('role atual substitui privilégio de admin do token antigo', async () => {
  await User.updateOne({ _id: admin._id }, { $set: { role: 'operador', username: 'nome-atual' } });
  const me = await api('get', '/auth/me', adminToken);
  expect(me.status).toBe(200);
  expect(me.body.role).toBe('operador');
  expect(me.body.username).toBe('nome-atual');
  expect((await api('post', '/auth/register', adminToken).send({ username: 'intruso', password, role: 'admin' })).status).toBe(403);
});

test('restrição do Delivery acompanha mudança de perfil mesmo com claims antigos de admin', async () => {
  await User.updateOne({ _id: admin._id }, { $set: { role: 'tenant_admin' } });
  expect((await api('get', '/products', adminToken)).status).toBe(403);
});

test('logout exige autenticação e revoga todas as sessões anteriores', async () => {
  expect((await request(app).post('/api/auth/logout')).status).toBe(401);
  const outroToken = assinar(operador, { tokenVersion: 0 });
  const response = await api('post', '/auth/logout', token);
  expect(response.status).toBe(204);
  expect(response.headers['set-cookie'][0]).toContain('pdv_token=;');
  expect((await api('get', '/auth/me', token)).status).toBe(401);
  expect((await api('get', '/auth/me', outroToken)).status).toBe(401);
  expect((await User.findById(operador.id)).tokenVersion).toBe(1);
});

test('admin lista usuários PDV sem expor hashes de senha', async () => {
  const response = await api('get', '/auth/users', adminToken);
  expect(response.status).toBe(200);
  expect(response.body.find(user => user.id === operador.id)).toEqual({ id: operador.id, username: operador.username, role: 'operador', ativo: true });
  expect(response.body.every(user => user.password === undefined)).toBe(true);
  expect((await api('get', '/auth/users', token)).status).toBe(403);
});

test('admin bloqueia e reativa usuário mantendo tokens antigos revogados', async () => {
  expect((await api('patch', `/auth/users/${operador.id}`, adminToken).send({ ativo: false })).status).toBe(200);
  expect((await api('get', '/auth/me', token)).status).toBe(401);
  expect((await api('patch', `/auth/users/${operador.id}`, adminToken).send({ ativo: true })).status).toBe(200);
  expect((await api('get', '/auth/me', token)).status).toBe(401);
  expect((await User.findById(operador.id)).tokenVersion).toBe(2);
});

test('admin altera role e revoga sessões anteriores', async () => {
  const response = await api('patch', `/auth/users/${operador.id}`, adminToken).send({ role: 'cozinha' });
  expect(response.status).toBe(200);
  expect(response.body.role).toBe('cozinha');
  expect((await api('get', '/auth/me', token)).status).toBe(401);
  expect((await User.findById(operador.id)).tokenVersion).toBe(1);
});

test('admin redefine senha com hash e revoga sessões anteriores', async () => {
  const response = await api('patch', `/auth/users/${operador.id}`, adminToken).send({ password: 'nova-senha-de-teste-456' });
  expect(response.status).toBe(200);
  expect(response.body.password).toBeUndefined();
  expect((await api('get', '/auth/me', token)).status).toBe(401);
  const atualizado = await User.findById(operador.id).select('+password');
  expect(atualizado.password).not.toBe('nova-senha-de-teste-456');
  expect(await atualizado.matchPassword(password)).toBe(false);
  expect(await atualizado.matchPassword('nova-senha-de-teste-456')).toBe(true);
  const login = await request(app).post('/api/auth/login').send({ username: operador.username, password: 'nova-senha-de-teste-456' });
  expect(login.status).toBe(200);
  expect((await api('get', '/auth/me', login.body.token)).status).toBe(200);
});

test('operador não pode alterar usuário e entradas inválidas não modificam segurança', async () => {
  expect((await api('patch', `/auth/users/${admin.id}`, token).send({ ativo: false })).status).toBe(403);
  for (const body of [{}, { ativo: 'false' }, { role: 'tenant_admin' }, { password: 1234 }, { tokenVersion: 0 }, { ativo: true, username: 'outro' }]) {
    expect((await api('patch', `/auth/users/${operador.id}`, adminToken).send(body)).status).toBe(400);
  }
  expect((await api('patch', '/auth/users/invalido', adminToken).send({ ativo: false })).status).toBe(400);
  expect((await api('patch', `/auth/users/${new mongoose.Types.ObjectId()}`, adminToken).send({ ativo: false })).status).toBe(404);
  const atualizado = await User.findById(operador.id);
  expect(atualizado.ativo).toBe(true);
  expect(atualizado.tokenVersion).toBe(0);
  expect(atualizado.role).toBe('operador');
});

test('admin PDV não altera contas Delivery e alterações concorrentes preservam revogação', async () => {
  const delivery = await User.create({ username: 'plataforma-revogacao', password, role: 'admin_plataforma' });
  expect((await api('patch', `/auth/users/${delivery.id}`, adminToken).send({ role: 'admin' })).status).toBe(404);
  const responses = await Promise.all([
    api('patch', `/auth/users/${operador.id}`, adminToken).send({ role: 'cozinha' }),
    api('patch', `/auth/users/${operador.id}`, adminToken).send({ ativo: false }),
  ]);
  expect(responses.map(response => response.status)).toEqual([200, 200]);
  const atualizado = await User.findById(operador.id);
  expect(atualizado.tokenVersion).toBe(2);
  expect(atualizado.role).toBe('cozinha');
  expect(atualizado.ativo).toBe(false);
  expect((await api('get', '/auth/me', token)).status).toBe(401);
});

test('JWT Delivery de usuário continua válido e respeita versão e estado atuais', async () => {
  const tenant = await Tenant.create({ nome: 'Café', slug: 'cafe-revogacao', telefone: '11999999999', endereco: 'Rua Um' });
  const user = await User.create({ username: 'tenant-revogacao', password, role: 'tenant_admin', tenantId: tenant.id });
  const tenantToken = assinar(user, { tenantId: tenant.id });
  expect((await api('get', '/tenant/configuracao', tenantToken)).status).toBe(200);
  expect((await api('get', '/products', tenantToken)).status).toBe(403);
  await User.updateOne({ _id: user._id }, { $set: { ativo: false } });
  expect((await api('get', '/tenant/configuracao', tenantToken)).status).toBe(401);
  await User.updateOne({ _id: user._id }, { $set: { ativo: true, tokenVersion: 1 } });
  expect((await api('get', '/tenant/configuracao', tenantToken)).status).toBe(401);
  expect((await api('get', '/tenant/configuracao', assinar(user, { tokenVersion: 1 }))).status).toBe(200);
});

test('entregador sem User usa validação live do deliveryAuth e nunca acessa PDV ou /me', async () => {
  const courier = await Entregador.create({ nome: 'Entregador', telefone: '11988888888', senhaAcesso: password });
  const courierToken = jwt.sign({ role: 'entregador', entregadorId: courier.id }, process.env.JWT_SECRET);
  expect((await api('get', '/entregador/pedidos', courierToken)).status).toBe(200);
  expect((await api('get', '/products', courierToken)).status).toBe(403);
  expect((await api('get', '/auth/me', courierToken)).status).toBe(403);
  await Entregador.updateOne({ _id: courier._id }, { $set: { ativo: false } });
  expect((await api('get', '/entregador/pedidos', courierToken)).status).toBe(403);
});

test('token de sistema sem User continua integrado e respeita bloqueio do tenant', async () => {
  const tenant = await Tenant.create({ nome: 'Café', slug: 'cafe-sistema', telefone: '11999999999', endereco: 'Rua Um' });
  const sistemaToken = jwt.sign({ role: 'sistema', tenantId: tenant.id }, process.env.JWT_SECRET);
  const pedido = { idTemporario: 'venda-sistema-revogacao', origem: { nomeCliente: 'Maria', telefone: '11988888888', endereco: { rua: 'Rua Um', numero: '12', bairro: 'Centro' } }, itens: [{ descricao: 'Café', quantidade: 1, precoUnitario: 8 }], valorTotal: 8, taxaEntrega: 0 };
  expect((await api('post', '/pedidos/integracao', sistemaToken).send(pedido)).status).toBe(201);
  expect((await api('get', '/products', sistemaToken)).status).toBe(403);
  expect((await api('get', '/auth/me', sistemaToken)).status).toBe(403);
  await Tenant.updateOne({ _id: tenant._id }, { $set: { ativo: false } });
  expect((await api('post', '/pedidos/integracao', sistemaToken).send(pedido)).status).toBe(403);
});

test('login Delivery rejeita conta bloqueada e emite versão atual após logout', async () => {
  const tenant = await Tenant.create({ nome: 'Café', slug: 'cafe-login', telefone: '11999999999', endereco: 'Rua Um' });
  const user = await User.create({ username: 'login-delivery', email: 'dono-revogacao@teste.local', password, role: 'tenant_admin', tenantId: tenant.id });
  await User.updateOne({ _id: user._id }, { $set: { tokenVersion: 4 } });
  const login = await request(app).post('/api/delivery/login').send({ email: user.email, senha: password });
  expect(login.status).toBe(200);
  expect(jwt.verify(login.body.token, process.env.JWT_SECRET).tokenVersion).toBe(4);
  expect((await api('get', '/tenant/configuracao', login.body.token)).status).toBe(200);
  expect((await api('post', '/auth/logout', login.body.token)).status).toBe(204);
  expect((await api('get', '/tenant/configuracao', login.body.token)).status).toBe(401);
  const novoLogin = await request(app).post('/api/delivery/login').send({ email: user.email, senha: password });
  expect(novoLogin.status).toBe(200);
  expect((await api('get', '/tenant/configuracao', novoLogin.body.token)).status).toBe(200);
  await User.updateOne({ _id: user._id }, { $set: { ativo: false } });
  expect((await request(app).post('/api/delivery/login').send({ email: user.email, senha: password })).status).toBe(401);
});
