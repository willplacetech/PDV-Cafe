const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { NfceProviderError, emitirNfce, getFiscalConfig } = require('../utils/nfce');

const router = express.Router();

router.get('/config', auth, auth.allowRoles('admin', 'operador'), (req, res) => {
  const config = getFiscalConfig();
  res.json({ habilitado: config.missing.length === 0, ambiente: config.ambiente,
    faltantes: config.missing, certificadoVencendo: config.certificadoVencendo,
    certificadoExpiraEm: config.certificadoExpiraEm,
    aviso: config.missing.length ? 'Nota não emitida — complete os dados da empresa' : null });
});

router.post('/orders/:id/emitir', auth, auth.allowRoles('admin', 'operador'), async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ msg: 'ID de pedido inválido' });
  try {
    let order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ msg: 'Pedido não encontrado' });
    if (order.nfce?.status === 'autorizada' && order.nfce.chaveAcesso && order.nfce.protocolo) {
      return res.json({ order, nfce: order.nfce, jaEmitida: true });
    }
    if (order.nfce?.status === 'autorizada') return res.status(409).json({ msg: 'Nota registrada como autorizada sem dados completos. Consulte o provedor antes de reemitir.', nfce: order.nfce });
    if (order.status === 'cancelado') return res.status(409).json({ msg: 'Pedido cancelado não pode emitir NFC-e' });
    if (order.nfce?.status === 'processando') {
      return res.status(409).json({ msg: 'Emissão em processamento. Consulte o provedor antes de tentar novamente.', code: 'PROVIDER_PENDING', nfce: order.nfce });
    }
    // Reserva atômica evita enviar a mesma venda duas vezes ao provedor.
    const reserved = await Order.findOneAndUpdate(
      { _id: order._id, status: { $ne: 'cancelado' }, 'nfce.status': { $nin: ['autorizada', 'processando', 'cancelada'] } },
      { $set: { 'nfce.status': 'processando', 'nfce.dataTentativaEmissao': new Date() } },
      { new: true, runValidators: true },
    );
    if (!reserved) return res.status(409).json({ msg: 'Emissão já está em processamento ou documento cancelado' });
    order = reserved;
    try {
      const productIds = [...new Set(order.itens.map((item) => String(item.produtoId)))];
      const products = await Product.find({ _id: { $in: productIds } }).select('ncm').lean();
      const resultado = await emitirNfce({ order, products });
      order.nfce = { status: 'autorizada', numero: resultado.numero, serie: resultado.serie,
        chaveAcesso: resultado.chaveAcesso, protocolo: resultado.protocolo, xml: resultado.xml,
        danfePdf: resultado.danfePdf, mensagemSeErro: resultado.avisos?.join('; '),
        dataEmissao: new Date(), dataTentativaEmissao: order.nfce.dataTentativaEmissao };
      await order.save();
      return res.json({ order, nfce: order.nfce, avisos: resultado.avisos || [] });
    } catch (error) {
      const nfceError = error instanceof NfceProviderError ? error
        : new NfceProviderError('Não foi possível confirmar a NFC-e', 'UNKNOWN_ERROR');
      // Um timeout pode ocorrer depois da autorização. Nunca reemitir sem reconciliação.
      const indeterminado = ['NETWORK_ERROR', 'PROVIDER_PENDING', 'INVALID_PROVIDER_RESPONSE', 'UNKNOWN_ERROR'].includes(nfceError.code);
      order.nfce = { ...(order.nfce?.toObject?.() || order.nfce || {}),
        status: indeterminado ? 'processando' : nfceError.code === 'CONFIG_MISSING' ? 'nao_emitida' : 'rejeitada',
        mensagemSeErro: nfceError.message };
      await order.save();
      const status = nfceError.code === 'NETWORK_ERROR' ? 503 : indeterminado ? 409 : nfceError.code === 'CONFIG_MISSING' ? 409 : 422;
      return res.status(status).json({ msg: nfceError.message, code: nfceError.code, faltantes: nfceError.details?.missing || [], nfce: order.nfce });
    }
  } catch (error) { return next(error); }
});

module.exports = router;
