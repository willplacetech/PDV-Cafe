const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const Entregador = require('../models/Entregador');
const PedidoEntrega = require('../models/PedidoEntrega');
const AuthSession = require('../models/AuthSession');
const { getJwtSecret } = require('../utils/authConfig');
const { validatePassword, validEmail } = require('../utils/passwordPolicy');
const { tenantAuth, courierAuth, platformAuth, integrationAuth } = require('../middleware/deliveryAuth');
const service = require('../utils/deliveryService');
const sessions = require('../utils/authSessions');
const auth = require('../middleware/auth');
const { loginProtection } = require('../utils/sessionOrigins');

const router = express.Router();
const route = fn => async (req, res, next) => {
  try { await fn(req, res); }
  catch (error) {
    if (error.code === 11000) {
      const campo = Object.keys(error.keyPattern || {})[0];
      const mensagens = {
        slug: 'Já existe uma empresa cadastrada com esse slug.',
        email: 'Já existe uma conta cadastrada com esse e-mail.',
        username: 'Já existe uma conta cadastrada com esse usuário ou e-mail.',
        telefone: 'Já existe um entregador cadastrado com esse telefone.',
      };
      return res.status(409).json({ msg: mensagens[campo] || 'Já existe um cadastro com um dos dados informados.' });
    }
    if (['ValidationError', 'CastError'].includes(error.name)) return res.status(400).json({ msg: 'Dados inválidos. Confira os campos.' });
    next(error);
  }
};
const loginLimit = () => rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { msg: 'Muitas tentativas. Tente novamente mais tarde.' } });
const publicLimit = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, message: { msg: 'Muitas consultas. Aguarde um instante.' } });
const autorTenant = req => ({ tipo: 'tenant', usuarioId: req.deliveryUser._id });
const statusAtivos = ['despachado', 'a_caminho'];

router.post('/delivery/login', loginProtection, loginLimit(), route(async (req, res) => {
  const email = service.texto(req.body.email, 'e-mail', true, 254).toLowerCase();
  const senha = validatePassword(req.body.senha, false);
  const user = await User.findOne({ email, role: { $in: ['tenant_admin', 'admin_plataforma'] } }).select('+password');
  if (!user || user.ativo === false || !await user.matchPassword(senha)) throw service.erro('E-mail ou senha inválidos', 401);
  if (user.role === 'tenant_admin' && !await Tenant.exists({ _id: user.tenantId, ativo: true })) throw service.erro('Comércio desativado', 403);
  const publico = { id: user.id, username: user.username, email: user.email, role: user.role, tenantId: user.tenantId };
  res.json(await sessions.issue(req, res, user, 'delivery', publico));
}));

router.post('/entregador/login', loginProtection, loginLimit(), route(async (req, res) => {
  const telefone = service.texto(req.body.telefone, 'telefone', true, 30).replace(/\D/g, '');
  const senha = validatePassword(req.body.senha, false);
  const entregador = await Entregador.findOne({ telefone, ativo: true }).select('+senhaAcesso');
  if (!entregador || !await entregador.matchPassword(senha)) throw service.erro('Telefone ou senha inválidos', 401);
  const tenantIds = entregador.tenantId ? [entregador.tenantId] : await PedidoEntrega.distinct('tenantId', { entregadorId: entregador._id });
  const claims = { role: 'entregador', entregadorId: entregador.id, tenantIds };
  res.json(await sessions.issue(req, res, entregador, 'courier', { nome: entregador.nome, ...claims }));
}));

router.post('/delivery/refresh', ...sessions.refresh('delivery'));
router.post('/entregador/refresh', ...sessions.refresh('courier'));
for (const [path, scope, roles] of [['/delivery/logout', 'delivery', ['tenant_admin', 'admin_plataforma']], ['/entregador/logout', 'courier', ['entregador']]]) {
  router.post(path, sessions.logoutAuth(scope, auth), auth.allowRoles(...roles), route(async (req, res) => {
    await sessions.revokeAccessSession(req.user);
    sessions.clearCookie(res, scope);
    res.status(204).end();
  }));
}

