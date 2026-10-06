const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const FechamentoCaixa = require('../../models/FechamentoCaixa');

let tokens;
const dia = '2026-10-06';
const movimento = { tipo: 'suplementacao', valor: 10, motivo: 'Troco' };

beforeAll(async () => { await FechamentoCaixa.init(); });
beforeEach(async () => {
  tokens = {};
  for (const role of ['admin', 'operador']) {
    const user = await User.create({ username: `caixa-${role}`, password: 'test-password', role });
    tokens[role] = jwt.sign({ id: user.id, username: user.username, role }, process.env.JWT_SECRET);
  }
});
afterEach(() => { jest.restoreAllMocks(); });

const api = (path, body, role = 'operador') => request(app).post(`/api/caixa${path}`)
  .set('Authorization', `Bearer ${tokens[role]}`).send(body);

const abrir = async () => {
  const response = await api('/abrir', { data: dia });
  expect(response.status).toBe(201);
  return response.body._id;
};

// Pause after real MongoDB reads: each request retains its own stale snapshot.
const pausarLeituras = (quantidade = 1) => {
  let liberar;
  let sinalizar;
  let leituras = 0;
  let restantes = quantidade;
  const liberado = new Promise((resolve) => { liberar = resolve; });
  const pronto = new Promise((resolve) => { sinalizar = resolve; });
  const original = FechamentoCaixa.findById;
  jest.spyOn(FechamentoCaixa, 'findById').mockImplementation(function (...args) {
    const query = original.apply(this, args);
    const exec = query.exec;
    const pausada = leituras++ < quantidade;
    if (pausada) {
      query.exec = async function (...execArgs) {
        const document = await exec.apply(this, execArgs);
        restantes -= 1;
        if (restantes === 0) sinalizar();
        await liberado;
        return document;
      };
    }
    return query;
  });
  return { pronto, liberar };
};

test.each(['/movimentos', '/contagem-parcial'])('rejeita escrita pendente %s depois do fechamento', async (path) => {
  const id = await abrir();
  const pausa = pausarLeituras();
  const pendente = api(`/${id}${path}`, path === '/movimentos' ? movimento : { valorContado: 20 }).then((response) => response);
  await pausa.pronto;
  let fechado;
  try { fechado = await api(`/${id}/fechar`, { valorContado: 0 }, 'admin'); }
  finally { pausa.liberar(); }
  const response = await pendente;
  expect(fechado.status).toBe(200);
  expect(response.status).toBe(409);
  const salvo = await FechamentoCaixa.findById(id).lean();
  expect(salvo.status).toBe('fechado');
  expect(salvo.sistema.saldoEsperado).toBe(0);
  expect(salvo.sistema.suplementacoes).toHaveLength(0);
  expect(salvo.contagemFisica.totalDinheiro).toBe(0);
  expect(salvo.conferencia.diferenca).toBe(0);
});

test.each(['/movimentos', '/contagem-parcial'])('fechamento detecta alteração concorrente %s e mantém caixa aberto', async (path) => {
  const id = await abrir();
  const pausa = pausarLeituras();
  const pendente = api(`/${id}/fechar`, { valorContado: 0 }).then((response) => response);
  await pausa.pronto;
  let alterado;
  try { alterado = await api(`/${id}${path}`, path === '/movimentos' ? movimento : { valorContado: 20 }, 'admin'); }
  finally { pausa.liberar(); }
  const response = await pendente;
  expect(alterado.status).toBe(path === '/movimentos' ? 201 : 200);
  expect(response.status).toBe(409);
  const salvo = await FechamentoCaixa.findById(id).lean();
  expect(salvo.status).toBe('aberto');
  expect(salvo.sistema.saldoEsperado).toBe(path === '/movimentos' ? 10 : 0);
  expect(salvo.contagemFisica.totalDinheiro).toBe(path === '/movimentos' ? 0 : 20);
  expect(salvo.usuarioFechamento).toBeUndefined();
  expect(salvo.conferencia.conferidoEm).toBeUndefined();
});

test('duas contagens do mesmo snapshot não sobrescrevem uma à outra', async () => {
  const id = await abrir();
  const pausa = pausarLeituras(2);
  const pendentes = [12, 24].map((valorContado) => api(`/${id}/contagem-parcial`, { valorContado }).then((response) => response));
  await pausa.pronto;
  pausa.liberar();
  const responses = await Promise.all(pendentes);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  const vencedor = responses.find((response) => response.status === 200);
  const salvo = await FechamentoCaixa.findById(id).lean();
  expect(salvo.contagemFisica.totalDinheiro).toBe(vencedor.body.contagemFisica.totalDinheiro);
  expect(salvo.__v).toBe(1);
});

