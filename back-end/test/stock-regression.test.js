const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Comanda = require('../models/Comanda');
const Order = require('../models/Order');
const Purchase = require('../models/Purchase');
const StockMovement = require('../models/StockMovement');
const HistoricoCusto = require('../models/HistoricoCusto');
const estoqueProduto = require('../utils/estoqueProduto');
const estoqueInsumo = require('../utils/estoqueInsumo');

process.env.JWT_SECRET ||= 'stock-regression-test-secret-with-at-least-32-characters';
afterEach(() => mock.restoreAll());
const id = () => new mongoose.Types.ObjectId();
const product = (data = {}) => new Product({ _id: id(), codigo: String(id()), nome: 'Produto', categoria: 'Outros', preco: 40, estoque: 5, ...data });
const query = (value) => ({ session: async () => value });
function harness(products = []) {
  const session = { startTransaction() {}, inTransaction: () => true, async commitTransaction() {}, async abortTransaction() {}, async endSession() {}, async withTransaction(fn) { await fn(); } };
  mock.method(mongoose, 'startSession', async () => session);
  products.forEach((p) => mock.method(p, 'save', async () => p));
  mock.method(Product, 'find', (filter) => query(products.filter(p => filter._id.$in.map(String).includes(String(p._id)))));
  mock.method(Product, 'findById', (key) => query(products.find(p => String(p._id) === String(key))));
  mock.method(Order, 'find', () => query([]));
  const update = async (filter, change) => {
    const p = products.find(p => String(p._id) === String(filter._id));
    if (!p) return null;
    for (const key of ['estoque', 'estoquePesoKg']) if (filter[key] && Number(p[key]) < filter[key].$gte) return null;
    for (const [key, delta] of Object.entries(change.$inc || {})) p[key] = Number(p[key] || 0) + delta;
    return p;
  };
  mock.method(Product, 'findOneAndUpdate', update);
  mock.method(Product, 'findByIdAndUpdate', (key, change) => update({ _id: key }, change));
  mock.method(StockMovement, 'create', async () => []);
  return products;
}
async function invoke(router, method, path, params, body = {}, headers = {}) {
  const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
  const req = { params, body, user: { username: 'admin', id: String(id()) }, header: (key) => headers[key] };
  const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await route.stack.at(-1).handle(req, res);
  return res;
}
const comandaDoc = (p, itemData = {}, extra = {}) => {
  const c = new Comanda({ _id: id(), numero: '0010', atendente: 'admin', estoqueBaixado: true, valorTotal: 40, itens: [{ produtoId: p._id, nome: p.nome, precoUnitario: 40, quantidade: 1, ...itemData }], ...extra });
  mock.method(c, 'save', async () => c);
  mock.method(Comanda, 'findById', () => query(c));
  return c;
};

