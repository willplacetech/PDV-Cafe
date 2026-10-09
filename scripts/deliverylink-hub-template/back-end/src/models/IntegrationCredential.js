const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  digest: { type: String, required: true, unique: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('IntegrationCredential', schema);
