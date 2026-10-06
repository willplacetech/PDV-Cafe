const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  subjectId: { type: mongoose.Schema.Types.ObjectId, required: true },
  kind: { type: String, enum: ['user', 'courier'], required: true },
  scope: { type: String, enum: ['pdv', 'delivery', 'courier'], required: true },
  tokenVersion: { type: Number, default: 0 },
  tokenHash: { type: String, required: true },
  previousHash: String,
  graceUntil: Date,
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ subjectId: 1, revokedAt: 1 });
module.exports = mongoose.model('AuthSession', schema);
