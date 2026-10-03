import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { textoSeguro } from '../src/utils/notaVenda.js';

const source = (name) => readFileSync(new URL(`../src/pages/${name}.jsx`, import.meta.url), 'utf8');
const section = (name, from, to) => source(name).split(from)[1].split(to)[0];
const evaluate = (code, bindings, result) => new Function(...Object.keys(bindings), `${code}; return ${result};`)(...Object.values(bindings));

test('relatório de clientes imprime nome e telefone como texto', () => {
  let html = '';
  const code = 'const imprimirRelatorioClientes = ' + section('Dashboard', 'const imprimirRelatorioClientes = ', 'const exportarClientesMailing');
  const fn = evaluate(code, { textoSeguro, relatorioClientes: { clientes: [{ nome: '<img onerror="alert(1)">', telefone: '</span><script>evil()</script>' }] }, window: { open: () => ({ document: { write: value => { html = value; }, close() {} } }) } }, 'imprimirRelatorioClientes');
  fn();
  assert.ok(!html.includes('<img onerror'));
  assert.ok(!html.includes('<script>evil()'));
  assert.ok(html.includes('&lt;img'));
});

test('recebido líquido subtrai taxa atual do bruto', () => {
  const code = 'const recebidoLiquidoAtual = ' + section('Dashboard', 'const recebidoLiquidoAtual = ', 'const aReceberMensal');
  assert.equal(evaluate(code, { relatorioMes: { recebido: 100, taxasCartao: 3 }, taxasCartaoAtual: 5 }, 'recebidoLiquidoAtual'), 95);
});

for (const partialAmount of ['', '0', '0,00']) {
  test(`pagamento parcial ${JSON.stringify(partialAmount)} não fecha comanda`, async () => {
    const requests = [];
    const messages = [];
    const code = 'const confirmarFechamento = ' + section('Comandas', 'const confirmarFechamento = ', 'const enviarComprovante');
    const noop = () => {};
    const bindings = { utilizacaoInterna: false, paymentMethod: 'pix', paymentPartial: true, partialAmount, selected: { _id: 'x' }, saldoEmAberto: 20, apenasNumeros: value => value.replace(',', '.'), setPaymentError: noop, showToast: (...args) => messages.push(args), api: { post: (...args) => { requests.push(args); throw new Error('Envio indevido'); } }, discount: '0', telefoneModal: '', nomeModal: '', formatMoney: String };
    await evaluate(code, bindings, 'confirmarFechamento')();
    assert.equal(requests.length, 0);
    assert.ok(messages.length > 0);
  });
}

test('remover linha retira desconto quando grupo perde mínimo', () => {
  const functions = source('PDV').split('const precoPorUnidade = ')[1].split('export default function PDV')[0];
  const recalculate = section('PDV', 'const recalcularPrecosCarrinho = ', 'const adicionarItem');
  const remove = section('PDV', 'const removerItem = ', 'const subtotal');
  const produtos = ['a', 'b'].map(_id => ({ _id, preco: 10, grupoDesconto: { nome: 'combo', ativo: true, quantidadeMinima: 2, precoPromocional: 8 } }));
  const carrinho = produtos.map(p => ({ produtoId: p._id, quantidade: 1, precoUnitario: 8, precoUnitarioOriginal: 10 }));
  let updated;
  const removerItem = evaluate(`const precoPorUnidade = ${functions}; const recalcularPrecosCarrinho = ${recalculate}; const removerItem = ${remove}`, { produtos, carrinho, setCarrinho: value => { updated = value; } }, 'removerItem');
  removerItem(0);
  assert.equal(updated[0].precoUnitario, 10);
});

test('cliques repetidos ao abrir comanda enviam apenas uma requisição', async () => {
  let sends = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const noop = () => {};
  const code = 'const finalizar = ' + section('PDV', 'const finalizar = ', '// ==========================================');
  const bindings = { carrinho: [{ produtoId: 'a', quantidade: 1 }], clienteId: '', clienteSelecionado: null, clienteNome: '', showToast: noop, navigate: noop, setCarrinho: noop, setClienteId: noop, setClienteNome: noop, setEnviando: noop, envioRef: { current: false }, idempotenciaRef: { current: null }, crypto: { randomUUID: () => 'test-uuid' }, api: { post: async () => { sends++; await pending; return { data: { numero: 1 } }; } } };
  const fn = evaluate(code, bindings, 'finalizar');
  const first = fn();
  const second = fn();
  release();
  await Promise.all([first, second]);
  assert.equal(sends, 1);
});

test('salvar mesas confirma sucesso só depois de persistir no servidor', async () => {
  let saved;
  let success = false;
  const noop = () => {};
  const code = 'const salvar = ' + section('MesasCadastro', 'const salvar = ', 'return (');
  const fn = evaluate(code, { mesas: [{ id: 1, numero: 1, nome: 'Mesa 1', lugares: 4, ativa: true }], quantidadeTotal: 1, oferecerBalcao: true, salvando: false, carregando: false, setSalvando: noop, setMesas: noop, showToast: () => { success = true; }, alert: () => { success = true; }, api: { put: async (url, payload) => { saved = { url, payload }; return { data: payload }; } } }, 'salvar');
  await fn();
  assert.equal(saved?.url, '/mesas');
  assert.equal(saved.payload.mesas.length, 1);
  assert.equal(success, true);
});


test('cupom PDV escapa cliente e dados de produto', () => {
  let html = '';
  const code = 'const imprimirCupom = ' + section('PDV', 'const imprimirCupom = ', 'const enviarWhatsApp');
  const fn = evaluate(code, { textoSeguro, window: { location: { origin: 'http://localhost' }, open: () => ({ document: { write: value => { html = value; }, close() {} } }) } }, 'imprimirCupom');
  fn({ createdAt: '2026-01-01', numero: '1', atendente: '<script>evil()</script>', clienteNome: '<img onerror="evil()">', subtotal: 10, total: 10, desconto: 0, itens: [{ nome: '<img onerror="evil()">', codigo: '<script>evil()</script>', quantidade: 1, precoUnitario: 10 }] });
  assert.ok(!html.includes('<img onerror'));
  assert.ok(!html.includes('<script>evil()'));
  assert.ok(html.includes('&lt;img'));
});
