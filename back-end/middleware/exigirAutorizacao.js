const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { getJwtSecret } = require('../utils/authConfig');
const Auditoria = require('../models/Auditoria');

const EXIGIR_AUTORIZACAO = process.env.EXIGIR_AUTORIZACAO_GERENTE !== 'false';

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

const exigirAutorizacao = (acao) => async (req, res, next) => {
  if (!EXIGIR_AUTORIZACAO) return next();

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

module.exports = { exigirAutorizacao, registrarAuditoria, EXIGIR_AUTORIZACAO };
