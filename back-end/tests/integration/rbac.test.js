const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Tenant = require('../../models/Tenant');
const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const approval = require('../approvalFixture');

let tokens;
let tenant;
beforeEach(async () => {
  tokens = {};
  tenant = await Tenant.create({
    nome: 'RBAC test',
    slug: 'rbac-test',
    telefone: '11999999999',
    endereco: 'Rua de teste',
  });
  for (const role of ['operador', 'gerente', 'admin']) {
    const user = await User.create({
      username: `rbac-${role}`,
      password: 'rbac-password-123',
      role,
      tenantId: tenant._id,
    });
    tokens[role] = jwt.sign({ id: user.id, role }, process.env.JWT_SECRET);
  }
});
const get = (path, role) => request(app).get(`/api${path}`).set('Authorization', `Bearer ${tokens[role]}`);

test.each(['/customers', '/products', '/estoque/baixo', '/caixa/atual', '/dashboard', '/contabil/dre', '/auth/users'])('atendente não acessa %s diretamente pela API', async path => {
  expect((await get(path, 'operador')).status).toBe(403);
});

test('operador consulta estatísticas de entrega dentro do próprio tenant', async () => {
  expect((await get('/entregas/estatisticas', 'operador')).status).toBe(200);
});

test.each(['/customers', '/products', '/estoque/baixo', '/production/recipes', '/caixa/atual'])('gerente acessa %s', async path => {
  expect((await get(path, 'gerente')).status).toBe(200);
});

test.each(['/dashboard', '/contabil/dre', '/auth/users', '/orders', '/despesas', '/entregas/estatisticas'])('gerente não acessa gestão administrativa %s', async path => {
  expect((await get(path, 'gerente')).status).toBe(403);
});

test('lookup do PDV mantém atendimento sem expor cadastro completo', async () => {
  await Customer.create({ nome: 'Cliente teste', telefone: '11999999999', cpf: '12345678901', email: 'privado@example.test', tenantId: tenant._id });
  const response = await get('/customers/pdv', 'operador');
  expect(response.status).toBe(200);
  const cliente = response.body.find(item => item.nome === 'Cliente teste');
  expect(cliente.telefone).toBe('11999999999');
  expect(cliente.cpf).toBeUndefined();
  expect(cliente.email).toBeUndefined();
  expect((await get('/products/pdv', 'operador')).status).toBe(200);
  expect((await get('/comandas', 'gerente')).status).toBe(200);
});

test('gerente altera estoque/cadastro com a mesma confirmação de segurança do administrador', async () => {
  const product = await Product.create({ codigo: 'rbac-coffee', nome: 'Cafe', preco: 10, estoque: 5, tenantId: tenant._id });
  const response = await request(app).put(`/api/products/${product.id}`).set('Authorization', `Bearer ${tokens.gerente}`)
    .set('X-Autorizacao-Gerente', approval(tokens.gerente, 'alterar_preco')).send({ preco: 12 });
  expect(response.status).toBe(200);
  expect(response.body.preco).toBe(12);
});

test('perfil inválido não vira atendente silenciosamente; gerente não cria contas', async () => {
  const body = { username: 'nova-conta', password: 'new-password-123', role: 'superadmin' };
  const response = await request(app).post('/api/auth/register').set('Authorization', `Bearer ${tokens.admin}`)
    .set('X-Autorizacao-Gerente', approval(tokens.admin, 'criar_usuario')).send(body);
  expect(response.status).toBe(400);
  expect((await request(app).post('/api/auth/register').set('Authorization', `Bearer ${tokens.gerente}`).send({ ...body, role: 'admin' })).status).toBe(403);
});

test('permissão usa o perfil atual do banco em vez do JWT antigo', async () => {
  const claims = jwt.decode(tokens.admin);
  await User.updateOne({ _id: claims.id }, { $set: { role: 'operador' } });
  expect((await get('/auth/users', 'admin')).status).toBe(403);
});
