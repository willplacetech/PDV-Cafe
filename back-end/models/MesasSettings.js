const mongoose = require('mongoose');

const mesaSchema = new mongoose.Schema({
  id: { type: Number, required: true, min: 1 },
  numero: { type: Number, required: true, min: 1 },
  nome: { type: String, required: true, trim: true, maxlength: 100 },
  lugares: { type: Number, required: true, min: 1, max: 100 },
  ativa: { type: Boolean, required: true },
}, { _id: false });

const mesasSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'principal' },
  mesas: { type: [mesaSchema], default: [] },
  oferecerBalcao: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('MesasSettings', mesasSettingsSchema);
