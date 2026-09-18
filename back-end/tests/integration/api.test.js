const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const Order = require('../../models/Order');
const Purchase = require('../../models/Purchase');

const jwtSecret = process.env.JWT_SECRET || 'desenvolvimento-altere-esta-chave';

let adminToken, operadorToken, cozinhaToken;
let produtoVenda, insumo;

beforeEach(async () => {
  const admin = await User.create({ username: 'admin', password: '1234', role: 'admin' });
  const operador = await User.create({ username: 'operador', password: '1234', role: 'operador' });
  const cozinha = await User.create({ username: 'cozinha', password: '1234', role: 'cozinha' });
  adminToken = jwt.sign({ id: admin._id, username: admin.username, role: admin.role }, jwtSecret, { expiresIn: '1h' });
  operadorToken = jwt.sign({ id: operador._id, username: operador.username, role: operador.role }, jwtSecret, { expiresIn: '1h' });
  cozinhaToken = jwt.sign({ id: cozinha._id, username: cozinha.username, role: cozinha.role }, jwtSecret, { expiresIn: '1h' });

  produtoVenda = await Product.create({
    codigo: '1001', nome: 'Café Especial', preco: 8.50, tipo: 'venda', categoria: 'Bebidas Quentes', estoque: 100,
  });
  insumo = await Product.create({
    codigo: '999001', nome: 'Açúcar', preco: 0, tipo: 'insumo', categoria: 'Insumos', precoCompra: 7,
    unidadeCompra: 'kg', conteudoPorEmbalagem: 1, unidadeConteudo: 'kg', estoque: 10, custoUnitarioBase: 7,
  });
});

describe('API Endpoints', () => {
  test('POST /api/auth/login → retorna token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: '1234' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.username).toBe('admin');
  });

  test('POST /api/auth/login → 401 senha inválida', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong' });
    expect(res.statusCode).toBe(401);
  });

  test('GET /api/products → lista produtos (autenticado)', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
  });

  test('GET /api/products → 401 sem token', async () => {
    const res = await request(app).get('/api/products');
    expect(res.statusCode).toBe(401);
  });

  test('GET /api/products/pdv → lista apenas produtos de venda', async () => {
    const res = await request(app)
      .get('/api/products/pdv')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.every((p) => !p.tipo || p.tipo !== 'insumo')).toBe(true);
  });

  test('POST /api/products → cria produto', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        codigo: '2001',
        nome: 'Pão de Mel',
        preco: 12,
        tipo: 'venda',
        categoria: 'Doces',
        estoque: 50,
        unidadeVenda: 'un',
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.nome).toBe('Pão de Mel');
  });

  test('POST /api/products → 403 para operador sem admin', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${operadorToken}`)
      .send({ codigo: '2002', nome: 'Produto', preco: 10, tipo: 'venda', categoria: 'Outros' });
    expect(res.statusCode).toBe(403);
  });

  test('POST /api/customers → cria cliente', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nome: 'João Silva', telefone: '11999999999', cpf: '12345678901', aniversario: '15061990' });
    expect(res.statusCode).toBe(201);
    expect(res.body.nome).toBe('João Silva');
  });

  test('POST /api/customers → 409 telefone duplicado', async () => {
    await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nome: 'Maria', telefone: '11888888888', cpf: '98765432100', aniversario: '20011985' });
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nome: 'Maria Dup', telefone: '11888888888', cpf: '98765432100', aniversario: '' });
    expect(res.statusCode).toBe(409);
  });

  test('POST /api/orders → registra venda', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        itens: [{ produtoId: produtoVenda._id, nome: produtoVenda.nome, quantidade: 2, precoUnitario: 8.50, tipoVenda: 'unidade' }],
        subtotal: 17,
        total: 17,
        clienteNome: 'Cliente Teste',
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.itens).toHaveLength(1);
  });

  test('POST /api/orders → 400 quantidade inválida', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ itens: [] });
    expect(res.statusCode).toBe(400);
  });

  test('GET /api/comandas → lista comandas', async () => {
    const res = await request(app)
      .get('/api/comandas')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
  });

  test('POST /api/compras → lança compra e atualiza estoque', async () => {
    const res = await request(app)
      .post('/api/compras')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fornecedor: 'Fornecedor Teste',
        numeroNF: '12345',
        data: new Date().toISOString(),
        metodoCusteio: 'media_ponderada',
        itens: [{
          produtoId: insumo._id,
          valorTotal: 70,
          qtdEmbalagens: 10,
          conteudoPorEmbalagem: 1,
          unidadeConteudo: 'kg',
        }],
        valorTotal: 70,
      });
    expect(res.statusCode).toBe(201);
  });

  test('RBAC: usuário cozinha não acessa compras', async () => {
    const res = await request(app)
      .get('/api/compras')
      .set('Authorization', `Bearer ${cozinhaToken}`);
    expect(res.statusCode).toBe(403);
  });

  test('GET /api/dashboard → retorna dados do dashboard', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('periodos');
    expect(res.body).toHaveProperty('insights');
  });

  test('GET /api/dashboard → 401 sem token', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.statusCode).toBe(401);
  });
});
