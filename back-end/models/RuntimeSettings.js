const mongoose = require('mongoose');

const runtimeSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'authentication' },
  jwtSecret: { type: String, required: true, select: false },
}, { timestamps: true });

require('../utils/tenantSchema')(runtimeSettingsSchema);

module.exports = mongoose.model('RuntimeSettings', runtimeSettingsSchema);
