const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const schema = new mongoose.Schema({
  email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['platform_admin', 'tenant_admin'], required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  tokenVersion: { type: Number, default: 0 },
}, { timestamps: true });

schema.pre('save', async function hashPassword() {
  if (this.isModified('passwordHash')) this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
});

schema.methods.matchesPassword = function matchesPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model('User', schema);
