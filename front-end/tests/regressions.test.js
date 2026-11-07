import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { textoSeguro } from '../src/utils/notaVenda.js';
import {
  ImpressaoError,
  imprimirCupomVenda,
  listarImpressoesPendentes,
} from '../src/services/impressaoService.js';
import { parseNumericValue, safeNumber } from '../src/utils/numeric.js';

const source = (name) =>
  readFileSync(new URL(`../src/pages/${name}.jsx`, import.meta.url), 'utf8');
const section = (name, from, to) => source(name).split(from)[1].split(to)[0];
const evaluate = (code, bindings, result) => {
  const scope = { parseNumericValue, safeNumber, ...bindings };
  return new Function(...Object.keys(scope), `${code}; return ${result};`)(
    ...Object.values(scope)
  );
};

test('recebimento individual apresenta o motivo retornado pelo servidor e libera nova tentativa', async () => {
  let aviso;
  const recebendoRef = { current: false };
  const code =
    'const registrarPagamento = ' +
    section(
      'ContasReceber',
      'const registrarPagamento = ',
      'const quitarTotalCliente'
    );
  const fn = evaluate(
    code,
    {
      formPagamento: { tipo: 'pix', valorRecebido: '5', observacao: '' },
      saldoPagamentoIndividual: 10,
      pagamentoModal: { _id: 'pedido' },
      recebendoRef,
      setRecebendo() {},
      operacoesRef: {
        current: {
          enviar: async () => {
            throw {
              response: { data: { msg: 'Comanda não aceita recebimentos' } },
            };
          },
        },
      },
      showToast: (msg, tipo) => {
        aviso = { msg, tipo };
      },
      setPagamentoModal() {},
      setPagamentoConcluido() {},
      setFormPagamento() {},
      carregarPedidos() {},
    },
    'registrarPagamento'
  );
  await fn();
  assert.deepEqual(aviso, {
    msg: 'Comanda não aceita recebimentos',
    tipo: 'error',
  });
  assert.equal(recebendoRef.current, false);
});

test('quitação total do cliente calcula o total aberto de todos os pedidos sem afetar o pagamento', async () => {
  let totalCalculadora;
  let modalAberto = false;
  const code =
    'const quitarTotalCliente = ' +
    section(
      'ContasReceber',
      'const quitarTotalCliente = ',
      'const confirmarQuitacaoCliente'
    );
  const quitarTotalCliente = evaluate(
    code,
    {
      clienteFiltro: 'cliente-1',
      carregandoQuitacaoCliente: false,
      setCarregandoQuitacaoCliente() {},
      api: {
        get: async (path, options) => {
          assert.equal(path, '/orders');
          assert.deepEqual(options.params, {
            clienteId: 'cliente-1',
            status: 'abertas',
          });
          return {
            data: [
              { status: 'pendente', saldoDevedor: 15 },
              { status: 'parcial', saldoDevedor: 7.5 },
              { status: 'pago', saldoDevedor: 0 },
            ],
          };
        },
      },
      saldoRecebivelPedido: (pedido) => pedido.saldoDevedor,
      setTotalQuitacaoCliente: (valor) => {
        totalCalculadora = valor;
      },
      setQuitarClienteModal: (valor) => {
        modalAberto = valor;
      },
      showToast: (mensagem, tipo) => {
        throw new Error(`${tipo}: ${mensagem}`);
      },
    },
    'quitarTotalCliente'
  );

  await quitarTotalCliente();

  assert.equal(totalCalculadora, 22.5);
  assert.equal(modalAberto, true);
});

test('relatório de clientes imprime nome e telefone como texto', () => {
  let html = '';
  const code =
    'const imprimirRelatorioClientes = ' +
    section(
      'Dashboard',
      'const imprimirRelatorioClientes = ',
      'const exportarClientesMailing'
    );
  const fn = evaluate(
    code,
    {
      textoSeguro,
      relatorioClientes: {
        clientes: [
          {
            nome: '<img onerror="alert(1)">',
            telefone: '</span><script>evil()</script>',
          },
        ],
      },
      window: {
        open: () => ({
          document: {
            write: (value) => {
              html = value;
            },
            close() {},
          },
        }),
      },
    },
    'imprimirRelatorioClientes'
  );
  fn();
  assert.ok(!html.includes('<img onerror'));
  assert.ok(!html.includes('<script>evil()'));
  assert.ok(html.includes('&lt;img'));
});