router.get(['/tenant/configuracao', '/entregas/configuracao'], ...tenantAuth, route(async (req, res) => res.json(req.tenant)));
router.put(['/tenant/configuracao', '/entregas/configuracao'], ...tenantAuth, route(async (req, res) => {
  const tempo = service.numero(req.body.tempoEstimadoPadraoMin, 'tempo estimado');
  const mensagem = service.texto(req.body.mensagemWhatsApp, 'mensagem', true, 1000);
  const tenant = await Tenant.findByIdAndUpdate(req.tenantId, { configuracao: { tempoEstimadoPadraoMin: tempo, mensagemWhatsApp: mensagem } }, { new: true, runValidators: true });
  res.json(tenant);
}));

const periodo = data => {
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) throw service.erro('Data inválida');
  const inicio = new Date(`${data}T00:00:00-03:00`);
  if (!Number.isFinite(inicio.getTime()) || new Date(inicio.getTime() - 3 * 3600_000).toISOString().slice(0, 10) !== data) throw service.erro('Data inválida');
  return { $gte: inicio, $lt: new Date(inicio.getTime() + 24 * 3600_000) };
};
router.get(['/tenant/pedidos', '/entregas/pedidos'], ...tenantAuth, route(async (req, res) => {
  const filtro = { tenantId: req.tenantId };
  if (req.query.status) {
    if (!['pendente', 'pronto', ...statusAtivos, 'entregue', 'cancelado'].includes(req.query.status)) throw service.erro('Status inválido');
    filtro.status = req.query.status;
  }
  if (req.query.data) filtro.criadoEm = periodo(req.query.data);
  const pagina = req.query.pagina === undefined ? 1 : Number(req.query.pagina);
  const limite = req.query.limite === undefined ? 30 : Number(req.query.limite);
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > 10000 || !Number.isInteger(limite) || limite < 1 || limite > 100) throw service.erro('Paginação inválida');
  const [pedidos, total] = await Promise.all([
    PedidoEntrega.find(filtro).sort({ criadoEm: -1, _id: -1 }).skip((pagina - 1) * limite).limit(limite).populate('entregadorId', 'nome telefone').lean(),
    PedidoEntrega.countDocuments(filtro),
  ]);
  res.json({ pedidos, total, pagina, paginas: Math.ceil(total / limite) });
}));
router.get('/entregas/venda/:vendaId', ...tenantAuth, route(async (req, res) => {
  const vendaId = service.validarId(req.params.vendaId);
  const pedido = await PedidoEntrega.findOne({ tenantId: req.tenantId, vendaId })
    .populate('entregadorId', 'nome telefone')
    .lean();
  res.json({ pedido });
}));
router.post(['/tenant/pedidos', '/entregas/pedidos'], ...tenantAuth, route(async (req, res) => {
  const { pedido } = await service.criarPedido(req.body, req.tenant, 'formulario', autorTenant(req), undefined, { statusInicial: 'pronto' });
  res.status(201).json(pedido);
}));
router.post(['/tenant/pedidos/:id/despachar', '/entregas/pedidos/:id/despachar'], ...tenantAuth, route(async (req, res) => {
  service.validarId(req.params.id); service.validarId(req.body.entregadorId);
  if (!await PedidoEntrega.exists({ _id: req.params.id, tenantId: req.tenantId })) throw service.erro('Pedido não encontrado', 404);
  const entregador = await Entregador.findOne({ _id: req.body.entregadorId, ativo: true, tenantId: { $in: [null, req.tenantId] }, status: { $in: ['disponivel', 'em_entrega'] } });
  if (!entregador) throw service.erro('Entregador indisponível ou de outro comércio');
  const pedido = await service.mudarStatus({ filtro: { _id: req.params.id, tenantId: req.tenantId }, permitido: ['pronto'], status: 'despachado', por: autorTenant(req), campos: { entregadorId: entregador._id, tempoEstimadoMinutos: req.tenant.configuracao.tempoEstimadoPadraoMin, whatsappPendente: true } });
  res.json({ ...pedido.toObject(), whatsapp: service.mensagemWhatsApp(pedido, req.tenant) });
}));
router.post(['/tenant/pedidos/:id/pronto', '/entregas/pedidos/:id/pronto'], ...tenantAuth, route(async (req, res) => {
  const id = service.validarId(req.params.id);
  const pedido = await service.mudarStatus({ filtro: { _id: id, tenantId: req.tenantId }, permitido: ['pendente'], status: 'pronto', por: autorTenant(req) });
  res.json(pedido);
}));
router.post(['/tenant/pedidos/:id/cancelar', '/entregas/pedidos/:id/cancelar'], ...tenantAuth, route(async (req, res) => {
  const id = service.validarId(req.params.id);
  const motivo = service.texto(req.body.motivo, 'motivo do cancelamento', true, 500);
  const pedido = await service.mudarStatus({ filtro: { _id: id, tenantId: req.tenantId }, permitido: ['pendente', 'pronto', 'despachado'], status: 'cancelado', por: autorTenant(req), campos: { motivoCancelamento: motivo, whatsappPendente: false } });
  res.json(pedido);
}));
router.post(['/tenant/pedidos/:id/enviar-whatsapp', '/entregas/pedidos/:id/enviar-whatsapp'], ...tenantAuth, route(async (req, res) => {
  const pedido = await PedidoEntrega.findOne({ _id: service.validarId(req.params.id), tenantId: req.tenantId });
  if (!pedido) throw service.erro('Pedido não encontrado', 404);
  const resultado = await service.enviarWhatsApp(pedido, req.tenant);
  if (resultado.enviado) await PedidoEntrega.updateOne({ _id: pedido._id }, { whatsappPendente: false });
  res.json(resultado);
}));
router.get(['/tenant/entregadores', '/entregas/entregadores'], ...tenantAuth, route(async (req, res) => {
  res.json(await Entregador.find({ $or: [{ tenantId: req.tenantId }, { tenantId: null, ativo: true }] }).select('nome telefone status tenantId ativo').sort({ nome: 1 }).lean());
}));
router.post(['/tenant/entregadores', '/entregas/entregadores'], ...tenantAuth, route(async (req, res) => {
  const entregador = await Entregador.create({ nome: service.texto(req.body.nome, 'nome', true, 160), telefone: service.texto(req.body.telefone, 'telefone', true, 30), senhaAcesso: validatePassword(req.body.senha), tenantId: req.tenantId });
  res.status(201).json(entregador);
}));
router.put(['/tenant/entregadores/:id', '/entregas/entregadores/:id'], ...tenantAuth, route(async (req, res) => {
  const id = service.validarId(req.params.id);
  const entregador = await Entregador.findOne({ _id: id, tenantId: req.tenantId });
  if (!entregador) throw service.erro('Entregador não encontrado', 404);
  if (req.body.ativo !== undefined) {
    if (typeof req.body.ativo !== 'boolean') throw service.erro('Estado do entregador inválido');
    if (!req.body.ativo && await PedidoEntrega.exists({ entregadorId: id, status: { $in: statusAtivos } })) throw service.erro('O entregador possui pedido em andamento e não pode ser desativado.', 409);
    entregador.ativo = req.body.ativo;
    if (!req.body.ativo) entregador.status = 'offline';
  }
  if (req.body.nome !== undefined) entregador.nome = service.texto(req.body.nome, 'nome', true, 160);
  if (req.body.telefone !== undefined) entregador.telefone = service.texto(req.body.telefone, 'telefone', true, 30);
  if (req.body.senha !== undefined && req.body.senha !== '') {
    entregador.senhaAcesso = validatePassword(req.body.senha);
  }
  await entregador.save();
  if (req.body.senha) await AuthSession.deleteMany({ subjectId: entregador._id, kind: 'courier' });
  res.json(entregador);
}));
router.delete(['/tenant/entregadores/:id', '/entregas/entregadores/:id'], ...tenantAuth, route(async (req, res) => {
  const id = service.validarId(req.params.id);
  const entregador = await Entregador.findOne({ _id: id, tenantId: req.tenantId });
  if (!entregador) throw service.erro('Entregador não encontrado', 404);
  if (await PedidoEntrega.exists({ entregadorId: id })) throw service.erro('Não é possível excluir um entregador associado a pedidos; desative o cadastro para preservar o histórico.', 409);
  await AuthSession.deleteMany({ subjectId: entregador._id, kind: 'courier' });
  await Entregador.deleteOne({ _id: entregador._id, tenantId: req.tenantId });
  res.status(204).end();
}));
router.get(['/tenant/estatisticas', '/entregas/estatisticas'], ...tenantAuth, route(async (req, res) => {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [pedidos, prontos, despachados] = await Promise.all([
    PedidoEntrega.find({ tenantId: req.tenantId, criadoEm: periodo(hoje) }).select('status statusHistorico criadoEm').lean(),
    PedidoEntrega.countDocuments({ tenantId: req.tenantId, status: 'pronto' }),
    PedidoEntrega.countDocuments({ tenantId: req.tenantId, status: 'despachado' }),
  ]);
  const entregues = pedidos.filter(p => p.status === 'entregue');
  const tempos = entregues.map(p => (new Date(p.statusHistorico.find(h => h.status === 'entregue')?.data || p.criadoEm) - new Date(p.criadoEm)) / 60000);
  res.json({
    totalHoje: pedidos.length,
    entregues: entregues.length,
    cancelados: pedidos.filter(p => p.status === 'cancelado').length,
    pendentes: pedidos.filter(p => p.status === 'pendente').length,
    prontos,
    despachados,
    emEntrega: pedidos.filter(p => p.status === 'a_caminho').length,
    tempoMedioMin: tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0,
  });
}));

