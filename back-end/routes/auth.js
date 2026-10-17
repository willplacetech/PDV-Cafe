const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const AuthSession = require('../models/AuthSession');
const auth = require('../middleware/auth');
const { exigirAutorizacao, registrarAuditoria } = require('../middleware/exigirAutorizacao');
const Auditoria = require('../models/Auditoria');
const { getJwtSecret } = require('../utils/authConfig');
const { parsePagination, createPaginationResponse } = require('../utils/pagination');
const router = express.Router();
const { PASSWORD_MESSAGE, validLoginPassword, validNewPassword, validUsername } = require('../utils/passwordPolicy');
const sessions = require('../utils/authSessions');
const pdvRoles = ['admin', 'gerente', 'operador', 'cozinha', 'garcom'];
const publicManagedUser = user => ({ id: user.id, username: user.username, role: user.role, ativo: user.ativo !== false });

const cookieOptions = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 24 * 60 * 60 * 1000,
  path: '/',
};

const { trustedOrigin } = require('../utils/sessionOrigins');

router.post('/login', async (req, res, next) => {
  const origin = req?.headers?.origin;
  if (typeof origin === 'string' && !trustedOrigin(req)) {
    return res.status(403).json({ msg: 'Origem da sessão não autorizada' });
  }
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !validUsername(username.trim()) || typeof password !== 'string' || !validLoginPassword(password)) {
    return res.status(400).json({ msg: 'Informe usuário e senha válidos' });
  }
  try {
    const user = await User.findOne({ username: username.toLowerCase().trim() }).select('+password');
    if (!user || user.ativo === false || !(await user.matchPassword(password))) {
      return res.status(401).json({ msg: 'Usuário ou senha inválidos' });
    }
    const publicUser = { id: user.id, username: user.username, role: user.role, ...(user.tenantId ? { tenantId: user.tenantId } : {}) };
    return res.json(await sessions.issue(req, res, user, 'pdv', publicUser));
  } catch (error) { return next(error); }
});

router.get('/me', auth, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, role: req.user.role, ...(req.user.tenantId ? { tenantId: req.user.tenantId } : {}) });
});

router.post('/refresh', ...sessions.refresh('pdv'));

router.post('/register', auth, auth.allowRoles('admin'), exigirAutorizacao('criar_usuario'), async (req, res) => {
  try {
    const body = req.body || {};
    const username = typeof body.username === 'string' ? body.username.toLowerCase().trim() : '';
    const password = body.password;
    const roles = ['admin', 'gerente', 'operador', 'cozinha', 'garcom'];
    if (body.role !== undefined && !roles.includes(body.role)) {
      return res.status(400).json({ msg: 'Perfil inválido' });
    }
    const role = body.role || 'operador';
    if (!validUsername(username)) return res.status(400).json({ msg: 'Usuário deve ter entre 2 e 254 caracteres válidos' });
    if (!validNewPassword(password)) return res.status(400).json({ msg: PASSWORD_MESSAGE });
    if (await User.exists({ username })) return res.status(409).json({ msg: 'Este usuário já existe' });
    const tenant = ['admin', 'gerente', 'operador'].includes(role)
      ? await Tenant.findOne({ pdvIntegrado: true, ativo: true }).select('_id').lean()
      : null;
    const user = await User.create({ username, password, role, ...(tenant ? { tenantId: tenant._id } : {}) });
    res.status(201).json({ id: user.id, username: user.username, role: user.role });
  } catch (err) { res.status(400).json({ msg: err.message }); }
});

router.get('/users', auth, auth.allowRoles('admin'), async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const filter = { role: { $in: pdvRoles }, username: { $not: /^dola$/i } };
    const total = pagination.requested ? await User.countDocuments(filter) : null;
    let usersQuery = User.find(filter).select('username role ativo').sort({ username: 1, _id: 1 });
    if (pagination.requested) {
      const totalPaginas = Math.ceil(total / pagination.limite);
      const pagina = Math.min(pagination.pagina, Math.max(1, totalPaginas));
      usersQuery = usersQuery.skip((pagina - 1) * pagination.limite).limit(pagination.limite);
    }
    const users = (await usersQuery).map(publicManagedUser);
    res.json(pagination.requested ? createPaginationResponse(users, total, pagination) : users);
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ msg: error.message });
    next(error);
  }
});

