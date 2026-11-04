const mongoose = require('mongoose');

function adicionarEscopoTenant(schema) {
  if (!schema.path('tenantId')) {
    schema.add({
      tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
    });
  }

  if (!schema.indexes().some(([keys]) => keys.tenantId === 1)) {
    schema.index({ tenantId: 1 });
  }

  return schema;
}

module.exports = adicionarEscopoTenant;