test('peso explicitamente zerado continua esgotado', () => {
  const p = { unidadeVenda: 'kg', pesoPorUnidade: 1, estoque: 5, estoquePesoKg: 0 };
  estoqueProduto.normalizarEstoqueLegado(p);
  assert.equal(p.estoquePesoKg, 0);
});
test('campo de peso ausente em documento legado mant?m convers?o', () => {
  const p = Product.hydrate({ _id: id(), unidadeVenda: 'kg', pesoPorUnidade: 0.5, estoque: 5 });
  estoqueProduto.normalizarEstoqueLegado(p);
  assert.equal(p.estoquePesoKg, 2.5);
  p.estoquePesoKg = 0;
  estoqueProduto.normalizarEstoqueLegado(p);
  assert.equal(p.estoquePesoKg, 0);
});
test('consumo e reposi??o h?bridos alteram saldo efetivo, inclusive litros mai?sculos', () => {
  const p = { nome: 'Leite', tipo: 'venda', usavelEmReceita: true, unidade: 'L', unidadeVenda: 'L', unidadeConteudo: 'L', conteudoPorEmbalagem: 1, estoque: 10 };
  estoqueInsumo.consumirInsumo(p, 1, 'L');
  assert.equal(estoqueInsumo.estoqueTotalBase(p), 9000);
  estoqueInsumo.reporInsumo(p, 1, 'L');
  assert.equal(estoqueInsumo.estoqueTotalBase(p), 10000);
});
test('excluir item recalcula total e saldo', async () => {
  const p = product(); harness([p]);
  const c = comandaDoc(p);
  const res = await invoke(require('../routes/comandas'), 'delete', '/:id/itens/:itemId', { id: String(c._id), itemId: String(c.itens[0]._id) });
  assert.equal(res.code, 200); assert.equal(c.valorTotal, 0); assert.equal(c.saldoDevedor, 0);
});
test('excluir fatia devolve peso e conserva pe?as', async () => {
  const p = product({ unidadeVenda: 'kg', pesoPorUnidade: 1, estoquePesoKg: 4.8 }); harness([p]);
  const c = comandaDoc(p, { tipoVenda: 'peso', pesoVendidoKg: 0.2, quantidadePecas: 0, precoUnitario: 8 });
  const res = await invoke(require('../routes/comandas'), 'delete', '/:id/itens/:itemId', { id: String(c._id), itemId: String(c.itens[0]._id) });
  assert.equal(res.code, 200); assert.equal(p.estoque, 5); assert.equal(p.estoquePesoKg, 5);
});
test('adicionar fatia ? comanda baixa somente peso', async () => {
  const p = product({ unidadeVenda: 'kg', pesoPorUnidade: 1, estoquePesoKg: 5 }); harness([p]);
  const c = comandaDoc(p); c.itens = [];
  const res = await invoke(require('../routes/comandas'), 'post', '/:id/itens', { id: String(c._id) }, { produtoId: String(p._id), quantidade: 1, tipoVenda: 'peso', pesoVendidoKg: 0.2 });
  assert.equal(res.code, 200); assert.equal(p.estoque, 5); assert.equal(p.estoquePesoKg, 4.8); assert.equal(c.valorTotal, 8);
});
test('cancelar cozinha liberada sem insumo n?o fabrica ingrediente', async () => {
  const ingrediente = product({ tipo: 'insumo', precoCompra: 5, estoqueEmbalagens: 2, conteudoPorEmbalagem: 1, unidadeConteudo: 'kg', unidade: 'kg' });
  const p = product({ tipoProduto: 'coz', permitirVendaSemInsumo: true, fichaTecnica: [{ produtoId: ingrediente._id, quantidade: 0.2, unidade: 'kg' }] });
  harness([p, ingrediente]); const c = comandaDoc(p, { insumosConsumidos: p.fichaTecnica });
  const before = estoqueInsumo.estoqueTotalBase(ingrediente);
  const res = await invoke(require('../routes/comandas'), 'patch', '/:id/cancelar', { id: String(c._id) });
  assert.equal(res.code, 200); assert.equal(estoqueInsumo.estoqueTotalBase(ingrediente), before);
});
test('cancelar pedido de fatia devolve peso sem criar pe?as', async () => {
  const p = product({ unidadeVenda: 'kg', pesoPorUnidade: 1, estoquePesoKg: 4.8 }); harness([p]);
  const o = new Order({ numero: '000001', atendente: 'admin', subtotal: 8, total: 8, itens: [{ produtoId: p._id, nome: p.nome, quantidade: 1, precoUnitario: 8, tipoVenda: 'peso', pesoVendidoKg: 0.2, quantidadePecas: 0 }] });
  mock.method(Order, 'findById', () => query(o)); mock.method(o, 'save', async () => o);
  const res = await invoke(require('../routes/orders'), 'patch', '/:id/cancelar', { id: String(o._id) });
  assert.equal(res.code, 200); assert.equal(p.estoque, 5); assert.equal(p.estoquePesoKg, 5);
});
test('acr?scimo de pe?a usa pre?o por unidade e baixa peso', async () => {
  const p = product({ unidadeVenda: 'kg', pesoPorUnidade: 0.5, estoquePesoKg: 2.5 }); harness([p]);
  const c = comandaDoc(p); c.itens = [];
  const o = new Order({ numero: '000001', atendente: 'admin', comandaId: c._id, subtotal: 0, total: 0, itens: [] });
  mock.method(Order, 'findById', () => query(o)); mock.method(o, 'save', async () => o);
  const res = await invoke(require('../routes/orders'), 'patch', '/:id/adicionar-itens', { id: String(o._id) }, { itens: [{ produtoId: String(p._id), quantidade: 1 }] });
  assert.equal(res.code, 200); assert.equal(o.total, 20); assert.equal(p.estoque, 4); assert.equal(p.estoquePesoKg, 2); assert.equal(c.valorTotal, 20);
});
test('compra rejeita mudan?a incompat?vel de embalagem com saldo', async () => {
  const p = product({ tipo: 'insumo', precoCompra: 5, estoqueEmbalagens: 10, conteudoPorEmbalagem: 1, unidadeConteudo: 'kg' }); harness([p]);
  mock.method(Purchase, 'create', async () => [{ populate: async () => ({}) }]); mock.method(HistoricoCusto, 'create', async () => []);
  const res = await invoke(require('../routes/purchases'), 'post', '/', {}, { fornecedor: 'Fornecedor', numeroNF: '123', data: '2026-10-03', metodoCusteio: 'ultimo_preco', itens: [{ produtoId: String(p._id), qtdEmbalagens: 1, conteudoPorEmbalagem: 5, unidadeConteudo: 'kg', valorTotal: 25 }] });
  assert.equal(res.code, 400); assert.match(res.body.msg, /embalagem/i); assert.equal(p.estoqueEmbalagens, 10); assert.equal(p.conteudoPorEmbalagem, 1);
});
test('repetir chave de idempotencia retorna a mesma comanda sem baixar estoque', async () => {
  const p = product(); harness([p]); const c = comandaDoc(p);
  mock.method(Comanda, 'findOne', async () => c);
  const res = await invoke(require('../routes/comandas'), 'post', '/', {}, { itens: [{ produtoId: String(p._id), quantidade: 1 }] }, { 'Idempotency-Key': 'retry-same-intent' });
  assert.equal(res.code, 200); assert.equal(res.body, c); assert.equal(p.estoque, 5);
});
test('transferencia conserva peso, snapshots e recalcula as duas contas sem movimentar estoque', async () => {
  const p = product({ unidadeVenda: 'kg', pesoPorUnidade: 1, estoquePesoKg: 4.8 }); harness([p]);
  const c = comandaDoc(p, { tipoVenda: 'peso', pesoVendidoKg: 0.2, quantidadePecas: 0, precoUnitario: 8, controleEstoque: 'produto', movimentoEstoque: { pecas: 0, pesoKg: 0.2 }, custoUnitarioHistorico: 3 });
  mock.method(Comanda.prototype, 'save', async function() { return this; });
  const res = await invoke(require('../routes/comandas'), 'post', '/:id/mover', { id: String(c._id) }, { itemIds: [String(c.itens[0]._id)] });
  assert.equal(res.code, 200); assert.equal(c.valorTotal, 0); assert.equal(res.body.novaComanda.valorTotal, 8);
  assert.equal(res.body.novaComanda.itens[0].pesoVendidoKg, 0.2); assert.equal(res.body.novaComanda.itens[0].custoUnitarioHistorico, 3);
  assert.equal(p.estoque, 5); assert.equal(p.estoquePesoKg, 4.8);
});
test('alterar quantidade de fatia conserva estoque de pecas e ajusta peso e preco', async () => {
  const p = product({ unidadeVenda: 'kg', pesoPorUnidade: 1, estoquePesoKg: 4.8 }); harness([p]);
  const c = comandaDoc(p, { tipoVenda: 'peso', pesoVendidoKg: 0.2, quantidadePecas: 0, precoUnitario: 8 });
  const res = await invoke(require('../routes/comandas'), 'patch', '/:id/itens/:itemId', { id: String(c._id), itemId: String(c.itens[0]._id) }, { quantidade: 2 });
  assert.equal(res.code, 200); assert.equal(p.estoque, 5); assert.equal(p.estoquePesoKg, 4.6); assert.equal(c.valorTotal, 16);
});
test('cancelamento usa receita consumida mesmo depois de mudar receita e permitir venda sem insumo', async () => {
  const ingrediente = product({ tipo: 'insumo', precoCompra: 5, estoqueEmbalagens: 2, conteudoPorEmbalagem: 1, unidadeConteudo: 'kg', unidade: 'kg' });
  const p = product({ tipoProduto: 'coz', fichaTecnica: [{ produtoId: ingrediente._id, quantidade: 0.2, unidade: 'kg' }] }); harness([p, ingrediente]);
  const item = { produtoId: p._id, quantidade: 2 };
  const { ajustarEstoque } = require('../utils/movimentarEstoqueVenda');
  await ajustarEstoque([item], 'baixar', {}); assert.equal(estoqueInsumo.estoqueTotalBase(ingrediente), 1600);
  p.fichaTecnica = []; p.permitirVendaSemInsumo = true;
  await ajustarEstoque([item], 'devolver', {}); assert.equal(estoqueInsumo.estoqueTotalBase(ingrediente), 2000);
});
test('reducao de comanda abaixo de pagamento parcial e rejeitada', async () => {
  const p = product(); harness([p]);
  const c = comandaDoc(p, {}, { historicoPagamentos: [{ valor: 10, formaPagamento: 'dinheiro' }] });
  const res = await invoke(require('../routes/comandas'), 'delete', '/:id/itens/:itemId', { id: String(c._id), itemId: String(c.itens[0]._id) });
  assert.equal(res.code, 400); assert.match(res.body.msg, /recebido/i);
});


test('snapshot de custo de produto pesado usa custo por kg', async () => {
  const p = product({ unidadeVenda: 'kg', pesoPorUnidade: 0.5, estoquePesoKg: 2.5, precoCompra: 5 });
  harness([p]);
  const item = { produtoId: p._id, quantidade: 1, tipoVenda: 'peso', pesoVendidoKg: 0.2 };
  await require('../utils/movimentarEstoqueVenda').ajustarEstoque([item], 'baixar', {});
  assert.equal(item.custoUnitarioHistorico, 10);
});

test('snapshot preserva custo unitario de producao propria', async () => {
  const p = product({ tipoProduto: 'producao', producaoPropria: true, custoUnitario: 7, precoCompra: 0 });
  harness([p]);
  const item = { produtoId: p._id, quantidade: 1 };
  await require('../utils/movimentarEstoqueVenda').ajustarEstoque([item], 'baixar', {});
  assert.equal(item.custoUnitarioHistorico, 7);
});
