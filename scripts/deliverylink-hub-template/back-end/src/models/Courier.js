const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  phone: { type: String, required: true, trim: true, maxlength: 30 },
  passwordHash: { type: String, required: true, select: false },
  active: { type: Boolean, default: true },
  available: { type: Boolean, default: true },
  tokenVersion: { type: Number, default: 0 },
}, { timestamps: true });

schema.index({ tenantId: 1, phone: 1 }, { unique: true });
schema.pre('save', async function hashPassword() {
  if (this.isModified('passwordHash')) this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
});
schema.methods.matchesPassword = function matchesPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model('Courier', schema);
