const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const Comanda = require('../../models/Comanda');
const Recipe = require('../../models/Recipe');
const { invalidate } = require('../../utils/queryCache');
const approval = require('../approvalFixture');

let tokens;
beforeEach(async () => {
  tokens = {};
  invalidate('produtos:');
  for (const role of ['operador', 'gerente', 'admin', 'cozinha', 'garcom']) {
    const user = await User.create({ username: `rbac-${role}`, password: 'rbac-password-123', role });
    tokens[role] = jwt.sign({ id: user.id, role }, process.env.JWT_SECRET);
  }
});
const get = (path, role) => request(app).get(`/api${path}`).set('Authorization', `Bearer ${tokens[role]}`);

test.each(['/customers', '/products', '/estoque/baixo', '/caixa/atual', '/dashboard', '/contabil/dre', '/auth/users', '/entregas/estatisticas'])('atendente não acessa %s diretamente pela API', async path => {
  expect((await get(path, 'operador')).status).toBe(403);
});

test('gerente permanece sem acesso à configuração de mesas', async () => {
  expect((await get('/mesas', 'gerente')).status).toBe(403);
});

test.each(['/customers', '/products', '/estoque/baixo', '/production/recipes', '/caixa/atual'])('gerente acessa %s', async path => {
  expect((await get(path, 'gerente')).status).toBe(200);
});

test.each(['/dashboard', '/contabil/dre', '/auth/users', '/orders', '/despesas', '/entregas/estatisticas'])('gerente não acessa gestão administrativa %s', async path => {
  expect((await get(path, 'gerente')).status).toBe(403);
});

test('cozinha consulta fichas técnicas sem receber dados de custo', async () => {
  const produto = await Product.create({
    codigo: 'rbac-kitchen-recipe-product',
    nome: 'Bolo de preparo',
    tipo: 'venda',
    tipoProduto: 'coz',
    aFazer: true,
    preco: 12,
    custo: 4,
  });
  const ingrediente = await Product.create({
    codigo: 'rbac-kitchen-recipe-ingredient',
    nome: 'Farinha operacional',
    tipo: 'insumo',
    preco: 0,
    precoCompra: 8,
    custoUnitarioBase: 8,
    unidadeCompra: 'kg',
    unidadeConteudo: 'kg',
    conteudoPorEmbalagem: 1,
    estoqueEmbalagens: 4,
  });
  const recipe = await Recipe.create({
    nome: 'Bolo da cozinha',
    produtoId: produto.id,
    rendimento: 1,
    unidadeRendimento: 'un',
    ingredientes: [{ produtoId: ingrediente.id, quantidade: 1, unidade: 'kg' }],
    custoInsumosTotal: 8,
    custoTotal: 8,
    custoUnitario: 8,
  });

  const productsResponse = await get('/products', 'cozinha');
  expect(productsResponse.status).toBe(200);
  const kitchenIngredient = productsResponse.body.find(item => item._id === ingrediente.id);
  expect(kitchenIngredient).toMatchObject({ nome: ingrediente.nome, tipo: 'insumo' });
  expect(kitchenIngredient.resumoInsumo).toEqual({ totalBase: expect.any(Number) });
  expect(Object.keys(kitchenIngredient).some(field => /preco|custo|fichaTecnica/i.test(field))).toBe(false);

  const recipesResponse = await get('/production/recipes', 'cozinha');
  expect(recipesResponse.status).toBe(200);
  const kitchenRecipe = recipesResponse.body.find(item => item._id === recipe.id);
  expect(kitchenRecipe).toMatchObject({
    nome: recipe.nome,
    tipoFicha: 'coz',
    produtoId: { nome: produto.nome },
    disponibilidade: { quantidade: expect.any(Number) },
  });
  expect(Object.keys(kitchenRecipe).some(field => /custo|updatedBy|createdBy/i.test(field))).toBe(false);
  expect(Object.keys(kitchenRecipe.ingredientes[0]).some(field => /custo|preco/i.test(field))).toBe(false);
});

