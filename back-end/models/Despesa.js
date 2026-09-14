const mongoose = require('mongoose');

const despesaSchema = new mongoose.Schema({
  descricao: { type: String, required: true, trim: true },
  categoria: {
    type: String,
    enum: ['Aluguel', 'Energia', 'Água', 'Internet', 'Fornecedores/Insumos', 'Salários/Pró-labore', 'Impostos', 'Marketing', 'Manutenção', 'Transporte', 'Outros'],
    required: true,
    default: 'Outros',
  },
  fornecedor: { type: String, trim: true },
  valor: { type: Number, required: true, min: 0.01 },
  dataVencimento: { type: Date, required: true },
  dataPagamento: { type: Date },
  status: {
    type: String,
    enum: ['pendente', 'pago', 'atrasado'],
    default: 'pendente',
  },
  recorrente: { type: Boolean, default: false },
  frequenciaRecorrencia: {
    type: String,
    enum: ['mensal', 'semanal', 'anual'],
  },
  usuarioCadastro: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  origemRecorrencia: { type: mongoose.Schema.Types.ObjectId, ref: 'Despesa' },
}, { timestamps: true });

despesaSchema.index({ status: 1, dataVencimento: 1, categoria: 1 });

despesaSchema.pre('save', function(next) {
  if (this.dataPagamento && this.status !== 'pago') {
    this.status = 'pago';
  }
  if (!this.dataPagamento && this.dataVencimento && this.dataVencimento < new Date() && this.status === 'pendente') {
    this.status = 'atrasado';
  }
  next();
});

module.exports = mongoose.model('Despesa', despesaSchema);
