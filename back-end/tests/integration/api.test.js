const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const Order = require('../../models/Order');
const Comanda = require('../../models/Comanda');
const Purchase = require('../../models/Purchase');
const Recipe = require('../../models/Recipe');

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

  test('POST /api/products → aceita NCM em branco sem bloquear cadastro', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        codigo: '2101',
        nome: 'Produto sem NCM',
        ncm: '',
        preco: 15,
        tipo: 'venda',
        categoria: 'Outros',
        estoque: 10,
        unidadeVenda: 'un',
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.ncm).toBe('');
  });

  test('Produtos de revenda calculam custo por preço e conteúdo da embalagem', async () => {
    const criado = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        codigo: '2100', nome: 'Revenda Teste', preco: 10, precoVenda: 10, precoCompra: 100,
        conteudoPorEmbalagem: 20, unidade: 'un', unidadeCompra: 'un', unidadeVenda: 'un',
        tipo: 'venda', tipoProduto: 'revenda', categoria: 'Outros', estoque: 20,
      });
    expect(criado.statusCode).toBe(201);
    expect(criado.body.custoUnitarioBase).toBe(5);

    const alterado = await request(app)
      .put(`/api/products/${criado.body._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tipoProduto: 'revenda', precoCompra: 100, conteudoPorEmbalagem: 10, unidade: 'un', unidadeCompra: 'un', unidadeVenda: 'un' });
    expect(alterado.statusCode).toBe(200);
    expect(alterado.body.custoUnitarioBase).toBe(10);
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

  test('POST /api/orders → reenvio com idTemporario não duplica venda nem baixa estoque duas vezes', async () => {
    const payload = {
      idTemporario: 'offline-order-1001',
      itens: [{ produtoId: produtoVenda._id, quantidade: 1 }],
      clienteNome: 'Venda offline',
    };
    const primeiraResposta = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);
    const segundaResposta = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(primeiraResposta.statusCode).toBe(201);
    expect(segundaResposta.statusCode).toBe(200);
    expect(segundaResposta.body._id).toBe(primeiraResposta.body._id);
    expect(await Order.countDocuments({ idTemporario: payload.idTemporario })).toBe(1);
    expect((await Product.findById(produtoVenda._id)).estoque).toBe(99);
  });

  test('POST /api/orders → 400 quantidade inválida', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ itens: [] });
    expect(res.statusCode).toBe(400);
  });

  test('PUT /api/production/recipes/:id → altera Cookie Redvelvet 100g', async () => {
    const produto = await Product.create({
      codigo: '3001', nome: 'Cookie Redvelvet 100g', preco: 12, tipo: 'venda', tipoProduto: 'producao', producaoPropria: true,
      categoria: 'Doces', estoque: 0,
    });
    const receita = await Recipe.create({
      nome: 'Cookie Redvelvet 100g', produtoId: produto._id, rendimento: 12, unidadeRendimento: 'un',
      ingredientes: [{ produtoId: insumo._id, quantidade: 0.5, unidade: 'kg' }], createdBy: produto.createdBy,
    });
    const res = await request(app)
      .put(`/api/production/recipes/${receita._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nome: 'Cookie Redvelvet 100g', produtoId: String(produto._id), rendimento: 12, unidadeRendimento: 'un',
        ingredientes: [{ produtoId: String(insumo._id), quantidade: 0.6, unidade: 'kg' }],
      });
    expect(res.statusCode).toBe(200);
    expect(res.body.nome).toBe('Cookie Redvelvet 100g');
  });

  test('GET /api/comandas → lista comandas', async () => {
    const res = await request(app)
      .get('/api/comandas')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
  });

  test('POST /api/comandas → reenvio com idTemporario não duplica abertura nem baixa estoque duas vezes', async () => {
    const payload = {
      idTemporario: 'offline-comanda-1001',
      clienteNome: 'Venda offline',
      itens: [{ produtoId: produtoVenda._id, quantidade: 1 }],
    };
    const primeiraResposta = await request(app)
      .post('/api/comandas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);
    const segundaResposta = await request(app)
      .post('/api/comandas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(primeiraResposta.statusCode).toBe(201);
    expect(segundaResposta.statusCode).toBe(200);
    expect(segundaResposta.body._id).toBe(primeiraResposta.body._id);
    expect(await Comanda.countDocuments({ idTemporario: payload.idTemporario })).toBe(1);
    expect((await Product.findById(produtoVenda._id)).estoque).toBe(99);
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

  test('GET /api/dashboard → Hoje e acompanhamento usam a mesma receita', async () => {
    await Order.create({
      itens: [{ produtoId: produtoVenda._id, nome: produtoVenda.nome, precoUnitario: 25, quantidade: 1 }],
      subtotal: 25,
      total: 25,
      status: 'pago',
      utilizacaoInterna: false,
      atendente: 'admin',
      pagamentos: [{ tipo: 'dinheiro', valorRecebido: 25, dataPagamento: new Date(), quitado: true }],
    });
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.periodos.dia.total).toBe(25);
    expect(res.body.vendasHoje.total).toBe(25);
  });

  test('GET /api/dashboard → 401 sem token', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.statusCode).toBe(401);
  });
});