test.each([
  '/products/inventory-list',
  '/production/stock',
  '/production/movements',
  '/production/dashboard',
  '/production/recipe-audits/507f1f77bcf86cd799439011',
])('cozinha não acessa áreas de estoque/produção fora das fichas %s', async path => {
  expect((await get(path, 'cozinha')).status).toBe(403);
});

test('lookup do PDV mantém atendimento sem expor cadastro completo', async () => {
  await Customer.create({ nome: 'Cliente teste', telefone: '11999999999', cpf: '12345678901', email: 'privado@example.test' });
  const response = await get('/customers/pdv', 'operador');
  expect(response.status).toBe(200);
  const cliente = response.body.find(item => item.nome === 'Cliente teste');
  expect(cliente.telefone).toBe('11999999999');
  expect(cliente.cpf).toBeUndefined();
  expect(cliente.email).toBeUndefined();
  expect((await get('/products/pdv', 'operador')).status).toBe(200);
  expect((await get('/comandas', 'gerente')).status).toBe(200);
});

test('catálogo de cozinha contém apenas campos operacionais sem alterar o payload do atendente', async () => {
  const product = await Product.create({
    codigo: 'rbac-kitchen-catalog',
    nome: 'Café operacional',
    categoria: 'Bebidas Quentes',
    tipo: 'venda',
    tipoProduto: 'coz',
    preco: 12,
    custo: 4,
    estoque: 18,
    aFazer: true,
  });
  invalidate('produtos:');

  const operatorResponse = await get('/products/pdv', 'operador');
  expect(operatorResponse.status).toBe(200);
  expect(operatorResponse.body.find(item => item._id === product.id)).toMatchObject({ preco: 12, estoque: 18 });

  const kitchenResponse = await get('/products/pdv', 'cozinha');
  expect(kitchenResponse.status).toBe(200);
  const kitchenProduct = kitchenResponse.body.find(item => item._id === product.id);
  const allowedFields = [
    '_id', 'nome', 'categoria', 'tipo', 'tipoProduto', 'unidadeVenda',
    'pesoPorUnidade', 'unidadePeso', 'vendidoFracionado',
  ];
  expect(kitchenProduct.nome).toBe('Café operacional');
  expect(kitchenProduct.categoria).toBe('Bebidas Quentes');
  expect(Object.keys(kitchenProduct).every(field => allowedFields.includes(field))).toBe(true);
});

test('cozinha consulta apenas comandas abertas e recebe payload operacional allowlisted', async () => {
  const product = await Product.create({ codigo: 'rbac-kitchen-order', nome: 'Café da cozinha', preco: 8, custo: 3, estoque: 10 });
  const criarComanda = status => Comanda.create({
    atendente: 'rbac-kitchen',
    tipoAtendimento: 'delivery',
    status,
    clienteNome: 'Cliente privado',
    clienteTelefone: '11999999999',
    entrega: { telefone: '11888888888', endereco: { rua: 'Rua privada', numero: '10' }, taxaEntrega: 7 },
    valorTotal: 15,
    valorPago: 2,
    saldoDevedor: 13,
    desconto: 1,
    historicoPagamentos: [{ valor: 2, formaPagamento: 'dinheiro' }],
    itens: [{
      produtoId: product.id,
      nome: product.nome,
      precoUnitario: 8,
      custoUnitarioHistorico: 3,
      quantidade: 1,
      aFazer: true,
      modificadores: ['sem açúcar'],
    }],
  });
  await criarComanda('aberta');
  await criarComanda('rascunho');
  await criarComanda('fechada');

  const response = await get('/comandas?status=aberta', 'cozinha');
  expect(response.status).toBe(200);
  expect(response.body).toHaveLength(1);
  expect(response.body[0].status).toBe('aberta');
  const commandFields = ['_id', 'numero', 'tipoAtendimento', 'mesa', 'status', 'itens'];
  const itemFields = [
    '_id', 'produtoId', 'nome', 'quantidade', 'tipoVenda', 'unidadeVenda',
    'pesoVendidoKg', 'pesoPorUnidade', 'unidadePeso', 'modificadores', 'aFazer',
  ];
  expect(Object.keys(response.body[0]).every(field => commandFields.includes(field))).toBe(true);
  expect(Object.keys(response.body[0].itens[0]).every(field => itemFields.includes(field))).toBe(true);
  expect(response.body[0]).toMatchObject({ numero: expect.any(String), tipoAtendimento: 'delivery', status: 'aberta' });
  expect(response.body[0].itens[0]).toMatchObject({ nome: product.nome, quantidade: 1 });
  expect((await get('/comandas', 'cozinha')).status).toBe(403);
  expect((await get('/comandas?status=fechada', 'cozinha')).status).toBe(403);
  expect((await get('/comandas?status=aberta', 'admin')).body.map(item => item.status).sort()).toEqual(['aberta', 'rascunho']);
});