router.get('/entregador/pedidos', ...courierAuth, route(async (req, res) => {
  const pedidos = await PedidoEntrega.find({ entregadorId: req.entregador._id, status: { $in: statusAtivos } }).sort({ criadoEm: 1 }).populate('tenantId', 'nome endereco telefone').lean();
  res.json({ pedidos, status: req.entregador.status, posicaoAtual: req.entregador.posicaoAtual || null });
}));
router.post('/entregador/pedido/:id/status', ...courierAuth, route(async (req, res) => {
  const status = req.body.novoStatus;
  if (!['a_caminho', 'entregue'].includes(status)) throw service.erro('Status inválido');
  const pedido = await service.mudarStatus({ filtro: { _id: service.validarId(req.params.id), entregadorId: req.entregador._id }, permitido: status === 'a_caminho' ? ['despachado'] : ['a_caminho'], status, por: { tipo: 'entregador', usuarioId: req.entregador._id } });
  res.json(pedido);
}));
router.post('/entregador/posicao', ...courierAuth, route(async (req, res) => {
  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw service.erro('Coordenadas inválidas');
  const pedidos = await PedidoEntrega.find({ entregadorId: req.entregador._id, status: 'a_caminho' }).select('tokenRastreamento').lean();
  if (!pedidos.length) throw service.erro('A posição só pode ser atualizada durante uma entrega a caminho.', 409);
  const atualizadoEm = new Date();
  const limiteAtualizacao = new Date(atualizadoEm.getTime() - 60_000);
  const entregador = await Entregador.findOneAndUpdate({
    _id: req.entregador._id,
    ativo: true,
    $or: [
      { 'posicaoAtual.atualizadoEm': { $exists: false } },
      { 'posicaoAtual.atualizadoEm': { $lt: limiteAtualizacao } },
    ],
  }, { $set: { posicaoAtual: { lat, lng, atualizadoEm } } }, { new: true });
  if (!entregador) throw service.erro('Aguarde 60 segundos entre atualizações de posição.', 429);
  pedidos.forEach(p => service.eventos.emit(p.tokenRastreamento));
  res.json({ ok: true, atualizadoEm });
}));
router.post('/entregador/disponibilidade', ...courierAuth, route(async (req, res) => {
  if (typeof req.body.disponivel !== 'boolean') throw service.erro('Disponibilidade inválida');
  const emEntrega = await PedidoEntrega.exists({ entregadorId: req.entregador._id, status: { $in: statusAtivos } });
  req.entregador.status = req.body.disponivel ? (emEntrega ? 'em_entrega' : 'disponivel') : 'offline';
  await req.entregador.save();
  res.json({ status: req.entregador.status });
}));

