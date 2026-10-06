import test from 'node:test';
import assert from 'node:assert/strict';
import { EscPosBuilder } from '../src/utils/escpos.js';
import {
  carregarConfiguracaoImpressao,
  ImpressaoError,
  imprimirCupomVenda,
  listarImpressoesPendentes,
  montarCupomVenda,
  montarPedidosCozinha,
  salvarConfiguracaoImpressao,
} from '../src/services/impressaoService.js';

test('EscPosBuilder retorna bytes ESC/POS e valida as opções', () => {
  const builder = new EscPosBuilder();
  builder.init();
  builder.text('Café');
  builder.align('center');
  builder.bold();
  builder.newline(2);
  builder.separator();
  builder.cut();
  const bytes = builder.toUint8Array();
  assert.ok(bytes instanceof Uint8Array);
  assert.deepEqual([...bytes.slice(0, 2)], [0x1b, 0x40]);
  assert.ok(new TextDecoder().decode(bytes).includes('Café'));
  assert.throws(() => builder.align('justify'), /Alinhamento ESC\/POS inválido/);
  assert.throws(() => builder.fontSize('extra-large'), /Tamanho de fonte ESC\/POS inválido/);
});

test('QR ESC/POS inclui armazenamento e impressão dos dados', () => {
  const builder = new EscPosBuilder();
  builder.qrcode('https://exemplo.test/nfce');
  const bytes = builder.toUint8Array();
  const commands = [...bytes];
  assert.ok(commands.some((byte, index) => byte === 0x50 && commands[index - 1] === 0x31));
  assert.ok(commands.some((byte, index) => byte === 0x51 && commands[index - 1] === 0x31));
  assert.ok(new TextDecoder().decode(bytes).includes('https://exemplo.test/nfce'));
});

test('cupom imprime itens, totais, pagamento e dados autorizados da NFC-e', () => {
  const bytes = montarCupomVenda({
    numero: '104',
    subtotal: 25,
    desconto: 2,
    taxaEntrega: 3,
    total: 26,
    pagamentos: [{ tipo: 'pix', valorRecebido: 26 }],
    itens: [{ nome: 'Café', quantidade: 2, precoUnitario: 12.5 }],
    nfce: { status: 'autorizada', chaveAcesso: '123456', urlDanfe: 'https://exemplo.test/danfe', protocolo: '7890' },
  }, { empresa: { nome: 'Café de Teste', cnpj: '00.000.000/0001-00' } });
  const printable = new TextDecoder().decode(bytes);
  assert.match(printable, /Café de Teste/);
  assert.match(printable, /2 x Café/);
  assert.match(printable, /TOTAL/);
  assert.match(printable, /DOCUMENTO FISCAL/);
  assert.match(printable, /123456/);
  assert.match(printable, /7890/);
});

test('pedido de cozinha separa os setores e destaca observações', () => {
  const tickets = montarPedidosCozinha({
    numero: '104',
    mesa: { numero: 5 },
    itens: [
      { nome: 'Hambúrguer', categoria: 'Lanches', quantidade: 1, observacao: 'sem cebola' },
      { nome: 'Suco', categoria: 'Bebidas geladas', quantidade: 2 },
    ],
  }, {
    setores: [
      { nome: 'Cozinha', categorias: ['Lanches'] },
      { nome: 'Bar', categorias: ['Bebidas geladas'] },
    ],
  });
  assert.deepEqual(tickets.map((ticket) => ticket.setor), ['Cozinha', 'Bar']);
  assert.match(new TextDecoder().decode(tickets[0].data), /SEM CEBOLA/);
  assert.match(new TextDecoder().decode(tickets[0].data), /Mesa 5/);
  assert.match(new TextDecoder().decode(tickets[1].data), /2 x Suco/);
});

test('preferências locais guardam largura, automação, cabeçalho e setores', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  });
  try {
    const config = carregarConfiguracaoImpressao();
    const updated = {
      ...config,
      paperWidth: '58mm',
      imprimirCozinhaAutomaticamente: false,
      empresa: { ...config.empresa, cnpj: '00.000.000/0001-00' },
      setores: [{ nome: 'Bar', categorias: ['Bebidas geladas'] }],
      setorPadrao: 'Bar',
    };
    salvarConfiguracaoImpressao(updated);
    assert.deepEqual(carregarConfiguracaoImpressao(), updated);
    assert.throws(() => salvarConfiguracaoImpressao({ ...updated, setorPadrao: 'Inexistente' }), /setor padrão/i);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('impressão tenta BLE, USB e sistema nessa ordem e guarda o trabalho pendente localmente', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  });
  try {
    await assert.rejects(
      imprimirCupomVenda({ numero: '105', itens: [{ nome: 'Café', quantidade: 1, precoUnitario: 5 }] }),
      (error) => {
        assert.ok(error instanceof ImpressaoError);
        assert.deepEqual(error.attempts.map((attempt) => attempt.method), ['ble', 'usb', 'sistema']);
        assert.ok(error.pendingId);
        return true;
      },
    );
    const pending = listarImpressoesPendentes();
    assert.equal(pending.length, 1);
    assert.match(pending[0].tipo, /^cupom-105$/);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