router.patch('/users/:id', auth, auth.allowRoles('admin'), exigirAutorizacao('editar_usuario'), async (req, res, next) => {
  const body = req.body || {};
  const campos = Object.keys(body);
  if (!mongoose.isObjectIdOrHexString(req.params.id) || !campos.length || campos.some(campo => !['ativo', 'role', 'password'].includes(campo))) {
    return res.status(400).json({ msg: 'Informe usuário e campos válidos' });
  }
  if (('ativo' in body && typeof body.ativo !== 'boolean') || ('role' in body && !pdvRoles.includes(body.role)) || ('password' in body && !validNewPassword(body.password))) {
    return res.status(400).json({ msg: `Informe estado e perfil válidos. ${PASSWORD_MESSAGE}` });
  }
  try {
    const alteracoes = {};
    if ('ativo' in body) alteracoes.ativo = body.ativo;
    if ('role' in body) alteracoes.role = body.role;
    if (['admin', 'operador'].includes(body.role)) {
      const tenant = await Tenant.findOne({ pdvIntegrado: true, ativo: true }).select('_id').lean();
      if (tenant) alteracoes.tenantId = tenant._id;
    }
    if ('password' in body) alteracoes.password = await bcrypt.hash(body.password, 10);
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: { $in: pdvRoles } },
      { $set: alteracoes, $inc: { tokenVersion: 1 } },
      { new: true, runValidators: true },
    );
    if (!user) return res.status(404).json({ msg: 'Usuário não encontrado' });
    res.json(publicManagedUser(user));
  } catch (error) { next(error); }
});

router.delete('/users/:id', auth, auth.allowRoles('admin'), exigirAutorizacao('desativar_usuario'), async (req, res, next) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) {
    return res.status(400).json({ msg: 'Informe um usuário válido' });
  }
  if (String(req.user.id).toLowerCase() === req.params.id.toLowerCase()) {
    return res.status(409).json({ msg: 'Não é possível excluir o usuário conectado' });
  }
  try {
    const user = await User.findOneAndDelete({ _id: req.params.id, role: { $in: pdvRoles } });
    if (!user) return res.status(404).json({ msg: 'Usuário não encontrado' });
    await AuthSession.deleteMany({ subjectId: user._id, kind: 'user', scope: 'pdv' });
    res.status(204).end();
  } catch (error) { next(error); }
});

router.post('/logout', sessions.logoutAuth('pdv', auth), async (req, res, next) => {
  try {
    if (!await sessions.revokeAccessSession(req.user)) {
      const user = await User.findByIdAndUpdate(req.user.id, { $inc: { tokenVersion: 1 } });
      if (!user) return res.status(401).json({ msg: 'Sessão inválida ou expirada' });
    }
    const clearCookieOptions = { ...cookieOptions };
    delete clearCookieOptions.maxAge;
    res.clearCookie('pdv_token', clearCookieOptions);
    sessions.clearCookie(res, 'pdv');
    res.status(204).end();
  } catch (error) { next(error); }
});

