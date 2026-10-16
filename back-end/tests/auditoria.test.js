const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Auditoria = require('../models/Auditoria');
const User = require('../models/User');

const app = express();
app.use(express.json());
app.use('/api/auditoria', require('../routes/auditoria'));
app.use((error, req, res, next) => res.status(500).json({ msg: error.message }));

async function token(role = 'admin') {
  const user = await User.create({ username: `usuario-${role}`, password: 'TesteSegura123!', role });
  return { user, headers: { Authorization: `Bearer ${jwt.sign({ id: user.id, role }, process.env.JWT_SECRET)}` } };
}

test('registra solicitante, autorizador e resultado sem copiar credenciais da requisição', async () => {
  const { auditarRequisicao } = require('../utils/auditoria');
  const solicitante = new mongoose.Types.ObjectId();
  const gerente = new mongoose.Types.ObjectId();
  await auditarRequisicao({ user: { id: solicitante }, gerenteAutorizou: { id: gerente }, ip: '127.0.0.1', originalUrl: '/api/orders/123?senha=segredo', body: { senha: 'segredo' } }, 'cancelar_venda', false, undefined, 'operacao_recusada');
  const registro = await Auditoria.findOne().lean();
  expect(String(registro.usuarioSolicitante)).toBe(String(solicitante));
  expect(String(registro.usuarioAutorizou)).toBe(String(gerente));
  expect(registro.sucesso).toBe(false);
  expect(registro.detalhes).toBe('/api/orders/123');
  expect(JSON.stringify(registro)).not.toContain('segredo');
});

test('consulta exige administrador e pagina com filtros validados preservando datas antigas', async () => {
  const admin = await token();
  const operador = await token('operador');
  await Auditoria.create([
    { usuarioSolicitante: operador.user.id, acao: 'login', sucesso: true, createdAt: new Date('2026-10-01T12:00:00Z') },
    { usuarioSolicitante: operador.user.id, acao: 'logout', sucesso: false },
  ]);
  expect((await request(app).get('/api/auditoria')).status).toBe(401);
  expect((await request(app).get('/api/auditoria').set(operador.headers)).status).toBe(403);
  const res = await request(app).get('/api/auditoria').set(admin.headers).query({ usuario: operador.user.username, acao: 'login', dataInicio: '2026-10-01', dataFim: '2026-10-01', limit: 1 });
  expect(res.status).toBe(200);
  expect(res.body.total).toBe(1);
  expect(res.body.registros[0].usuarioSolicitante.username).toBe(operador.user.username);
  expect(res.body.registros[0].data).toBe('2026-10-01T12:00:00.000Z');
  for (const query of [{ limit: '-1' }, { limit: '1000' }, { page: '1.5' }, { dataInicio: '2026-02-30' }, { dataInicio: '2026-10-03', dataFim: '2026-10-01' }, { sucesso: 'yes' }, { acao: { $ne: '' } }, { usuario: { $ne: '' } }]) {
    expect((await request(app).get('/api/auditoria').set(admin.headers).query(query)).status).toBe(400);
  }
});

test('audita resultado HTTP real antes de entregar JSON ou 204 e inclui autorizador', async () => {
  const { auditarOperacoes } = require('../middleware/auditoria');
  const api = express();
  api.use(auditarOperacoes);
  const solicitante = new mongoose.Types.ObjectId();
  const gerente = new mongoose.Types.ObjectId();
  api.post('/api/auth/login', (req, res) => { req.user = { id: solicitante }; res.json({ token: 'segredo' }); });
  api.post('/api/auth/logout', (req, res) => { req.user = { id: solicitante }; res.status(204).end(); });
  api.patch('/api/orders/:id/cancelar', (req, res) => {
    req.user = { id: solicitante };
    req.gerenteAutorizou = { id: gerente };
    res.status(409).json({ msg: 'Recusada' });
  });
  await request(api).post('/api/auth/login').expect(200);
  expect(await Auditoria.countDocuments({ acao: 'login', sucesso: true })).toBe(1);
  await request(api).post('/api/auth/logout').expect(204);
  expect(await Auditoria.countDocuments({ acao: 'logout', sucesso: true })).toBe(1);
  await request(api).patch('/api/orders/123/cancelar').expect(409);
  const falha = await Auditoria.findOne({ acao: 'cancelar_venda' }).lean();
  expect(falha.sucesso).toBe(false);
  expect(String(falha.usuarioAutorizou)).toBe(String(gerente));
  expect(falha.motivoFalha).toBe('http_409');
  expect(JSON.stringify(await Auditoria.find().lean())).not.toContain('segredo');
});