test('duas aberturas simultâneas persistem apenas um caixa por dia e turno', async () => {
  let liberar;
  let sinalizar;
  let chegadas = 0;
  const liberado = new Promise((resolve) => { liberar = resolve; });
  const pronto = new Promise((resolve) => { sinalizar = resolve; });
  const original = FechamentoCaixa.create;
  jest.spyOn(FechamentoCaixa, 'create').mockImplementation(async function (...args) {
    if (++chegadas === 2) sinalizar();
    await liberado;
    return original.apply(this, args);
  });
  const pendentes = ['admin', 'operador'].map((role) => api('/abrir', { data: dia, turno: 'principal' }, role).then((response) => response));
  await pronto;
  liberar();
  const responses = await Promise.all(pendentes);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  expect(await FechamentoCaixa.countDocuments({ turno: 'principal' })).toBe(1);
});

test.each(['admin', 'operador'])('caixa fechado permanece imutável para %s', async (role) => {
  const id = await abrir();
  expect((await api(`/${id}/movimentos`, movimento, role)).status).toBe(201);
  expect((await api(`/${id}/fechar`, { valorContado: 10 }, role)).status).toBe(200);
  const antes = await FechamentoCaixa.findById(id).lean();
  expect((await api(`/${id}/movimentos`, movimento, role)).status).toBe(409);
  expect((await api(`/${id}/contagem-parcial`, { valorContado: 99 }, role)).status).toBe(409);
  expect((await api(`/${id}/fechar`, { valorContado: 99, observacao: 'Nova contagem' }, role)).status).toBe(409);
  expect(await FechamentoCaixa.findById(id).lean()).toEqual(antes);
});

test('índice de abertura preserva históricos duplicados e permite vários ajustes', async () => {
  const legado = { data: new Date('2026-10-05T03:00:00Z'), usuarioAbertura: 'legado', turno: 'principal', status: 'fechado' };
  await FechamentoCaixa.create([legado, legado]);
  const id = await abrir();
  expect((await api(`/${id}/fechar`, { valorContado: 0 })).status).toBe(200);
  for (const valor of [1, 2]) {
    expect((await api(`/${id}/ajuste`, { valor, motivo: 'Correção', }, 'admin')).status).toBe(201);
  }
  const atual = await request(app).get(`/api/caixa/atual?data=${dia}`)
    .set('Authorization', `Bearer ${tokens.operador}`);
  expect(atual.status).toBe(200);
  expect(atual.body.fechamento._id).toBe(id);
  expect(await FechamentoCaixa.countDocuments({ tipoRegistro: 'ajuste' })).toBe(2);
});

test('abertura e consulta sem data encontram o mesmo caixa do dia', async () => {
  const aberto = await api('/abrir', {});
  expect(aberto.status).toBe(201);
  const repetido = await api('/abrir', {});
  expect(repetido.status).toBe(200);
  expect(repetido.body._id).toBe(aberto.body._id);
  const atual = await request(app).get('/api/caixa/atual')
    .set('Authorization', `Bearer ${tokens.operador}`);
  expect(atual.status).toBe(200);
  expect(atual.body.fechamento._id).toBe(aberto.body._id);
});

test('caixa legado sem versão aceita movimento, contagem e fechamento com versões sucessivas', async () => {
  const id = await abrir();
  await FechamentoCaixa.updateOne({ _id: id }, { $unset: { __v: 1 } });
  const alterado = await api(`/${id}/movimentos`, movimento);
  expect(alterado.status).toBe(201);
  expect(alterado.body.__v).toBe(1);
  const contado = await api(`/${id}/contagem-parcial`, { valorContado: 10 });
  expect(contado.status).toBe(200);
  expect(contado.body.__v).toBe(2);
  const fechado = await api(`/${id}/fechar`, { valorContado: 10 });
  expect(fechado.status).toBe(200);
  expect(fechado.body.__v).toBe(3);
  expect(fechado.body.sistema.saldoEsperado).toBe(10);
  expect(fechado.body.contagemFisica.totalDinheiro).toBe(10);
  expect(fechado.body.conferencia.diferenca).toBe(0);
});

test.each(['/movimentos', '/fechar'])('duas escritas concorrentes %s aceitam somente um snapshot', async (path) => {
  const id = await abrir();
  const pausa = pausarLeituras(2);
  const pendentes = ['admin', 'operador'].map((role) => api(`/${id}${path}`, path === '/movimentos' ? movimento : { valorContado: 0 }, role).then((response) => response));
  await pausa.pronto;
  pausa.liberar();
  const responses = await Promise.all(pendentes);
  expect(responses.map((response) => response.status).sort()).toEqual([path === '/movimentos' ? 201 : 200, 409]);
  const salvo = await FechamentoCaixa.findById(id).lean();
  expect(salvo.__v).toBe(1);
  expect(salvo.status).toBe(path === '/movimentos' ? 'aberto' : 'fechado');
  expect(salvo.sistema.saldoEsperado).toBe(path === '/movimentos' ? 10 : 0);
  expect(salvo.sistema.suplementacoes).toHaveLength(path === '/movimentos' ? 1 : 0);
});

