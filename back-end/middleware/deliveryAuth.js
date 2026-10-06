const mongoose = require('mongoose');
const auth = require('./auth');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const Entregador = require('../models/Entregador');

const proteger = (tipo) => [auth, async (req, res, next) => {
  try {
    if (tipo === 'entregador') {
      if (req.user.role !== 'entregador' || !mongoose.isValidObjectId(req.user.entregadorId)) return res.status(403).json({ msg: 'Acesso de entregador obrigatório' });
      req.entregador = await Entregador.findOne({ _id: req.user.entregadorId, ativo: true });
      if (!req.entregador) return res.status(403).json({ msg: 'Entregador desativado' });
      return next();
    }
    if (tipo === 'integracao' && req.user.role === 'sistema') {
      if (!mongoose.isValidObjectId(req.user.tenantId)) return res.status(403).json({ msg: 'Comércio inválido' });
      req.tenant = await Tenant.findOne({ _id: req.user.tenantId, ativo: true });
      if (!req.tenant) return res.status(403).json({ msg: 'Comércio desativado' });
      req.tenantId = req.tenant._id;
      return next();
    }
    if (!mongoose.isValidObjectId(req.user.id)) return res.status(403).json({ msg: 'Usuário inválido' });
    req.deliveryUser = await User.findById(req.user.id);
    if (!req.deliveryUser || req.deliveryUser.ativo === false || req.deliveryUser.role !== req.user.role || (req.deliveryUser.tokenVersion ?? 0) !== req.user.tokenVersion) return res.status(403).json({ msg: 'Acesso revogado' });
    if (tipo === 'plataforma') {
      if (req.deliveryUser.role !== 'admin_plataforma') return res.status(403).json({ msg: 'Acesso de plataforma obrigatório' });
      return next();
    }
    const permitidos = tipo === 'integracao' ? ['admin', 'operador', 'garcom', 'tenant_admin'] : ['tenant_admin'];
    if (!permitidos.includes(req.deliveryUser.role) || !req.deliveryUser.tenantId) return res.status(403).json({ msg: 'Comércio não associado ao usuário' });
    req.tenant = await Tenant.findOne({ _id: req.deliveryUser.tenantId, ativo: true });
    if (!req.tenant) return res.status(403).json({ msg: 'Comércio desativado' });
    req.tenantId = req.tenant._id;
    next();
  } catch (error) { next(error); }
}];

module.exports = { tenantAuth: proteger('tenant'), courierAuth: proteger('entregador'), platformAuth: proteger('plataforma'), integrationAuth: proteger('integracao') };
