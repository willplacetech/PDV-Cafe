const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { validatePassword } = require('../utils/passwordPolicy');

const entregadorSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true, maxlength: 160 },
  telefone: { type: String, required: true, unique: true, match: /^\d{10,15}$/, set: valor => typeof valor === 'string' ? valor.replace(/\D/g, '') : valor },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
  ativo: { type: Boolean, default: true },
  senhaAcesso: { type: String, required: true, select: false },
  status: { type: String, enum: ['offline', 'disponivel', 'em_entrega'], default: 'offline' },
  posicaoAtual: {
    type: new mongoose.Schema({
      lat: { type: Number, required: true, min: -90, max: 90, validate: Number.isFinite },
      lng: { type: Number, required: true, min: -180, max: 180, validate: Number.isFinite },
      atualizadoEm: { type: Date, default: Date.now },
    }, { _id: false }),
    default: undefined,
  },
}, { timestamps: true });

entregadorSchema.pre('validate', function(next) {
  try {
    if (this.isModified('senhaAcesso')) validatePassword(this.senhaAcesso);
    next();
  } catch (error) { next(error); }
});

entregadorSchema.pre('save', async function(next) {
  try {
    if (this.isModified('senhaAcesso')) this.senhaAcesso = await bcrypt.hash(this.senhaAcesso, 10);
    next();
  } catch (error) { next(error); }
});
entregadorSchema.methods.matchPassword = function(senha) { return bcrypt.compare(senha, this.senhaAcesso); };
entregadorSchema.set('toJSON', { transform: (doc, ret) => { delete ret.senhaAcesso; return ret; } });
entregadorSchema.index({ tenantId: 1, ativo: 1 });

module.exports = mongoose.model('Entregador', entregadorSchema);