router.post('/autorizar', auth, async (req, res, next) => {
  const { senha, acao } = req.body || {};
  if (typeof acao !== 'string' || !acao.trim()) {
    return res.status(400).json({ msg: 'Informe a ação a autorizar' });
  }

  const acoesValidas = [
    'cancelar_venda', 'alterar_preco', 'sangria_suprimento', 'fechar_caixa',
    'excluir_produto', 'excluir_cliente', 'excluir_insumo',
    'alterar_taxas_cartao', 'alterar_configuracao', 'criar_usuario', 'editar_usuario',
    'desativar_usuario', 'trocar_perfil_usuario', 'exportar_dados', 'excluir_item', 'reabrir_comanda', 'reabrir_caixa', 'desconto_acima_10',
  ];
  if (!acoesValidas.includes(acao)) {
    return res.status(400).json({ msg: `Ação "${acao}" não reconhecida` });
  }

  try {
    const solicitante = await User.findById(req.user.id).select('+autorizacaoTentativas +autorizacaoBloqueadaAte +password');
    if (!solicitante || solicitante.ativo === false) return res.status(401).json({ msg: 'Usuário inválido' });

    // Admin: isento de senha (token só para fluxos legados que ainda enviam header)
    if (solicitante.role === 'admin') {
      const tokenAutorizacao = jwt.sign(
        { tipo: 'autorizacao-gerente', id: solicitante.id, acao, solicitante: req.user.id, sessao: req.user.sid || null, versaoSolicitante: req.user.tokenVersion ?? 0, versaoGerente: solicitante.tokenVersion ?? 0 },
        getJwtSecret(),
        { algorithm: 'HS256', expiresIn: '5m' }
      );
      await registrarAuditoria(req.user.id, solicitante.id, acao, 'autorizado como admin (isento de senha)', true, req.ip);
      return res.json({ tokenAutorizacao, autorizado: true });
    }

    if (typeof senha !== 'string' || !validLoginPassword(senha)) {
      return res.status(400).json({ msg: 'Informe a senha e a ação a autorizar' });
    }

    const bloqueio = ate => {
      const segundos = Math.max(1, Math.ceil((new Date(ate).getTime() - Date.now()) / 1000));
      res.set('Retry-After', String(segundos));
      return res.status(429).json({ msg: `Autorização bloqueada. Aguarde ${segundos}s.`, bloqueadoAte: new Date(ate).getTime() });
    };
    if (solicitante.autorizacaoBloqueadaAte > new Date()) return bloqueio(solicitante.autorizacaoBloqueadaAte);

    // Gerente: valida a própria senha. Demais: senha de admin/gerente do mesmo tenant.
    const filtro = solicitante.role === 'gerente'
      ? { _id: solicitante._id }
      : { role: { $in: ['admin', 'gerente'] }, tenantId: solicitante.tenantId || null };
    const candidatos = await User.find({ ...filtro, ativo: { $ne: false } }).select('+password');
    let user;
    for (const candidato of candidatos) {
      if (await candidato.matchPassword(senha)) { user = candidato; break; }
    }
    if (!user) {
      const agora = new Date();
      const tentativa = await User.findByIdAndUpdate(solicitante._id, [
        { $set: { autorizacaoTentativas: { $cond: [
          { $and: [{ $ne: [{ $ifNull: ['$autorizacaoBloqueadaAte', null] }, null] }, { $lte: ['$autorizacaoBloqueadaAte', agora] }] },
          1, { $add: [{ $ifNull: ['$autorizacaoTentativas', 0] }, 1] },
        ] } } },
        { $set: { autorizacaoBloqueadaAte: { $cond: [
          { $gte: ['$autorizacaoTentativas', 3] },
          { $cond: [{ $gt: ['$autorizacaoBloqueadaAte', agora] }, '$autorizacaoBloqueadaAte', new Date(agora.getTime() + 60_000)] },
          '$$REMOVE',
        ] } } },
      ], { new: true }).select('+autorizacaoTentativas +autorizacaoBloqueadaAte');
      await registrarAuditoria(req.user.id, null, acao, 'tentativa falhou — senha incorreta', false, req.ip, 'senha_incorreta');
      if (tentativa.autorizacaoTentativas >= 3) {
        await registrarAuditoria(req.user.id, null, acao, 'Três tentativas inválidas; bloqueio de 60 segundos', false, req.ip, 'bloqueio_60s');
        return bloqueio(tentativa.autorizacaoBloqueadaAte);
      }
      return res.status(403).json({ msg: 'Senha incorreta', tentativasRestantes: 3 - tentativa.autorizacaoTentativas });
    }

    if (!['admin', 'gerente'].includes(user.role)) {
      return res.status(403).json({ msg: 'Este usuário não tem permissão para autorizar' });
    }

    const tokenAutorizacao = jwt.sign(
      { tipo: 'autorizacao-gerente', id: user.id, acao, solicitante: req.user.id, sessao: req.user.sid || null, versaoSolicitante: req.user.tokenVersion ?? 0, versaoGerente: user.tokenVersion ?? 0 },
      getJwtSecret(),
      { algorithm: 'HS256', expiresIn: '5m' }
    );

    const liberado = await User.updateOne({ _id: solicitante._id, $or: [{ autorizacaoBloqueadaAte: { $exists: false } }, { autorizacaoBloqueadaAte: { $lte: new Date() } }] }, { $set: { autorizacaoTentativas: 0 }, $unset: { autorizacaoBloqueadaAte: '' } });
    if (!liberado.matchedCount) {
      const atual = await User.findById(solicitante._id).select('+autorizacaoBloqueadaAte');
      return bloqueio(atual.autorizacaoBloqueadaAte);
    }
    await registrarAuditoria(req.user.id, user.id, acao, 'autorizado pela senha', true, req.ip);
    return res.json({ tokenAutorizacao, autorizado: true });
  } catch (error) { next(error); }
});

router.get('/auditoria', auth, auth.allowRoles('admin'), async (req, res, next) => {
  try {
    const filtros = {};
    if (req.query.acao) filtros.acao = req.query.acao;
    if (req.query.sucesso !== undefined) filtros.sucesso = req.query.sucesso === 'true';
    if (req.query.dataInicio && req.query.dataFim) {
      filtros.createdAt = { $gte: new Date(req.query.dataInicio), $lte: new Date(req.query.dataFim) };
    } else if (req.query.dataInicio) {
      filtros.createdAt = { $gte: new Date(req.query.dataInicio) };
    }
    const auditoria = await Auditoria.find(filtros)
      .populate('usuarioSolicitante', 'username role')
      .populate('usuarioAutorizou', 'username role')
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit) || 100)
      .lean();
    res.json(auditoria);
  } catch (error) { next(error); }
});

module.exports = router;
