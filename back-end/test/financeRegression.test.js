const test = require('node:test');
const assert = require('node:assert/strict');
const Order = require('../models/Order');
const Comanda = require('../models/Comanda');
const Product = require('../models/Product');
const Despesa = require('../models/Despesa');
const Purchase = require('../models/Purchase');
const PaymentSettings = require('../models/PaymentSettings');
const contabil = require('../routes/contabil');
const despesas = require('../routes/despesas');
const chain = (value) => ({ select: () => chain(value), lean: async () => value });
const handler = (router, path, method) => router.stack.find((layer) => layer.route?.path === path && (!method || layer.route.methods[method])).route.stack.at(-1).handle;
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } });

test('DRE deduz impostos uma vez e conserva o custo registrado na venda', async (t) => {
  const id = '507f1f77bcf86cd799439011';
  t.mock.method(Order, 'find', (query) => chain(query.createdAt ? [{ total: 100, itens: [{ produtoId: id, nome: 'Cafe', quantidade: 2, custoUnitarioHistorico: 3 }] }] : []));
  t.mock.method(Comanda, 'find', () => chain([]));
  t.mock.method(Product, 'find', () => chain([{ _id: id, tipoProduto: 'coz', custoUnitario: 20 }]));
  t.mock.method(Purchase, 'find', () => chain([]));
  t.mock.method(Despesa, 'find', () => chain([]));
  const res = response();
  await handler(contabil, '/dre')({ query: { mes: '2025-01', impostos: '10' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.cmv, 6);
  assert.equal(res.body.lucroLiquido, 84);
});

test('reprocessamento de taxas atualiza formaPagamento de comandas', async (t) => {
  const pagamento = { valor: 100, formaPagamento: 'cartao_credito', data: new Date('2025-01-10T12:00:00Z') };
  let query;
  let saves = 0;
  t.mock.method(PaymentSettings, 'findOneAndUpdate', async () => ({}));
  t.mock.method(Order, 'find', async () => []);
  t.mock.method(Comanda, 'find', async (filter) => { query = filter; return [{ historicoPagamentos: [pagamento], save: async () => { saves += 1; } }]; });
  const res = response();
  await handler(contabil, '/taxas-cartao')({ body: { mes: '2025-01', tipo: 'cartao_credito', taxaPercentual: 2 } }, res);
  assert.equal(query.historicoPagamentos.$elemMatch.formaPagamento, 'cartao_credito');
  assert.equal(pagamento.taxaValor, 2);
  assert.equal(pagamento.valorLiquido, 98);
  assert.equal(saves, 1);
  assert.equal(res.body.pagamentosAtualizados, 1);
});

test('recorrencia mensal em dia 31 limita fevereiro sem perder marco', async (t) => {
  let parcelas;
  t.mock.method(Despesa, 'create', async (payload) => ({ ...payload, _id: '507f1f77bcf86cd799439011' }));
  t.mock.method(Despesa, 'insertMany', async (items) => { parcelas = items; });
  const res = response();
  await handler(despesas, '/', 'post')({ body: { descricao: 'Aluguel', categoria: 'Aluguel', valor: 100, dataVencimento: '2025-01-31T00:00:00Z', recorrente: true }, user: { id: '507f1f77bcf86cd799439011' } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(parcelas[0].dataVencimento.toISOString(), '2025-02-28T00:00:00.000Z');
  assert.equal(parcelas[1].dataVencimento.toISOString(), '2025-03-31T00:00:00.000Z');
});

test('recorrencia respeita frequencias semanal e anual e ano bissexto', async (t) => {
  let parcelas;
  t.mock.method(Despesa, 'create', async (payload) => ({ ...payload, _id: '507f1f77bcf86cd799439011' }));
  t.mock.method(Despesa, 'insertMany', async (items) => { parcelas = items; });
  const create = async (frequenciaRecorrencia) => handler(despesas, '/', 'post')({ body: { descricao: 'Conta', categoria: 'Outros', valor: 100, dataVencimento: '2024-02-29T12:00:00Z', recorrente: true, frequenciaRecorrencia }, user: { id: '507f1f77bcf86cd799439011' } }, response());
  await create('semanal');
  assert.equal(parcelas[0].dataVencimento.toISOString(), '2024-03-07T12:00:00.000Z');
  await create('anual');
  assert.equal(parcelas[0].dataVencimento.toISOString(), '2025-02-28T12:00:00.000Z');
  assert.equal(parcelas[3].dataVencimento.toISOString(), '2028-02-29T12:00:00.000Z');
});

test('DRE mantem calculo legado e usa custo historico mesmo sem cadastro do produto', async (t) => {
  const id = '507f1f77bcf86cd799439011';
  let itens = [{ produtoId: id, quantidade: 2 }];
  t.mock.method(Order, 'find', (query) => chain(query.createdAt ? [{ total: 100, itens }] : []));
  t.mock.method(Comanda, 'find', () => chain([]));
  t.mock.method(Product, 'find', () => chain([{ _id: id, tipoProduto: 'coz', custoUnitario: 20 }]));
  t.mock.method(Purchase, 'find', () => chain([]));
  t.mock.method(Despesa, 'find', () => chain([]));
  let res = response();
  await handler(contabil, '/dre')({ query: { mes: '2025-01', impostos: '10' } }, res);
  assert.equal(res.body.cmv, 40);
  assert.equal(res.body.lucroLiquido, 50);
  itens = [{ produtoId: '507f1f77bcf86cd799439012', nome: 'Produto removido', quantidade: 2, custoUnitarioHistorico: 3 }];
  res = response();
  await handler(contabil, '/dre')({ query: { mes: '2025-01' } }, res);
  assert.equal(res.body.cmv, 6);
  assert.deepEqual(res.body.produtosSemCusto, []);
});