test('quadro da cozinha mantém dados operacionais sem expor valores ou contato', async () => {
  const product = await Product.create({ codigo: 'rbac-kitchen-board', nome: 'Item de preparo', preco: 5, aFazer: true });
  await Comanda.create({
    atendente: 'rbac-kitchen',
    tipoAtendimento: 'delivery',
    status: 'aberta',
    clienteNome: 'Cliente operacional',
    clienteTelefone: '11999999999',
    observacao: 'Sem açúcar',
    entrega: { telefone: '11888888888', endereco: { rua: 'Rua privada' }, preparoPronto: false },
    valorTotal: 20,
    itens: [{ produtoId: product.id, nome: product.nome, precoUnitario: 20, custoUnitarioHistorico: 8, quantidade: 1, aFazer: true }],
  });

  const response = await get('/comandas/cozinha', 'cozinha');
  expect(response.status).toBe(200);
  expect(response.body).toHaveLength(1);
  const command = response.body[0];
  const allowedFields = [
    '_id', 'numero', 'tipoAtendimento', 'mesa', 'status', 'createdAt',
    'clienteNome', 'observacao', 'statusBalcao', 'entrega', 'itens',
  ];
  const allowedItemFields = [
    '_id', 'produtoId', 'nome', 'quantidade', 'tipoVenda', 'unidadeVenda',
    'pesoVendidoKg', 'pesoPorUnidade', 'unidadePeso', 'modificadores', 'aFazer',
  ];
  expect(Object.keys(command).every(field => allowedFields.includes(field))).toBe(true);
  expect(Object.keys(command.itens[0]).every(field => allowedItemFields.includes(field))).toBe(true);
  expect(command).toMatchObject({ numero: expect.any(String), clienteNome: 'Cliente operacional', observacao: 'Sem açúcar' });
  expect(command.entrega).toEqual({ preparoPronto: false });
});

test('cozinha não acessa operações da comanda fora de consulta e itens', async () => {
  const commandId = '507f1f77bcf86cd799439011';
  const blockedActions = [
    ['post', '/comandas'],
    ['get', `/comandas/${commandId}`],
    ['patch', `/comandas/${commandId}/balcao/status`],
    ['post', `/comandas/${commandId}/mover`],
    ['patch', `/comandas/${commandId}/cancelar`],
    ['patch', `/comandas/${commandId}/receber-parcial`],
    ['patch', `/comandas/${commandId}/cliente`],
    ['patch', `/comandas/${commandId}/detalhes`],
    ['post', `/comandas/${commandId}/fechar`],
    ['post', `/comandas/${commandId}/reabrir`],
  ];

  for (const [method, path] of blockedActions) {
    const response = await request(app)[method](`/api${path}`)
      .set('Authorization', `Bearer ${tokens.cozinha}`)
      .send({});
    expect(response.status).toBe(403);
  }
});

test('gerente altera estoque/cadastro com a mesma confirmação de segurança do administrador', async () => {
  const product = await Product.create({ codigo: 'rbac-coffee', nome: 'Cafe', preco: 10, estoque: 5 });
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
