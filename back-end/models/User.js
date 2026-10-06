const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { validatePassword, validEmail, validUsername } = require('../utils/passwordPolicy');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Usuário é obrigatório'],
    unique: true,
    trim: true,
    minlength: [2, 'Usuário deve ter pelo menos 2 caracteres'],
    maxlength: [254, 'Usuário deve ter no máximo 254 caracteres'],
    validate: validUsername,
  },
  password: {
    type: String,
    required: [true, 'Senha é obrigatória'],
    select: false, // Não retorna senha nas consultas
  },
  role: {
    type: String,
    enum: ['admin', 'operador', 'cozinha', 'garcom', 'admin_plataforma', 'tenant_admin', 'entregador'],
    default: 'operador',
  },
  ativo: { type: Boolean, default: true },
  tokenVersion: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  email: { type: String, trim: true, lowercase: true, unique: true, sparse: true, maxlength: 254, validate: valor => valor == null || validEmail(valor) },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Validar somente senhas novas; hashes persistidos e credenciais legadas continuam válidos.
UserSchema.pre('validate', function (next) {
  try {
    if (this.isModified('password')) validatePassword(this.password);
    next();
  } catch (error) { next(error); }
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
