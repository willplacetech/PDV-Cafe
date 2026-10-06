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

for (const valor of ['', '0', '0,00']) {
  test(`recebimento parcial em Contas a Receber ${JSON.stringify(valor)} não envia pagamento`, async () => {
    const requests = [];
    const messages = [];
    const code = 'const registrarRecebimentoComanda = ' + section('ContasReceber', 'const registrarRecebimentoComanda = ', 'const toggleSelecionarTodos');
    const bindings = { formComanda: { comanda: { _id: 'x', valorTotal: 20, historicoPagamentos: [] }, valor }, saldoDevedor: () => 20, showToast: (...args) => messages.push(args), api: { patch: (...args) => requests.push(args) } };
    await evaluate(code, bindings, 'registrarRecebimentoComanda')({ preventDefault() {} });
    assert.equal(requests.length, 0);
    assert.equal(messages[0][0], 'Informe um valor válido');
  });
}

test('remover linha retira desconto quando grupo perde mínimo', () => {
  const functions = source('PDV').split('const precoPorUnidade = ')[1].split('export default function PDV')[0];
  const recalculate = section('PDV', 'const recalcularPrecosCarrinho = ', 'const adicionarItem');
  const remove = section('PDV', 'const removerItem = ', 'const subtotal');
  const produtos = ['a', 'b'].map(_id => ({ _id, preco: 10, grupoDesconto: { nome: 'combo', ativo: true, quantidadeMinima: 2, precoPromocional: 8 } }));
  const carrinho = produtos.map(p => ({ produtoId: p._id, quantidade: 1, precoUnitario: 8, precoUnitarioOriginal: 10 }));
  let updated;
  const removerItem = evaluate(`const precoPorUnidade = ${functions}; const recalcularPrecosCarrinho = ${recalculate}; const removerItem = ${remove}`, { produtos, carrinho, setCarrinho: value => { updated = typeof value === 'function' ? value(carrinho) : value; }, setQuantidadesRascunho: () => {} }, 'removerItem');
  removerItem(0);
  assert.equal(updated[0].precoUnitario, 10);
});

test('cliques repetidos ao abrir comanda enviam apenas uma requisição', async () => {
  let sends = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const noop = () => {};
  const code = 'const finalizar = ' + section('PDV', 'const finalizar = ', '// ==========================================');
  const bindings = { entregaPDV: null, setEntregaPDV: () => {}, navigator: { onLine: true }, enfileirar: async () => ({ ok: true }), carrinho: [{ produtoId: 'a', quantidade: 1 }], clienteId: '', clienteSelecionado: null, clienteNome: '', showToast: noop, navigate: noop, setCarrinho: noop, setClienteId: noop, setClienteNome: noop, setEnviando: noop, envioRef: { current: false }, idempotenciaRef: { current: null }, crypto: { randomUUID: () => 'test-uuid' }, api: { post: async () => { sends++; await pending; return { data: { numero: 1 } }; } } };
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

const finalizarPDV = (overrides = {}) => {
  const noop = () => {};
  const bindings = {
    entregaPDV: null, setEntregaPDV: () => {},
    navigator: { onLine: false },
    carrinho: [{ produtoId: 'a', quantidade: 1 }],
    clienteId: '', clienteSelecionado: null, clienteNome: '',
    showToast: noop, navigate: noop, setCarrinho: noop,
    setClienteId: noop, setClienteNome: noop, setEnviando: noop,
    envioRef: { current: false }, idempotenciaRef: { current: null },
    enfileirar: async () => ({ ok: true }),
    api: { post: async () => ({ data: { numero: 1 } }) },
    ...overrides,
  };
  const code = 'const finalizar = ' + section('PDV', 'const finalizar = ', '// ==========================================');
  return { fn: evaluate(code, bindings, 'finalizar'), bindings };
};

test('vendas offline consecutivas liberam o envio e usam identificadores diferentes', async () => {
  const vendas = [];
  const { fn, bindings } = finalizarPDV({ enfileirar: async (...args) => { vendas.push(args); return { ok: true }; } });
  await fn();
  assert.equal(bindings.envioRef.current, false);
  await fn();
  assert.equal(vendas.length, 2);
  assert.notEqual(vendas[0][2], vendas[1][2]);
});

test('fila cheia conserva carrinho e libera nova tentativa offline', async () => {
  let limpezas = 0;
  const { fn, bindings } = finalizarPDV({
    enfileirar: async () => ({ ok: false, motivo: 'limite' }),
    setCarrinho: () => { limpezas++; },
  });
  await fn();
  assert.equal(limpezas, 0);
  assert.equal(bindings.envioRef.current, false);
});

for (const status of [0, 408]) {
  test(`erro de conexao normalizado pela API (${status}) salva na fila com o mesmo identificador`, async () => {
    let enviado;
    let enfileirado;
    const { fn } = finalizarPDV({
      navigator: { onLine: true },
      api: { post: async (url, payload, config) => { enviado = { payload, config }; throw { response: { status } }; } },
      enfileirar: async (url, payload, id) => { enfileirado = { payload, id }; return { ok: true }; },
    });
    await fn();
    assert.ok(enfileirado);
    assert.equal(enfileirado.id, enviado.payload.idTemporario);
    assert.equal(enviado.config.headers['Idempotency-Key'], enfileirado.id);
  });
}

test('erro de validacao nao entra na fila e mantem a chave para repetir o mesmo pedido', async () => {
  const chaves = [];
  let enfileiradas = 0;
  const { fn } = finalizarPDV({
    navigator: { onLine: true },
    api: { post: async (url, payload, config) => { chaves.push(config.headers['Idempotency-Key']); throw { response: { status: 400 } }; } },
    enfileirar: async () => { enfileiradas++; return { ok: true }; },
  });
  await fn();
  await fn();
  assert.equal(enfileiradas, 0);
  assert.equal(chaves.length, 2);
  assert.equal(chaves[0], chaves[1]);
});

test('PDV offline conserva dados de entrega junto da venda na fila existente', async () => {
  let salvo;
  const entregaPDV = { telefone: '11988888888', endereco: { rua: 'Rua Um', numero: '12', bairro: 'Centro' }, taxaEntrega: '4.50' };
  const { fn } = finalizarPDV({ entregaPDV, clienteNome: 'Maria', enfileirar: async (url, payload) => { salvo = payload; return { ok: true }; } });
  await fn();
  assert.equal(salvo.entrega.taxaEntrega, 4.5);
  assert.equal(salvo.entrega.endereco.rua, 'Rua Um');
  assert.equal(salvo.clienteNome, 'Maria');
});

test('entrega incompleta no PDV avisa antes de enviar e preserva o carrinho', async () => {
  let envios = 0;
  let aviso;
  const { fn } = finalizarPDV({ entregaPDV: { telefone: '', endereco: {}, taxaEntrega: 0 }, api: { post: async () => { envios++; } }, enfileirar: async () => { envios++; }, showToast: (msg, tipo) => { aviso = tipo; } });
  await fn();
  assert.equal(envios, 0);
  assert.equal(aviso, 'warning');
});
