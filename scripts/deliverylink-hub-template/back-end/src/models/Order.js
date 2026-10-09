const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  externalReference: { type: String, trim: true, maxlength: 128 },
  requestDigest: String,
  trackingToken: { type: String, required: true, unique: true },
  customer: {
    name: { type: String, required: true, maxlength: 160 },
    phone: { type: String, required: true, maxlength: 30 },
    address: { type: String, required: true, maxlength: 500 },
  },
  items: [{ description: { type: String, required: true, maxlength: 240 }, quantity: { type: Number, required: true, min: 0.001 }, unitPrice: { type: Number, required: true, min: 0 } }],
  total: { type: Number, required: true, min: 0 },
  deliveryFee: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['pending', 'ready', 'dispatched', 'on_the_way', 'delivered', 'cancelled'], default: 'ready' },
  courierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Courier' },
  statusHistory: [{ status: String, at: { type: Date, default: Date.now } }],
}, {
  timestamps: true,
  toJSON: { transform: (_document, result) => { delete result.requestDigest; delete result.__v; return result; } },
});

schema.index({ tenantId: 1, externalReference: 1 }, { unique: true, partialFilterExpression: { externalReference: { $type: 'string' } } });

module.exports = mongoose.model('Order', schema);