router.post(['/pedidos/integracao', '/entregas/pedidos/integracao'], ...integrationAuth, route(async (req, res) => {
  if (req.body.tenantSlug !== undefined && req.body.tenantSlug !== req.tenant.slug) throw service.erro('Comércio não autorizado', 403);
  if (req.body.empresaId !== undefined && String(req.body.empresaId) !== String(req.tenant._id)) throw service.erro('Comércio não autorizado', 403);
  if (req.body.aguardaPreparo !== undefined && typeof req.body.aguardaPreparo !== 'boolean') throw service.erro('Estado de preparo inválido');
  const vendaId = req.body.vendaId === undefined ? undefined : service.validarId(req.body.vendaId);
  const referencia = vendaId
    ? `comanda:${vendaId}`
    : service.texto(req.body.idTemporario, 'referência da venda', true, 128);
  const { pedido, criado } = await service.criarPedido(req.body, req.tenant, 'pdv', { tipo: 'sistema' }, referencia, {
    vendaId,
    statusInicial: req.body.aguardaPreparo === true ? 'pendente' : 'pronto',
  });
  res.status(criado ? 201 : 200).json(pedido);
}));

router.get('/plataforma/tenants', ...platformAuth, route(async (req, res) => {
  const tenants = await Tenant.find().sort({ nome: 1 }).limit(500).lean();
  const tenantIds = tenants.map(tenant => tenant._id);
  const admins = await User.find({ role: 'tenant_admin', tenantId: { $in: tenantIds } }).select('tenantId email').lean();
  const emails = new Map(admins.map(admin => [String(admin.tenantId), admin.email]));
  res.json(tenants.map(tenant => ({ ...tenant, adminEmail: emails.get(String(tenant._id)) || '' })));
}));
router.get('/plataforma/tenants/:id', ...platformAuth, route(async (req, res) => {
  const tenant = await Tenant.findById(service.validarId(req.params.id));
  if (!tenant) throw service.erro('Comércio não encontrado', 404);
  res.json(tenant);
}));
const tenantDados = body => {
  const campos = ['nome', 'slug', 'cnpj', 'telefone', 'endereco', 'ativo', 'plano', 'dataVencimento', 'taxaPorEntrega', 'configuracao'];
  return Object.fromEntries(campos.filter(campo => body[campo] !== undefined).map(campo => [campo, body[campo]]));
};
router.post('/plataforma/tenants', ...platformAuth, route(async (req, res) => {
  const email = service.texto(req.body.adminEmail, 'e-mail do administrador', true, 254).toLowerCase();
  const senha = validatePassword(req.body.adminSenha);
  if (!validEmail(email)) throw service.erro('E-mail inválido');
  const session = await mongoose.startSession();
  let tenant;
  try {
    await session.withTransaction(async () => {
      [tenant] = await Tenant.create([tenantDados(req.body)], { session });
      await User.create([{ username: email, email, password: senha, role: 'tenant_admin', tenantId: tenant._id }], { session });
    });
  } finally { await session.endSession(); }
  res.status(201).json(tenant);
}));
router.put('/plataforma/tenants/:id', ...platformAuth, route(async (req, res) => {
  const tenantId = service.validarId(req.params.id);
  const adminEmail = req.body.adminEmail === undefined
    ? undefined
    : service.texto(req.body.adminEmail, 'e-mail do administrador', true, 254).toLowerCase();
  const adminSenha = req.body.adminSenha === undefined || req.body.adminSenha === ''
    ? undefined
    : validatePassword(req.body.adminSenha);
  if (adminEmail !== undefined && !validEmail(adminEmail)) throw service.erro('E-mail inválido');

  let tenant;
  if (adminEmail !== undefined || adminSenha !== undefined) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        tenant = await Tenant.findById(tenantId).session(session);
        if (!tenant) throw service.erro('Comércio não encontrado', 404);
        let admin = await User.findOne({ role: 'tenant_admin', tenantId }).select('+password').session(session);
        if (!admin) {
          if (!adminEmail || !adminSenha) throw service.erro('Informe e-mail e senha para criar o acesso do administrador');
          admin = new User({ username: adminEmail, email: adminEmail, password: adminSenha, role: 'tenant_admin', tenantId });
        } else {
          const credenciaisAlteradas = (adminEmail !== undefined && admin.email !== adminEmail) || adminSenha !== undefined;
          if (adminEmail !== undefined) {
            admin.username = adminEmail;
            admin.email = adminEmail;
          }
          if (adminSenha !== undefined) admin.password = adminSenha;
          if (credenciaisAlteradas) admin.tokenVersion = (admin.tokenVersion || 0) + 1;
        }
        await admin.save({ session });
        tenant.set(tenantDados(req.body));
        await tenant.save({ session });
      });
    } finally {
      await session.endSession();
    }
  } else {
    tenant = await Tenant.findByIdAndUpdate(tenantId, { $set: tenantDados(req.body) }, { new: true, runValidators: true });
    if (!tenant) throw service.erro('Comércio não encontrado', 404);
  }
  res.json(tenant);
}));
router.delete('/plataforma/tenants/:id', ...platformAuth, route(async (req, res) => {
  const tenantId = service.validarId(req.params.id);
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) throw service.erro('Comércio não encontrado', 404);
  if (await PedidoEntrega.exists({ tenantId })) throw service.erro('Não é possível excluir um comércio com pedidos; desative o cadastro para preservar o histórico.', 409);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const users = await User.find({ tenantId }).select('_id role').session(session).lean();
      const userIds = users.map(user => user._id);
      const admins = users.filter(user => user.role === 'tenant_admin').map(user => user._id);
      const couriers = await Entregador.find({ tenantId }).select('_id').session(session).lean();
      const courierIds = couriers.map(courier => courier._id);

      if (userIds.length) await User.updateMany({ _id: { $in: userIds }, role: { $ne: 'tenant_admin' } }, { $unset: { tenantId: 1 } }, { session });
      if (admins.length) {
        await AuthSession.deleteMany({ subjectId: { $in: admins }, kind: 'user' }, { session });
        await User.deleteMany({ _id: { $in: admins } }, { session });
      }
      if (courierIds.length) {
        await AuthSession.deleteMany({ subjectId: { $in: courierIds }, kind: 'courier' }, { session });
        await Entregador.deleteMany({ _id: { $in: courierIds } }, { session });
      }
      await Tenant.deleteOne({ _id: tenantId }, { session });
    });
  } finally {
    await session.endSession();
  }
  res.status(204).end();
}));
router.post('/plataforma/tenants/:id/vincular-pdv', ...platformAuth, route(async (req, res) => {
  const tenantId = service.validarId(req.params.id);
  if (!await Tenant.exists({ _id: tenantId, ativo: true })) throw service.erro('Comércio não encontrado', 404);
  const username = service.texto(req.body.username, 'usuário do PDV', true, 160).toLowerCase();
  const user = await User.findOneAndUpdate({ username, role: { $in: ['admin', 'operador', 'garcom'] } }, { tenantId }, { new: true });
  if (!user) throw service.erro('Operador do PDV não encontrado', 404);
  res.json({ username: user.username, tenantId: user.tenantId });
}));
router.get('/plataforma/entregadores', ...platformAuth, route(async (req, res) => {
  res.json(await Entregador.find().select('nome telefone status tenantId ativo').populate('tenantId', 'nome').sort({ nome: 1 }).lean());
}));
router.post('/plataforma/entregadores', ...platformAuth, route(async (req, res) => {
  const entregador = await Entregador.create({ nome: service.texto(req.body.nome, 'nome', true), telefone: service.texto(req.body.telefone, 'telefone', true, 30), senhaAcesso: validatePassword(req.body.senha), tenantId: null });
  res.status(201).json(entregador);
}));
router.put('/plataforma/entregadores/:id', ...platformAuth, route(async (req, res) => {
  const entregador = await Entregador.findById(service.validarId(req.params.id));
  if (!entregador) throw service.erro('Entregador não encontrado', 404);
  if (req.body.ativo !== undefined) {
    if (typeof req.body.ativo !== 'boolean') throw service.erro('Estado do entregador inválido');
    if (!req.body.ativo && await PedidoEntrega.exists({ entregadorId: entregador._id, status: { $in: statusAtivos } })) throw service.erro('O entregador possui pedido em andamento e não pode ser desativado.', 409);
    entregador.ativo = req.body.ativo;
    if (!req.body.ativo) entregador.status = 'offline';
  }
  if (req.body.nome !== undefined) entregador.nome = service.texto(req.body.nome, 'nome', true, 160);
  if (req.body.telefone !== undefined) entregador.telefone = service.texto(req.body.telefone, 'telefone', true, 30);
  if (req.body.senha !== undefined && req.body.senha !== '') {
    entregador.senhaAcesso = validatePassword(req.body.senha);
  }
  await entregador.save();
  if (req.body.senha) await AuthSession.deleteMany({ subjectId: entregador._id, kind: 'courier' });
  res.json(entregador);
}));
router.delete('/plataforma/entregadores/:id', ...platformAuth, route(async (req, res) => {
  const id = service.validarId(req.params.id);
  const entregador = await Entregador.findById(id);
  if (!entregador) throw service.erro('Entregador não encontrado', 404);
  if (await PedidoEntrega.exists({ entregadorId: id })) throw service.erro('Não é possível excluir um entregador associado a pedidos; desative o cadastro para preservar o histórico.', 409);
  await AuthSession.deleteMany({ subjectId: entregador._id, kind: 'courier' });
  await Entregador.deleteOne({ _id: entregador._id });
  res.status(204).end();
}));
router.post('/plataforma/tenants/:id/token-integracao', ...platformAuth, route(async (req, res) => {
  const tenantId = service.validarId(req.params.id);
  if (!await Tenant.exists({ _id: tenantId, ativo: true })) throw service.erro('Comércio não encontrado', 404);
  res.json({ token: jwt.sign({ role: 'sistema', tenantId }, getJwtSecret(), { expiresIn: '30d', algorithm: 'HS256' }), validadeDias: 30 });
}));

