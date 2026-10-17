import test from 'node:test';
import assert from 'node:assert/strict';
import { emitirAutorizacaoAdmin, guardarAutorizacao, getAutorizacaoCache, limparCacheAutorizacao } from '../src/services/managerApproval.js';
import { clearAccessSession } from '../src/services/accessSession.js';
import { sanitizeEvent } from '../src/services/sentry.js';

test('cache respeita ação, expiração JWT e logout', () => {
  const token = exp => `header.${btoa(JSON.stringify({ exp }))}.signature`;
  guardarAutorizacao('excluir_item', token(Date.now() / 1000 + 300));
  assert.ok(getAutorizacaoCache('excluir_item'));
  assert.equal(getAutorizacaoCache('fechar_caixa'), null);
  clearAccessSession();
  assert.equal(getAutorizacaoCache('excluir_item'), null);
  guardarAutorizacao('excluir_item', token(Date.now() / 1000 - 1));
  assert.equal(getAutorizacaoCache('excluir_item'), null);
  limparCacheAutorizacao();
});

test('admin recebe token de autorização sem redigitar senha e guarda no cache', async () => {
  const token = `header.${btoa(JSON.stringify({ exp: Date.now() / 1000 + 300 }))}.signature`;
  let acaoSolicitada;
  const recebido = await emitirAutorizacaoAdmin('cancelar_venda', async acao => {
    acaoSolicitada = acao;
    return { tokenAutorizacao: token };
  });

  assert.equal(acaoSolicitada, 'cancelar_venda');
  assert.equal(recebido, token);
  assert.equal(getAutorizacaoCache('cancelar_venda')?.token, token);
  limparCacheAutorizacao('cancelar_venda');
});

test('admin recebe erro explícito se o servidor não emitir token de autorização', async () => {
  await assert.rejects(
    emitirAutorizacaoAdmin('cancelar_venda', async () => ({})),
    /Não foi possível emitir a autorização do administrador/,
  );
});

test('Sentry remove dados privados e mantém versão, id e stack', () => {
  const result = sanitizeEvent({ release: 'sha', user: { id: '123', email: 'privado' }, request: { data: 'senha' }, breadcrumbs: [{ message: 'token' }], extra: { cpf: 'privado' }, exception: { values: [{ type: 'Error', value: 'senha secreta', stacktrace: { frames: [{ filename: 'https://app.test/main.js?token=privado', lineno: 3, vars: { senha: 'privada' } }] } }] } });
  const json = JSON.stringify(result);
  assert.equal(result.release, 'sha');
  assert.deepEqual(result.user, { id: '123' });
  assert.equal(result.exception.values[0].stacktrace.frames[0].lineno, 3);
  assert.doesNotMatch(json, /privad|secreta|cpf|token|email/);
});
