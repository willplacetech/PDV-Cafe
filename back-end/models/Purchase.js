const mongoose = require('mongoose');

const PurchaseItemSchema = new mongoose.Schema({
  produtoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  valorTotal: { type: Number, required: true, min: [0.000001, 'Valor total deve ser maior que zero'] },
  qtdEmbalagens: { type: Number, required: true, min: [0.000001, 'Quantidade de embalagens deve ser maior que zero'] },
  conteudoPorEmbalagem: { type: Number, required: true, min: [0.000001, 'Conteúdo por embalagem deve ser maior que zero'] },
  unidadeConteudo: { type: String, enum: ['mg', 'g', 'kg', 'ml', 'l', 'un'], required: true },
  quantidadeTotal: { type: Number, required: true, min: [0.000001, 'Quantidade total deve ser maior que zero'] },
  custoUnitario: { type: Number, required: true, min: [0.000001, 'Custo unitário deve ser maior que zero'] },
}, { _id: false });

const PurchaseSchema = new mongoose.Schema({
  fornecedor: { type: String, required: true, trim: true },
  numeroNF: { type: String, required: true, trim: true },
  data: { type: Date, required: true },
  metodoCusteio: { type: String, enum: ['media_ponderada', 'ultimo_preco'], required: true },
  itens: { type: [PurchaseItemSchema], required: true, validate: [(items) => items.length > 0, 'A compra deve ter pelo menos um item'] },
  valorTotal: { type: Number, required: true, min: [0.000001, 'Valor total da compra deve ser maior que zero'] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

PurchaseSchema.index({ data: -1 });
PurchaseSchema.index({ numeroNF: 1 });

module.exports = mongoose.model('Purchase', PurchaseSchema);