let streams = 0;
router.get('/rastreio/:token', publicLimit, route(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await service.rastrear(req.params.token));
}));
router.get('/rastreio/:token/stream', publicLimit, route(async (req, res) => {
  let encerrado = false;
  res.once('close', () => { encerrado = true; });
  const inicial = await service.rastrear(req.params.token);
  if (encerrado || res.destroyed) return;
  if (streams >= 200) throw service.erro('Rastreio ocupado. Use atualização periódica.', 503);
  streams++;
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  let atualizando = false;
  let ultimo = '';
  const publicar = dados => {
    const serializado = JSON.stringify(dados);
    if (!encerrado && serializado !== ultimo) {
      ultimo = serializado;
      res.write(`data: ${serializado}\n\n`);
    }
  };
  publicar(inicial);
  const atualizar = async () => {
    if (atualizando || encerrado) return;
    atualizando = true;
    try { publicar(await service.rastrear(req.params.token)); }
    catch { res.end(); }
    finally { atualizando = false; }
  };
  service.eventos.on(req.params.token, atualizar);
  const polling = setInterval(atualizar, 5000);
  const heartbeat = setInterval(() => { if (!encerrado) res.write(': heartbeat\n\n'); }, 15000);
  const expirar = setTimeout(() => res.end(), 30 * 60_000);
  res.on('close', () => {
    encerrado = true; streams--;
    clearInterval(polling); clearInterval(heartbeat); clearTimeout(expirar);
    service.eventos.removeListener(req.params.token, atualizar);
  });
}));

module.exports = router;
