const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');

async function exigirTenant(req, res, next) {
  const tenantId = req.user?.tenantId;
  if (!mongoose.isObjectIdOrHexString(tenantId)) {
    return res.status(403).json({ msg: 'Usuário sem estabelecimento ativo associado' });
  }

  try {
    const tenant = await Tenant.findOne({ _id: tenantId, ativo: { $ne: false } }).lean();
    if (!tenant) return res.status(403).json({ msg: 'Estabelecimento inativo ou inexistente' });

    req.tenant = tenant;
    req.tenantId = String(tenant._id);
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = exigirTenant;
