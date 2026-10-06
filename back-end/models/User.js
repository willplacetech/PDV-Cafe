const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Usuário é obrigatório'],
    unique: true,
    trim: true,
    minlength: [2, 'Usuário deve ter pelo menos 2 caracteres'],
  },
  password: {
    type: String,
    required: [true, 'Senha é obrigatória'],
    minlength: [4, 'Senha deve ter pelo menos 4 caracteres'],
    select: false, // Não retorna senha nas consultas
  },
  role: {
    type: String,
    enum: ['admin', 'operador', 'cozinha', 'garcom', 'admin_plataforma', 'tenant_admin', 'entregador'],
    default: 'operador',
  },
  email: { type: String, trim: true, lowercase: true, unique: true, sparse: true, maxlength: 254 },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Criptografar senha antes de salvar
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Comparar senhas
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);