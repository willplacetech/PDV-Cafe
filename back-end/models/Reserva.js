const mongoose = require('mongoose');

const reservaSchema = new mongoose.Schema({
  codigo: { type: String, required: true, unique: true, immutable: true, trim: true, maxlength: 32, index: true },
  data: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  horario: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  pessoas: { type: Number, required: true, min: 1, max: 100, validate: Number.isSafeInteger },
  nome: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  telefone: { type: String, required: true, trim: true, minlength: 8, maxlength: 30, index: true },
  status: { type: String, enum: ['pendente', 'confirmada', 'check_in', 'cancelada', 'no_show'], default: 'pendente', index: true },
  mesaId: { type: Number, min: 1 },
  mesaNumero: { type: Number, min: 1 },
  mesaToken: { type: String, trim: true, maxlength: 128 },
  comandaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comanda' },
  observacao: { type: String, trim: true, maxlength: 500 },
  canceladaEm: Date,
  confirmadaEm: Date,
  checkInEm: Date,
}, { timestamps: true });

reservaSchema.index({ data: 1, horario: 1, status: 1 });

module.exports = mongoose.model('Reserva', reservaSchema);
