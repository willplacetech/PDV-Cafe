const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Entregador = require('../../models/Entregador');
const RuntimeSettings = require('../../models/RuntimeSettings');
const { initializeAuth, getJwtSecret } = require('../../utils/authConfig');
const provisionarAdmin = require('../../utils/provisionarAdmin');
const provisionarDeliveryAdmin = require('../../utils/provisionarDeliveryAdmin');

const password = 'senha-segura-123';
let adminToken;
beforeEach(async () => {
  const admin = await User.create({ username: 'admin-politica', password, role: 'admin' });
  adminToken = jwt.sign({ id: admin.id, role: 'admin' }, process.env.JWT_SECRET);
});
const create = password => request(app).post('/api/auth/register').set('Authorization', `Bearer ${adminToken}`).send({ username: 'novo-politica', password });

test.each(['a'.repeat(11), 'é'.repeat(37), '🙂'.repeat(19), '🙂'.repeat(11), 123456789012])('cadastro rejeita senha inválida sem persistir: %s', async value => {
  expect((await create(value)).status).toBe(400);
  expect(await User.exists({ username: 'novo-politica' })).toBeNull();
});

test('cadastro aceita 12 caracteres e respeita o limite exato de 72 bytes sem trim', async () => {
  expect((await create(' '.repeat(2) + 'é'.repeat(34) + ' '.repeat(2))).status).toBe(201);
  const user = await User.findOne({ username: 'novo-politica' }).select('+password');
  expect(await user.matchPassword(' '.repeat(2) + 'é'.repeat(34) + ' '.repeat(2))).toBe(true);
  expect(await user.matchPassword('é'.repeat(34))).toBe(false);
  expect(user.password).toHaveLength(60);
  user.role = 'cozinha';
  await user.save();
  expect((await User.findById(user.id).select('+password')).password).toBe(user.password);
});

test('senha de 12 caracteres ASCII é aceita', async () => {
  expect((await create('abcdefghijkl')).status).toBe(201);
});

test.each(['a'.repeat(11), 'é'.repeat(37)])('reset rejeita senha fraca ou mais de 72 bytes sem revogar sessão', async value => {
  const user = await User.create({ username: 'reset-politica', password });
  const response = await request(app).patch(`/api/auth/users/${user.id}`).set('Authorization', `Bearer ${adminToken}`).send({ password: value });
  expect(response.status).toBe(400);
  const persisted = await User.findById(user.id).select('+password');
  expect(persisted.tokenVersion).toBe(0);
  expect(await persisted.matchPassword(password)).toBe(true);
});

test('reset com texto que parece hash também recebe hash, sem rehash posterior', async () => {
  const user = await User.create({ username: 'hash-politica', password });
  const hashLookingPassword = await bcrypt.hash('uma-senha-para-hash', 4);
  const response = await request(app).patch(`/api/auth/users/${user.id}`).set('Authorization', `Bearer ${adminToken}`).send({ password: hashLookingPassword });
  expect(response.status).toBe(200);
  expect(response.body.password).toBeUndefined();
  const persisted = await User.findById(user.id).select('+password');
  expect(persisted.password).not.toBe(hashLookingPassword);
  expect(await persisted.matchPassword(hashLookingPassword)).toBe(true);
  const hash = persisted.password;
  persisted.role = 'cozinha';
  await persisted.save();
  expect((await User.findById(user.id).select('+password')).password).toBe(hash);
});

test('login de senha legada de quatro caracteres permanece válido e save não exige troca', async () => {
  const user = await User.create({ username: 'legado-politica', password });
  await User.collection.updateOne({ _id: user._id }, { $set: { password: await bcrypt.hash('1234', 4) } });
  const login = await request(app).post('/api/auth/login').send({ username: user.username, password: '1234' });
  expect(login.status).toBe(200);
  expect(login.body.user.password).toBeUndefined();
  const persisted = await User.findById(user.id).select('+password');
  persisted.role = 'cozinha';
  await persisted.save();
  expect(await persisted.matchPassword('1234')).toBe(true);
});

test('login rejeita entrada maior que 72 bytes, impedindo equivalência por truncamento bcrypt', async () => {
  const user = await User.create({ username: 'limite-politica', password: 'a'.repeat(72) });
  expect((await request(app).post('/api/auth/login').send({ username: user.username, password: 'a'.repeat(72) + 'x' })).status).toBe(400);
  expect((await request(app).post('/api/auth/login').send({ username: user.username, password: 'a'.repeat(72) })).status).toBe(200);
});

test('modelos de usuário e entregador aplicam a política antes de criar o hash', async () => {
  await expect(User.create({ username: 'direto-politica', password: 'a'.repeat(11) })).rejects.toThrow('12 caracteres');
  await expect(Entregador.create({ nome: 'João', telefone: '11988888888', senhaAcesso: 'a'.repeat(11) })).rejects.toThrow('12 caracteres');
  await expect(Entregador.create({ nome: 'João', telefone: '11988888888', senhaAcesso: 'é'.repeat(37) })).rejects.toThrow('72 bytes');
});