test('recebido líquido subtrai taxa atual do bruto', () => {
  const code =
    'const recebidoLiquidoAtual = ' +
    section(
      'Dashboard',
      'const recebidoLiquidoAtual = ',
      'const aReceberMensal'
    );
  assert.equal(
    evaluate(
      code,
      { relatorioMes: { recebido: 100, taxasCartao: 3 }, taxasCartaoAtual: 5 },
      'recebidoLiquidoAtual'
    ),
    95
  );
});

test('login bem sucedido mantém a sessão ativa sem recarregar o documento', async () => {
  let reloads = 0;
  let submittedCredentials;
  const loadingStates = [];
  const code =
    'const handleSubmit = ' +
    section('Login', 'const handleSubmit = ', 'const handleInstallClick');
  const handleSubmit = evaluate(
    code,
    {
      form: { username: '  ANA  ', password: 'senha' },
      setLoading: (value) => loadingStates.push(value),
      login: async (...credentials) => {
        submittedCredentials = credentials;
      },
      window: {
        location: {
          reload: () => {
            reloads++;
          },
        },
      },
      showToast: () => {},
    },
    'handleSubmit'
  );

  await handleSubmit({ preventDefault() {} });

  assert.deepEqual(submittedCredentials, ['ana', 'senha']);
  assert.deepEqual(loadingStates, [true, false]);
  assert.equal(reloads, 0);
});

for (const valor of ['', '0', '0,00']) {
  test(`recebimento parcial em Contas a Receber ${JSON.stringify(valor)} não envia pagamento`, async () => {
    const requests = [];
    const messages = [];
    const code =
      'const registrarRecebimentoComanda = ' +
      section(
        'ContasReceber',
        'const registrarRecebimentoComanda = ',
        'const toggleSelecionarTodos'
      );
    const bindings = {
      formComanda: {
        comanda: { _id: 'x', valorTotal: 20, historicoPagamentos: [] },
        valor,
      },
      saldoDevedor: () => 20,
      showToast: (...args) => messages.push(args),
      api: { patch: (...args) => requests.push(args) },
    };
    await evaluate(
      code,
      bindings,
      'registrarRecebimentoComanda'
    )({ preventDefault() {} });
    assert.equal(requests.length, 0);
    assert.equal(messages[0][0], 'Informe um valor válido');
  });
}

for (const [digitado, esperado] of [
  ['12,50', '12,50'],
  ['12.50', '12,50'],
]) {
  test(`campo de recebimento parcial normaliza ${digitado} para moeda brasileira`, () => {
    let formAtualizado;
    const code =
      'const digitarValorComanda = ' +
      section(
        'ContasReceber',
        'const digitarValorComanda = ',
        'const registrarRecebimentoComanda'
      );
    const digitarValorComanda = evaluate(
      code,
      {
        setFormComanda: (atualizar) => {
          formAtualizado = atualizar({ valor: '' });
        },
      },
      'digitarValorComanda'
    );

    digitarValorComanda(digitado);

    assert.equal(formAtualizado.valor, esperado);
    assert.equal(Number(formAtualizado.valor.replace(',', '.')), 12.5);
  });
}

