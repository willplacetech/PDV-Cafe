const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const response = () => ({
  statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('a chave pública antiga nunca autentica um administrador', () => {
  const auth = require('../middleware/auth');
  const token = jwt.sign({ role: 'admin' }, 'desenvolvimento-altere-esta-chave');
  const res = response();
  let nextCalled = false;
  auth({ headers: { authorization: `Bearer ${token}` } }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.ok([401, 503].includes(res.statusCode));
});

test('senha ausente retorna erro de entrada sem consultar banco', async () => {
  const router = require('../routes/auth');
  const handler = router.stack.find((layer) => layer.route?.path === '/login').route.stack[0].handle;
  const original = User.findOne;
  let queried = false;
  User.findOne = () => { queried = true; return { select: async () => null }; };
  try {
    const res = response();
    await handler({ body: { username: 'admin' } }, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(queried, false);
  } finally { User.findOne = original; }
});

test('erro assíncrono do login chega ao tratamento global', async () => {
  const router = require('../routes/auth');
  const handler = router.stack.find((layer) => layer.route?.path === '/login').route.stack[0].handle;
  const original = User.findOne;
  const failure = new Error('banco indisponível');
  User.findOne = () => ({ select: async () => { throw failure; } });
  let captured;
  try {
    await handler({ body: { username: 'admin', password: 'senha' } }, response(), (error) => { captured = error; });
    assert.equal(captured, failure);
  } finally { User.findOne = original; }
});

const fiscalEnv = [
  'NFCE_CNPJ', 'NFCE_IE', 'NFCE_RAZAO_SOCIAL', 'NFCE_ENDERECO_LOGRADOURO',
  'NFCE_ENDERECO_NUMERO', 'NFCE_ENDERECO_BAIRRO', 'NFCE_ENDERECO_MUNICIPIO',
  'NFCE_ENDERECO_UF', 'NFCE_ENDERECO_CEP', 'NFCE_CERTIFICATE_PFX_BASE64',
  'NFCE_CERTIFICATE_PASSWORD', 'NFCE_PROVIDER_URL',
];

const withProvider = async (body, run) => {
  const previous = Object.fromEntries(fiscalEnv.map((key) => [key, process.env[key]]));
  const previousFetch = global.fetch;
  fiscalEnv.forEach((key) => { process.env[key] = 'test-placeholder'; });
  global.fetch = async () => ({ ok: true, status: 200, json: async () => body });
  try { await run(); } finally {
    global.fetch = previousFetch;
    fiscalEnv.forEach((key) => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
  }
};

test('HTTP 200 com emissão pendente não representa autorização fiscal', async () => {
  const { emitirNfce } = require('../utils/nfce');
  await withProvider({ status: 'processando' }, async () => {
    await assert.rejects(emitirNfce({ order: { _id: 'test', itens: [] }, products: [] }),
      (error) => error.code === 'PROVIDER_PENDING');
  });
});

test('HTTP 200 vazio não representa autorização fiscal', async () => {
  const { emitirNfce } = require('../utils/nfce');
  await withProvider({}, async () => {
    await assert.rejects(emitirNfce({ order: { _id: 'test', itens: [] }, products: [] }),
      (error) => error.code === 'INVALID_PROVIDER_RESPONSE');
  });
});

test('resposta fiscal completa continua sendo aceita', async () => {
  const { emitirNfce } = require('../utils/nfce');
  await withProvider({ numero: '1', serie: '1', chaveAcesso: '1'.repeat(44), protocolo: '123456789012345' }, async () => {
    const result = await emitirNfce({ order: { _id: 'test', itens: [] }, products: [] });
    assert.equal(result.numero, '1');
    assert.equal(result.protocolo, '123456789012345');
  });
});