test('cadastros Delivery de administrador e entregador rejeitam senhas novas fracas', async () => {
  const Tenant = require('../../models/Tenant');
  const tenant = await Tenant.create({ nome: 'Café Política', slug: 'cafe-politica', telefone: '11999999999', endereco: 'Rua Um' });
  const owner = await User.create({ username: 'owner-politica', email: 'owner@teste.local', password, role: 'tenant_admin', tenantId: tenant.id });
  const platform = await User.create({ username: 'platform-politica', password, role: 'admin_plataforma' });
  const ownerToken = jwt.sign({ id: owner.id, role: owner.role }, process.env.JWT_SECRET);
  const platformToken = jwt.sign({ id: platform.id, role: platform.role }, process.env.JWT_SECRET);
  expect((await request(app).post('/api/tenant/entregadores').set('Authorization', `Bearer ${ownerToken}`).send({ nome: 'João', telefone: '11988888888', senha: 'a'.repeat(11) })).status).toBe(400);
  expect((await request(app).post('/api/plataforma/entregadores').set('Authorization', `Bearer ${platformToken}`).send({ nome: 'João', telefone: '11988888888', senha: 'é'.repeat(37) })).status).toBe(400);
  expect((await request(app).post('/api/plataforma/tenants').set('Authorization', `Bearer ${platformToken}`).send({ adminEmail: 'novo@teste.local', adminSenha: 'a'.repeat(11) })).status).toBe(400);
  expect(await Entregador.countDocuments()).toBe(0);
  expect(await Tenant.countDocuments()).toBe(1);
});

test('login de entregador legado preserva espaços e senha curta persistida', async () => {
  const courier = await Entregador.create({ nome: 'João', telefone: '11988888888', senhaAcesso: password });
  await Entregador.collection.updateOne({ _id: courier._id }, { $set: { senhaAcesso: await bcrypt.hash(' 12 ', 4) } });
  expect((await request(app).post('/api/entregador/login').send({ telefone: courier.telefone, senha: ' 12 ' })).status).toBe(200);
  expect((await request(app).post('/api/entregador/login').send({ telefone: courier.telefone, senha: '12' })).status).toBe(401);
  const persisted = await Entregador.findById(courier.id).select('+senhaAcesso');
  persisted.status = 'disponivel';
  await persisted.save();
  expect(await persisted.matchPassword(' 12 ')).toBe(true);
});

test('cadastro limita nome de usuário e e-mail é validado no modelo', async () => {
  expect((await request(app).post('/api/auth/register').set('Authorization', `Bearer ${adminToken}`).send({ username: 'a'.repeat(255), password })).status).toBe(400);
  await expect(User.create({ username: 'email-politica', email: 'invalido', password })).rejects.toThrow();
});

test('provisionamento PDV e Delivery rejeita excesso de bytes e não registra contas', async () => {
  await User.deleteMany({});
  const keys = ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'DELIVERY_ADMIN_EMAIL', 'DELIVERY_ADMIN_PASSWORD'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.ADMIN_USERNAME = 'primeiro-admin';
    process.env.ADMIN_PASSWORD = 'é'.repeat(37);
    process.env.DELIVERY_ADMIN_EMAIL = 'plataforma@teste.local';
    process.env.DELIVERY_ADMIN_PASSWORD = 'é'.repeat(37);
    await expect(provisionarAdmin()).rejects.toThrow('72 bytes');
    await expect(provisionarDeliveryAdmin()).rejects.toThrow('72 bytes');
    expect(await User.countDocuments()).toBe(0);
  } finally {
    keys.forEach(key => { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; });
  }
});

test.each(['curta', 'desenvolvimento-altere-esta-chave', 'a'.repeat(64), ' '.repeat(32)])('chave JWT fraca em produção falha sem fallback: %s', async secret => {
  const previousSecret = process.env.JWT_SECRET;
  const previousEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = secret;
    await expect(initializeAuth()).rejects.toThrow('JWT_SECRET inválido');
    expect(() => getJwtSecret()).toThrow('JWT_SECRET inválido');
    expect(await RuntimeSettings.countDocuments()).toBe(0);
  } finally { process.env.JWT_SECRET = previousSecret; process.env.NODE_ENV = previousEnv; }
});

test('sem JWT_SECRET, gera e reutiliza chave de 48 bytes sem expor em consultas públicas', async () => {
  const previous = process.env.JWT_SECRET;
  try {
    delete process.env.JWT_SECRET;
    await initializeAuth();
    const secret = getJwtSecret();
    expect(secret).toMatch(/^[a-f0-9]{96}$/);
    expect((await RuntimeSettings.findById('authentication')).jwtSecret).toBeUndefined();
    await initializeAuth();
    expect(getJwtSecret()).toBe(secret);
    expect((await RuntimeSettings.findById('authentication').select('+jwtSecret')).jwtSecret).toBe(secret);
    const users = await request(app).get('/api/auth/users').set('Authorization', `Bearer ${jwt.sign({ id: (await User.findOne()).id, role: 'admin' }, secret)}`);
    expect(users.status).toBe(200);
    expect(JSON.stringify(users.body)).not.toContain(secret);
  } finally { process.env.JWT_SECRET = previous; }
});

test('chave persistida fraca falha sem reutilizar segredo de inicialização anterior', async () => {
  const previous = process.env.JWT_SECRET;
  try {
    delete process.env.JWT_SECRET;
    await initializeAuth();
    await RuntimeSettings.updateOne({ _id: 'authentication' }, { $set: { jwtSecret: 'desenvolvimento-altere-esta-chave' } });
    await expect(initializeAuth()).rejects.toThrow('JWT_SECRET inválido');
    expect(() => getJwtSecret()).toThrow('Autenticação ainda não inicializada');
  } finally { process.env.JWT_SECRET = previous; }
});
