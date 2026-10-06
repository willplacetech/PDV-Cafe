import test from 'node:test';
import assert from 'node:assert/strict';
import { criarOperacoesFinanceiras } from '../src/utils/operacaoFinanceira.js';

test('lost response retries same key, intent change creates another key', async () => {
  const calls = [];
  let fail = true;
  const api = { patch: async (url, body) => { calls.push({ url, body }); if (fail) throw new Error('response lost'); return { data: { pago: 5 } }; } };
  const operations = criarOperacoesFinanceiras(api);
  await assert.rejects(operations.enviar('patch', '/pay', { valor: 5 }));
  fail = false;
  await operations.enviar('patch', '/pay', { valor: 5 });
  assert.equal(calls[0].body.operacaoId, calls[1].body.operacaoId);
  await operations.enviar('patch', '/pay', { valor: 6 });
  assert.notEqual(calls[1].body.operacaoId, calls[2].body.operacaoId);
});
test('double click shares request; finished batch entries stay cached until reset', { timeout: 5000 }, async () => {
  let calls = 0;
  const pending = [];
  let started;
  const waitForStart = () => new Promise(resolve => { started = resolve; });
  const release = () => { pending.splice(0).forEach(resolve => resolve()); };
  const api = { patch: async () => { calls++; await new Promise(resolve => { pending.push(resolve); started(); }); return { data: { pago: 5 } }; } };
  const operations = criarOperacoesFinanceiras(api);
  const firstStarted = waitForStart();
  const first = operations.enviar('patch', '/pay', { valor: 5 });
  const second = operations.enviar('patch', '/pay', { valor: 5 });
  await firstStarted;
  release();
  assert.deepEqual(await first, await second);
  assert.equal(calls, 1);
  await operations.enviar('patch', '/pay', { valor: 5 });
  operations.limpar();
  const nextStarted = waitForStart();
  const next = operations.enviar('patch', '/pay', { valor: 5 });
  await nextStarted;
  release();
  await next;
  assert.equal(calls, 2);
});

test('reload and cancelling ambiguous dialog preserve pending operation without storing payment data', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const keys = [];
  let fail = true;
  const api = { patch: async (url, body) => { keys.push(body.operacaoId); if (fail) throw new Error('response lost'); return { data: { pago: 5 } }; } };
  const options = { storage, usuarioId: 'user-1' };
  const first = criarOperacoesFinanceiras(api, options);
  await assert.rejects(first.enviar('patch', '/customers/private-name/pay', { valor: 5, observacao: 'Private client' }));
  first.limpar();
  assert.equal(values.size, 1);
  assert.ok(!JSON.stringify([...values]).includes('Private'));
  assert.ok(!JSON.stringify([...values]).includes('private-name'));
  fail = false;
  await criarOperacoesFinanceiras(api, options).enviar('patch', '/customers/private-name/pay', { valor: 5, observacao: 'Private client' });
  assert.equal(keys[0], keys[1]);
  assert.equal(values.size, 0);
});
test('batch confirmed entries remain complete if user changes payment intent for failed entries', async () => {
  let calls = 0;
  const api = { patch: async () => { calls++; return { data: { pago: 5 } }; } };
  const operations = criarOperacoesFinanceiras(api);
  await operations.enviar('patch', '/pay', { tipo: 'pix' }, { reusarConcluido: true });
  await operations.enviar('patch', '/pay', { tipo: 'dinheiro' }, { reusarConcluido: true });
  assert.equal(calls, 1);
});
