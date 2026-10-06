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
const Despesa = require('../../models/Despesa');

const jwtSecret = process.env.JWT_SECRET || 'desenvolvimento-altere-esta-chave';

let adminToken, operadorToken, cozinhaToken;
let produtoVenda, insumo;

beforeEach(async () => {
  const admin = await User.create({ username: 'admin', password: 'senha-segura-123', role: 'admin' });
  const operador = await User.create({ username: 'operador', password: 'senha-segura-123', role: 'operador' });
  const cozinha = await User.create({ username: 'cozinha', password: 'senha-segura-123', role: 'cozinha' });
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
      .send({ username: 'admin', password: 'senha-segura-123' });
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

  test('PUT /api/despesas/:id → atualiza parcelas abertas da recorrência mantendo o intervalo', async () => {
    const origem = await Despesa.create({
      descricao: 'Aluguel antigo',
      categoria: 'Aluguel',
      valor: 1000,
      dataVencimento: new Date('2026-01-10T00:00:00.000Z'),
      recorrente: true,
    });
    const parcela = await Despesa.create({
      descricao: origem.descricao,
      categoria: origem.categoria,
      valor: origem.valor,
      dataVencimento: new Date('2026-02-10T00:00:00.000Z'),
      recorrente: true,
      origemRecorrencia: origem._id,
    });
    const parcelaPaga = await Despesa.create({
      descricao: origem.descricao,
      categoria: origem.categoria,
      valor: origem.valor,
      dataVencimento: new Date('2025-12-10T00:00:00.000Z'),
      dataPagamento: new Date('2025-12-10T00:00:00.000Z'),
      status: 'pago',
      recorrente: true,
      origemRecorrencia: origem._id,
    });

    const resposta = await request(app)
      .put(`/api/despesas/${origem._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        descricao: 'Aluguel atualizado',
        valor: 1200,
        dataVencimento: '2026-01-15',
        alterarTodas: true,
      });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.body.parcelasAtualizadas).toBe(2);
    const origemAtualizada = await Despesa.findById(origem._id);
    const parcelaAtualizada = await Despesa.findById(parcela._id);
    expect(origemAtualizada.descricao).toBe('Aluguel atualizado');
    expect(origemAtualizada.valor).toBe(1200);
    expect(origemAtualizada.dataVencimento.toISOString()).toBe('2026-01-15T00:00:00.000Z');
    expect(parcelaAtualizada.descricao).toBe('Aluguel atualizado');
    expect(parcelaAtualizada.valor).toBe(1200);
    expect(parcelaAtualizada.dataVencimento.toISOString()).toBe('2026-02-15T00:00:00.000Z');
    const parcelaPagaPreservada = await Despesa.findById(parcelaPaga._id);
    expect(parcelaPagaPreservada.descricao).toBe('Aluguel antigo');
    expect(parcelaPagaPreservada.valor).toBe(1000);
  });

  test('PUT /api/despesas/:id → aplica dia de vencimento e limita ao último dia do mês', async () => {
    const origem = await Despesa.create({
      descricao: 'Assinatura mensal',
      categoria: 'Internet',
      valor: 100,
      dataVencimento: new Date('2027-01-10T00:00:00.000Z'),
      recorrente: true,
    });
    const fevereiro = await Despesa.create({
      descricao: origem.descricao,
      categoria: origem.categoria,
      valor: origem.valor,
      dataVencimento: new Date('2027-02-10T00:00:00.000Z'),
      recorrente: true,
      origemRecorrencia: origem._id,
    });
    const marco = await Despesa.create({
      descricao: origem.descricao,
      categoria: origem.categoria,
      valor: origem.valor,
      dataVencimento: new Date('2027-03-10T00:00:00.000Z'),
      recorrente: true,
      origemRecorrencia: origem._id,
    });

    const resposta = await request(app)
      .put(`/api/despesas/${origem._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ diaVencimento: 31, alterarTodas: true });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.body.parcelasAtualizadas).toBe(3);
    await expect(Despesa.findById(origem._id).then((despesa) => despesa.dataVencimento.toISOString()))
      .resolves.toBe('2027-01-31T00:00:00.000Z');
    await expect(Despesa.findById(fevereiro._id).then((despesa) => despesa.dataVencimento.toISOString()))
      .resolves.toBe('2027-02-28T00:00:00.000Z');
    await expect(Despesa.findById(marco._id).then((despesa) => despesa.dataVencimento.toISOString()))
      .resolves.toBe('2027-03-31T00:00:00.000Z');

    const diaInvalido = await request(app)
      .put(`/api/despesas/${origem._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ diaVencimento: 32, alterarTodas: true });
    expect(diaInvalido.statusCode).toBe(400);
  });

  test('PUT /api/despesas/:id → normaliza parcelas da recorrência que estão nos dias 20 e 21', async () => {
    const origem = await Despesa.create({
      descricao: 'Despesa recorrente',
      categoria: 'Outros',
      valor: 50,
      dataVencimento: new Date('2026-09-20T00:00:00.000Z'),
      recorrente: true,
    });
    const parcelaDia21 = await Despesa.create({
      descricao: origem.descricao,
      categoria: origem.categoria,
      valor: origem.valor,
      dataVencimento: new Date('2026-10-21T00:00:00.000Z'),
      recorrente: true,
      origemRecorrencia: origem._id,
    });

    const resposta = await request(app)
      .put(`/api/despesas/${parcelaDia21._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ diaVencimento: 20, alterarTodas: true });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.body.parcelasAtualizadas).toBe(2);
    const origemAtualizada = await Despesa.findById(origem._id);
    const parcelaAtualizada = await Despesa.findById(parcelaDia21._id);
    expect(origemAtualizada.dataVencimento.toISOString()).toBe('2026-09-20T00:00:00.000Z');
    expect(parcelaAtualizada.dataVencimento.toISOString()).toBe('2026-10-20T00:00:00.000Z');
  });

  test('PUT e DELETE /api/despesas/:id → altera e remove somente a despesa selecionada', async () => {
    const despesa = await Despesa.create({
      descricao: 'Conta de água',
      categoria: 'Água',
      valor: 80,
      dataVencimento: new Date('2026-01-10T00:00:00.000Z'),
    });

    const atualizada = await request(app)
      .put(`/api/despesas/${despesa._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ descricao: 'Conta de água revisada', valor: 95 });

    expect(atualizada.statusCode).toBe(200);
    expect(atualizada.body.descricao).toBe('Conta de água revisada');
    expect(atualizada.body.valor).toBe(95);

    const removida = await request(app)
      .delete(`/api/despesas/${despesa._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(removida.statusCode).toBe(200);
    await expect(Despesa.findById(despesa._id)).resolves.toBeNull();
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
      .set('Idempotency-Key', payload.idTemporario)
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

  test('POST /api/comandas preserva conflito de idempotencia ao reenviar venda offline alterada', async () => {
    const payload = {
      idTemporario: 'offline-comanda-conflito',
      clienteNome: 'Venda offline',
      itens: [{ produtoId: produtoVenda._id, quantidade: 1 }],
    };
    const criar = (body) => request(app)
      .post('/api/comandas')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', payload.idTemporario)
      .send(body);
    expect((await criar(payload)).statusCode).toBe(201);
    const alterada = await criar({ ...payload, itens: [{ produtoId: produtoVenda._id, quantidade: 2 }] });
    expect(alterada.statusCode).toBe(409);
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

  test('POST /api/compras → aceita quantidade fracionada em kg', async () => {
    const res = await request(app)
      .post('/api/compras')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fornecedor: 'Fornecedor Teste',
        numeroNF: '12346',
        data: new Date().toISOString(),
        metodoCusteio: 'media_ponderada',
        itens: [{
          produtoId: insumo._id,
          valorTotal: 7,
          qtdEmbalagens: 0.35,
          conteudoPorEmbalagem: 1,
          unidadeConteudo: 'kg',
        }],
        valorTotal: 7,
      });

    expect(res.statusCode).toBe(201);
    const compra = await Purchase.findOne({ numeroNF: '12346' });
    expect(compra.itens[0].qtdEmbalagens).toBe(0.35);
    expect(compra.itens[0].quantidadeTotal).toBe(0.35);
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

  test('recebimento de pedido de comanda com crédito atualiza saldo e histórico real', async () => {
    const comanda = await Comanda.create({
      status: 'fechada',
      valorTotal: 100,
      atendente: 'admin',
      historicoPagamentos: [{ valor: 100, formaPagamento: 'credito_loja', data: new Date() }],
    });
    const order = await Order.create({
      itens: [{ produtoId: produtoVenda._id, nome: produtoVenda.nome, precoUnitario: 100, quantidade: 1 }],
      subtotal: 100,
      total: 100,
      status: 'pendente',
      atendente: 'admin',
      comandaId: comanda._id,
      pagamentos: [],
    });
    comanda.pedidoId = order._id;
    await comanda.save();

    const pendentes = await request(app)
      .get('/api/orders?status=abertas')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(pendentes.statusCode).toBe(200);
    expect(pendentes.body).toHaveLength(1);
    expect(pendentes.body[0].status).toBe('pendente');
    expect(pendentes.body[0].pagamentos[0].tipo).toBe('credito_loja');

    const dashboardPendente = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(dashboardPendente.statusCode).toBe(200);
    expect(dashboardPendente.body.vendasHoje.recebido).toBe(0);
    expect(dashboardPendente.body.vendasHoje.pendente).toBe(100);

    const parcial = await request(app)
      .patch(`/api/orders/${order._id}/pagar`)
      .set('Idempotency-Key', require('crypto').randomUUID())
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tipo: 'pix', valorRecebido: 30 });
    expect(parcial.statusCode).toBe(200);
    expect(parcial.body.status).toBe('parcial');
    expect(parcial.body.pagamentos).toHaveLength(2);

    const dashboardParcial = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(dashboardParcial.body.vendasHoje.recebido).toBe(30);
    expect(dashboardParcial.body.vendasHoje.pendente).toBe(70);

    const atualizado = await Comanda.findById(comanda._id);
    expect(atualizado.valorPago).toBe(30);
    expect(atualizado.saldoDevedor).toBe(70);
    expect(atualizado.statusPagamento).toBe('parcial');

    const quitado = await request(app)
      .patch(`/api/orders/${order._id}/pagar`)
      .set('Idempotency-Key', require('crypto').randomUUID())
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tipo: 'dinheiro', valorRecebido: 70 });
    expect(quitado.statusCode).toBe(200);
    expect(quitado.body.status).toBe('pago');
    expect((await Comanda.findById(comanda._id)).saldoDevedor).toBe(0);
  });

  test('GET /api/dashboard → 401 sem token', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.statusCode).toBe(401);
  });
});
