const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Auditoria = require('../models/Auditoria');
const User = require('../models/User');
const { parsePagination, createPaginationResponse } = require('../utils/pagination');

const router = express.Router();

function dataFiltro(valor, fim = false) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(valor)) return null;
  const dia = valor.slice(0, 10);
  if (new Date(`${dia}T00:00:00Z`).toISOString().slice(0, 10) !== dia) return null;
  const data = new Date(valor.length === 10 ? `${valor}T${fim ? '23:59:59.999' : '00:00:00.000'}Z` : valor);
  return Number.isFinite(data.getTime()) ? data : null;
}

async function listarAuditoria(req, res, next) {
  const q = req.query;
  let pagination;
  try {
    pagination = parsePagination({
      pagina: q.pagina ?? q.page,
      limite: q.limite ?? q.limit,
    });
  } catch (error) {
    return res.status(400).json({ msg: error.message });
  }
  const { pagina, limite } = pagination;
  const inicio = q.dataInicio === undefined ? undefined : dataFiltro(q.dataInicio);
  const fim = q.dataFim === undefined ? undefined : dataFiltro(q.dataFim, true);
  const campos = ['page', 'limit', 'pagina', 'limite', 'usuario', 'acao', 'sucesso', 'dataInicio', 'dataFim'];
  if (campos.some(campo => q[campo] !== undefined && typeof q[campo] !== 'string') ||
      (q.dataInicio !== undefined && !inicio) || (q.dataFim !== undefined && !fim) ||
      (inicio && fim && inicio > fim) ||
      (q.acao !== undefined && !/^[a-z][a-z0-9_]{0,99}$/.test(q.acao)) ||
      (q.usuario !== undefined && (!q.usuario.trim() || q.usuario.length > 254)) ||
      (q.sucesso !== undefined && !['true', 'false'].includes(q.sucesso))) {
    return res.status(400).json({ msg: 'Filtros de auditoria inválidos' });
  }
  try {
    const filtros = {};
    if (q.acao) filtros.acao = q.acao;
    if (q.sucesso !== undefined) filtros.sucesso = q.sucesso === 'true';
    if (inicio || fim) filtros.createdAt = { ...(inicio ? { $gte: inicio } : {}), ...(fim ? { $lte: fim } : {}) };
    if (q.usuario) {
      const usuario = mongoose.isObjectIdOrHexString(q.usuario)
        ? q.usuario
        : (await User.findOne({ username: q.usuario.trim().toLowerCase() }).select('_id').lean())?._id;
      filtros.$or = [{ usuarioSolicitante: usuario || null }, { usuarioAutorizou: usuario || null }];
      if (!usuario) {
        const response = createPaginationResponse([], 0, pagination);
        return res.json({ ...response, registros: [], page: response.pagina, limit: response.limite });
      }
    }
    const [registros, total] = await Promise.all([
      Auditoria.find(filtros).populate('usuarioSolicitante', 'username role').populate('usuarioAutorizou', 'username role')
        .sort({ createdAt: -1, _id: -1 }).skip(pagination.skip).limit(limite).lean(),
      Auditoria.countDocuments(filtros),
    ]);
    const dados = registros.map(registro => ({ ...registro, data: registro.createdAt }));
    const response = createPaginationResponse(dados, total, pagination);
    return res.json({ ...response, registros: dados, page: response.pagina, limit: response.limite });
  } catch (error) { return next(error); }
}

router.get('/', auth, auth.allowRoles('admin'), listarAuditoria);
module.exports = router;
module.exports.listarAuditoria = listarAuditoria;
