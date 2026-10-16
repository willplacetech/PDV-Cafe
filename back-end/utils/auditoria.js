const mongoose = require('mongoose');
const Auditoria = require('../models/Auditoria');

async function registrarAuditoria(usuarioSolicitante, usuarioAutorizou, acao, detalhes, sucesso, ip, motivoFalha = null) {
  try {
    return await Auditoria.create({
      usuarioSolicitante: mongoose.isObjectIdOrHexString(usuarioSolicitante) ? usuarioSolicitante : null,
      usuarioAutorizou: mongoose.isObjectIdOrHexString(usuarioAutorizou) ? usuarioAutorizou : null,
      acao, detalhes, sucesso, ip, motivoFalha,
    });
  } catch {
    console.error('[Auditoria] Falha ao persistir registro');
    return null;
  }
}

function auditarRequisicao(req, acao, sucesso, detalhes, motivoFalha) {
  return registrarAuditoria(
    req.usuarioAuditoria?.id || req.user?.id,
    req.gerenteAutorizou?.id,
    acao,
    detalhes ?? (req.originalUrl || req.url || '').split('?')[0],
    sucesso,
    req.ip,
    motivoFalha,
  );
}

module.exports = { registrarAuditoria, auditarRequisicao };