test('remover linha retira desconto quando grupo perde mínimo', async () => {
  const functions = source('PDV')
    .split('const precoPorUnidade = ')[1]
    .split('export default function PDV')[0];
  const recalculate = section(
    'PDV',
    'const recalcularPrecosCarrinho = ',
    'const setCarrinho'
  );
  const remove = section(
    'PDV',
    'const removerItem = ',
    'const clienteSelecionado'
  );
  const produtos = ['a', 'b'].map((_id) => ({
    _id,
    preco: 10,
    grupoDesconto: {
      nome: 'combo',
      ativo: true,
      quantidadeMinima: 2,
      precoPromocional: 8,
    },
  }));
  const carrinho = produtos.map((p) => ({
    produtoId: p._id,
    quantidade: 1,
    precoUnitario: 8,
    precoUnitarioOriginal: 10,
  }));
  let updated;
  const removerItem = evaluate(
    `const precoPorUnidade = ${functions}; const recalcularPrecosCarrinho = ${recalculate}; const removerItem = ${remove}`,
    {
      produtos,
      carrinho,
      solicitarAcaoGerente: async (acao) => {
        assert.equal(acao, 'excluir_item');
      },
      setCarrinho: (value) => {
        updated = typeof value === 'function' ? value(carrinho) : value;
      },
      setQuantidadesRascunho: () => {},
      setPrecosRascunho: () => {},
    },
    'removerItem'
  );
  await removerItem(0);
  assert.equal(updated[0].precoUnitario, 10);
});

test('PDV aplica percentual do grupo sobre o preço normal individual de cada produto', () => {
  const functions = source('PDV')
    .split('const formatMoney = ')[1]
    .split('export default function PDV')[0];
  const precoComDescontoGrupo = evaluate(
    `const formatMoney = ${functions}`,
    {},
    'precoComDescontoGrupo'
  );
  const produtoA = {
    preco: 80,
    grupoDesconto: {
      nome: 'Bebidas',
      ativo: true,
      quantidadeMinima: 2,
      percentualDesconto: 10,
    },
  };
  const produtoB = {
    preco: 120,
    grupoDesconto: {
      nome: 'Bebidas',
      ativo: true,
      quantidadeMinima: 2,
      percentualDesconto: 10,
    },
  };
  const carrinho = [
    { produto: produtoA, quantidade: 1 },
    { produto: produtoB, quantidade: 1 },
  ];

  assert.equal(
    precoComDescontoGrupo(produtoA, 1, carrinho, produtoA.preco).precoUnitario,
    72
  );
  assert.equal(
    precoComDescontoGrupo(produtoB, 1, carrinho, produtoB.preco).precoUnitario,
    108
  );
});

test('cliques repetidos ao abrir comanda enviam apenas uma requisição', async () => {
  let sends = 0;
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const noop = () => {};
  const code =
    'const finalizar = ' +
    section(
      'PDV',
      'const finalizar = ',
      '// =========================================='
    );
  const bindings = {
    entregaPDV: null,
    setEntregaPDV: () => {},
    navigator: { onLine: true },
    enfileirar: async () => ({ ok: true }),
    carrinho: [{ produtoId: 'a', quantidade: 1, precoUnitario: 10 }],
    subtotal: 10,
    total: 10,
    clienteId: '',
    clienteSelecionado: null,
    clienteNome: '',
    showToast: noop,
    navigate: noop,
    setCarrinho: noop,
    setClienteId: noop,
    setClienteNome: noop,
    setEnviando: noop,
    limparComanda: noop,
    setQuantidadesRascunho: noop,
    setPrecosRascunho: noop,
    envioRef: { current: false },
    idempotenciaRef: { current: null },
    crypto: { randomUUID: () => 'test-uuid' },
    api: {
      post: async () => {
        sends++;
        await pending;
        return { data: { numero: 1 } };
      },
    },
  };
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
  const code =
    'const salvar = ' + section('MesasCadastro', 'const salvar = ', 'return (');
  const fn = evaluate(
    code,
    {
      mesas: [{ id: 1, numero: 1, nome: 'Mesa 1', lugares: 4, ativa: true }],
      quantidadeTotal: 1,
      oferecerBalcao: true,
      salvando: false,
      carregando: false,
      podeAlterar: true,
      setSalvando: noop,
      setMesas: noop,
      showToast: () => {
        success = true;
      },
      alert: () => {
        success = true;
      },
      api: {
        put: async (url, payload) => {
          saved = { url, payload };
          return { data: payload };
        },
      },
    },
    'salvar'
  );
  await fn();
  assert.equal(saved?.url, '/mesas');
  assert.equal(saved.payload.mesas.length, 1);
  assert.equal(success, true);
});

