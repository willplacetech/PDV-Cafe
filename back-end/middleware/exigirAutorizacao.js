const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { getJwtSecret } = require('../utils/authConfig');
const Auditoria = require('../models/Auditoria');
const Configuracoes = require('../models/Configuracoes');

let cachedValor = null;
let cacheTimestamp = 0;
const CACHE_DURATION_MS = 30 * 1000; // 30 seconds

const getExigirAutorizacao = async () => {
  // Check for override environment variable
  if (process.env.FORCAR_AUTORIZACAO_GERENTE === 'true') {
    return true;
  }

  // Use cache if valid
  const now = Date.now();
  if (cachedValor !== null && (now - cacheTimestamp) < CACHE_DURATION_MS) {
    return cachedValor;
  }

  try {
    const configuracao = await Configuracoes.findOne({ _id: 'principal' });
    const valor = configuracao ? configuracao.exigirAutorizacaoGerente : true; // default to true
    cachedValor = valor;
    cacheTimestamp = now;
    return valor;
  } catch (error) {
    console.error('Erro ao ler configuração de autorização do gerente:', error);
    // In case of error, default to true (safe side)
    return true;
  }
};

const detalhesAuditoria = (req, acao) => {
  const parts = [];
  if (req.params?.id) parts.push(id:\${req.params.id});
  if (req.params?.itemId) parts.push(itemId:\${req.params.itemId});
  return \`\${acao} — \${parts.join(', ')} \${req.originalUrl}\`;
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

const exigirAutorizacao = (acao) => async (req, res, next) => {
  const exigirAutorizacaoGerente = await getExigirAutorizacao();
  if (!exigirAutorizacaoGerente) return next();

  const token = req.headers['x-autorizacao-gerente'];

  try {
    const claims = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    if (claims.acao !== acao) {
      await registrarAuditoria(
        req.user?.id, claims.id, acao, detalhesAuditoria(req, acao), false, req.ip, 'acao_invalida'
      );
      return res.status(403).json({ msg: 'Autorização inválida para esta ação' });
    }

    const user = await User.findById(claims.id).select('username role').lean();
    if (!user || !['admin', 'gerente'].includes(user.role)) {
      await registrarAuditoria(req.user?.id, claims.id, acao, detalhesAuditoria(req, acao), false, req.ip, 'perfil_invalido');
      return res.status(403).json({ msg: 'Autorização inválida para esta ação' });
    }

    req.gerenteAutorizou = { id: user.id, username: user.username, role: user.role };
    await registrarAuditoria(req.user?.id, user.id, acao, detalhesAuditoria(req, acao), true, req.ip);
    next();
  } catch (error) {
    await registrarAuditoria(req.user?.id, null, acao, detalhesAuditoria(req, acao), false, req.ip, 'token_invalido');
    return res.status(403).json({ msg: 'Autorização do gerente necessária' });
  }
};

module.exports = { exigirAutorizacao, registrarAuditoria, getExigirAutorizacao };
