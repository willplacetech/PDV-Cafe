const mongoose = require('mongoose');

const historicoCustoSchema = new mongoose.Schema({
  produtoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  custoUnitario: { type: Number, required: true },
  receitaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe', default: null },
  motivo: {
    type: String,
    enum: ['atualizacao_insumo', 'calculo_manual', 'alteracao_receita'],
    required: true,
  },
  data: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('HistoricoCusto', historicoCustoSchema);
