const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Configuracoes = require('../models/Configuracoes');
const { getJwtSecret } = require('../utils/authConfig');
const Auditoria = require('../models/Auditoria');

const cacheConfiguracao = { valor: null, expiracao: 0 };
const TTL_CONFIGURACAO_MS = 30 * 1000;

const INVALIDAR_CACHE = () => {
  cacheConfiguracao.valor = null;
  cacheConfiguracao.expiracao = 0;
};

const obterConfiguracaoGerente = async () => {
  if (process.env.FORCAR_AUTORIZACAO_GERENTE === 'true') {
    return true;
  }

  const agora = Date.now();
  if (cacheConfiguracao.valor !== null && cacheConfiguracao.expiracao > agora) {
    return cacheConfiguracao.valor;
  }

  let configuracao = await Configuracoes.findOne({ _id: 'principal' }).lean();
  if (!configuracao) {
    configuracao = await Configuracoes.create({ _id: 'principal', exigirAutorizacaoGerente: true });
  }

  const valor = configuracao.exigirAutorizacaoGerente !== false;
  cacheConfiguracao.valor = valor;
  cacheConfiguracao.expiracao = agora + TTL_CONFIGURACAO_MS;
  return valor;
};

const EXIGIR_AUTORIZACAO = true;

const detalhesAuditoria = (req, acao) => {
  const parts = [];
  if (req.params?.id) parts.push(`id:${req.params.id}`);
  if (req.params?.itemId) parts.push(`itemId:${req.params.itemId}`);
  return `${acao} — ${parts.join(', ')} ${req.originalUrl}`;
};

const registrarAuditoria = async (usuarioSolicitante, usuarioAutorizou, acao, detalhes, sucesso, ip, motivoFalha = null) => {
  try {
    await Auditoria.create({
      usuarioSolicitante: usuarioSolicitante ? new mongoose.Types.ObjectId(usuarioSolicitante) : null,
      usuarioAutorizou: usuarioAutorizou ? new mongoose.Types.ObjectId(usuarioAutorizou) : null,
      acao,
      detalhes,
      ip,
      sucesso,
      motivoFalha,
    });
  } catch { /* Auditoria não deve bloquear fluxo de negócio. */ }
};

const verificarAutorizacao = async (req, acao) => {
  const token = req.headers['x-autorizacao-gerente'];
  const recusar = () => { throw Object.assign(new Error('Autorização do gerente necessária'), { status: 403, acao }); };

  if (!token) {
    await registrarAuditoria(req.user?.id, null, acao, detalhesAuditoria(req, acao), false, req.ip, 'token_ausente');
    return recusar();
  }

  try {
    const claims = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    if (claims.tipo !== 'autorizacao-gerente' || claims.acao !== acao || claims.solicitante !== req.user?.id || claims.sessao !== (req.user?.sid || null) || claims.versaoSolicitante !== (req.user?.tokenVersion ?? 0)) {
      await registrarAuditoria(
        req.user?.id, claims.id, acao, detalhesAuditoria(req, acao), false, req.ip, 'acao_invalida'
      );
      return recusar();
    }

    const user = await User.findById(claims.id).select('username role ativo tokenVersion').lean();
    if (!user || user.ativo === false || claims.versaoGerente !== (user.tokenVersion ?? 0) || !['admin', 'gerente'].includes(user.role)) {
      await registrarAuditoria(req.user?.id, claims.id, acao, detalhesAuditoria(req, acao), false, req.ip, 'perfil_invalido');
      return recusar();
    }

    req.gerenteAutorizou = { id: String(user._id), username: user.username, role: user.role };
    await registrarAuditoria(req.user?.id, user._id, acao, detalhesAuditoria(req, acao), true, req.ip);
    return claims;
  } catch (error) {
    if (error.status === 403) throw error;
    if (!['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) throw error;
    await registrarAuditoria(req.user?.id, null, acao, detalhesAuditoria(req, acao), false, req.ip, 'token_invalido');
    return recusar();
  }
};

const exigirAutorizacao = acao => async (req, res, next) => {
  try {
    if (!(await obterConfiguracaoGerente())) {
      return next();
    }

    await verificarAutorizacao(req, acao);
    next();
  }
  catch (error) {
    if (error.status !== 403) return next(error);
    res.status(403).json({ msg: error.message, acao: error.acao });
  }
};

const exigirPrecoManual = (req, res, next) => {
  const itens = [req.body, ...(Array.isArray(req.body?.itens) ? req.body.itens : [])];
  if (itens.some(item => item && Object.hasOwn(item, 'precoUnitarioManual'))) return exigirAutorizacao('alterar_preco')(req, res, next);
  next();
};

module.exports = {
  exigirAutorizacao,
  verificarAutorizacao,
  exigirPrecoManual,
  registrarAuditoria,
  EXIGIR_AUTORIZACAO,
  obterConfiguracaoGerente,
  invalidarCacheConfiguracaoGerente: INVALIDAR_CACHE,
};
