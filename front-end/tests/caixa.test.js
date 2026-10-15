import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/Caixa.jsx', import.meta.url), 'utf8');
const code = `${source.split('const registrarMovimento = ')[1].split('\n  };')[0]}\n  };`;
const registrarMovimento = new Function(
  'bloqueado',
  'caixa',
  'movimento',
  'requestAutorizado',
  'solicitarSangria',
  'setCaixa',
  'setSistema',
  'setMovimento',
  'showToast',
  `const registrarMovimento = ${code}; return registrarMovimento;`,
);

test('registrar sangria atualiza dinheiro físico e preserva os meios eletrônicos', async () => {
  const meiosPagamento = {
    pix: 75,
    credito: 120,
    debito: 90,
    taxaCredito: 3,
    taxaDebito: 1,
  };
  const caixa = { _id: 'caixa-1', outrosMeios: meiosPagamento };
  let caixaAtualizado = caixa;
  let sistemaAtualizado;
  const solicitarSangria = () => {};
  const requests = [];
  const handler = registrarMovimento(
    false,
    caixa,
    { tipo: 'sangria', valor: '20', responsavel: 'Ana', motivo: 'Troco' },
    async (...args) => {
      requests.push(args);
      return { data: { ...caixa, outrosMeios: { pix: 55, credito: 100, debito: 70 }, sistema: { saldoEsperado: 30 } } };
    },
    solicitarSangria,
    (update) => { caixaAtualizado = typeof update === 'function' ? update(caixaAtualizado) : update; },
    (sistema) => { sistemaAtualizado = sistema; },
    () => {},
    () => {},
  );

  await handler({ preventDefault() {} });

  assert.deepEqual(requests, [[
    'post', '/caixa/caixa-1/movimentos',
    { tipo: 'sangria', valor: '20', responsavel: 'Ana', motivo: 'Troco' },
    'sangria_suprimento', solicitarSangria,
  ]]);
  assert.deepEqual(caixaAtualizado.outrosMeios, meiosPagamento);
  assert.deepEqual(caixaAtualizado.sistema, { saldoEsperado: 30 });
  assert.deepEqual(sistemaAtualizado, { saldoEsperado: 30 });
});