test('serviço do cupom escapa dados de produto no HTML de impressão', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  });
  try {
    await assert.rejects(
      imprimirCupomVenda({
        numero: '1',
        total: 10,
        itens: [
          { nome: '<img onerror="evil()">', quantidade: 1, precoUnitario: 10 },
        ],
      }),
      (error) => error instanceof ImpressaoError
    );
    const job = listarImpressoesPendentes().find(
      (pending) => pending.tipo === 'cupom-1'
    );
    assert.ok(job);
    assert.ok(!job.html.includes('<img onerror'));
    assert.ok(job.html.includes('&lt;img onerror=&quot;evil()&quot;&gt;'));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

const finalizarPDV = (overrides = {}) => {
  const noop = () => {};
  const bindings = {
    entregaPDV: null,
    setEntregaPDV: () => {},
    navigator: { onLine: false },
    carrinho: [{ produtoId: 'a', quantidade: 1, precoUnitario: 10 }],
    subtotal: 10,
    total: 10,
    clienteTemEnderecoCadastrado: false,
    clienteId: '',
    clienteSelecionado: null,
    clienteNome: '',
    showToast: noop,
    navigate: noop,
    setCarrinho: noop,
    setClienteId: noop,
    setClienteNome: noop,
    setEnviando: noop,
    limparComanda: noop,
    setQuantidadesRascunho: noop,
    setPrecosRascunho: noop,
    envioRef: { current: false },
    idempotenciaRef: { current: null },
    enfileirar: async () => ({ ok: true }),
    api: { post: async () => ({ data: { numero: 1 } }) },
    ...overrides,
  };
  const code =
    'const finalizar = ' +
    section(
      'PDV',
      'const finalizar = ',
      '// =========================================='
    );
  return { fn: evaluate(code, bindings, 'finalizar'), bindings };
};

test('vendas offline consecutivas liberam o envio e usam identificadores diferentes', async () => {
  const vendas = [];
  const { fn, bindings } = finalizarPDV({
    enfileirar: async (...args) => {
      vendas.push(args);
      return { ok: true };
    },
  });
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
    setCarrinho: () => {
      limpezas++;
    },
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
      api: {
        post: async (url, payload, config) => {
          enviado = { payload, config };
          throw { response: { status } };
        },
      },
      enfileirar: async (url, payload, id) => {
        enfileirado = { payload, id };
        return { ok: true };
      },
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
    api: {
      post: async (url, payload, config) => {
        chaves.push(config.headers['Idempotency-Key']);
        throw { response: { status: 400 } };
      },
    },
    enfileirar: async () => {
      enfileiradas++;
      return { ok: true };
    },
  });
  await fn();
  await fn();
  assert.equal(enfileiradas, 0);
  assert.equal(chaves.length, 2);
  assert.equal(chaves[0], chaves[1]);
});

test('PDV offline conserva dados de entrega junto da venda na fila existente', async () => {
  let salvo;
  const entregaPDV = {
    telefone: '11988888888',
    endereco: { rua: 'Rua Um', numero: '12', bairro: 'Centro' },
    taxaEntrega: '4.50',
  };
  const { fn } = finalizarPDV({
    entregaPDV,
    clienteNome: 'Maria',
    enfileirar: async (url, payload) => {
      salvo = payload;
      return { ok: true };
    },
  });
  await fn();
  assert.equal(salvo.entrega.taxaEntrega, 4.5);
  assert.equal(salvo.entrega.endereco.rua, 'Rua Um');
  assert.equal(salvo.clienteNome, 'Maria');
});

test('entrega incompleta no PDV avisa antes de enviar e preserva o carrinho', async () => {
  let envios = 0;
  let aviso;
  const { fn } = finalizarPDV({
    entregaPDV: { telefone: '', endereco: {}, taxaEntrega: 0 },
    api: {
      post: async () => {
        envios++;
      },
    },
    enfileirar: async () => {
      envios++;
    },
    showToast: (msg, tipo) => {
      aviso = tipo;
    },
  });
  await fn();
  assert.equal(envios, 0);
  assert.equal(aviso, 'warning');
});
