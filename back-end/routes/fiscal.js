const express = require('express');
const auth = require('../middleware/auth');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { NfceProviderError, emitirNfce, getFiscalConfig } = require('../utils/nfce');

const router = express.Router();

router.get('/config', auth, auth.allowRoles('admin', 'operador'), (req, res) => {
  const config = getFiscalConfig();
  res.json({
    habilitado: config.missing.length === 0,
    ambiente: config.ambiente,
    faltantes: config.missing,
    certificadoVencendo: config.certificadoVencendo,
    certificadoExpiraEm: config.certificadoExpiraEm,
    aviso: config.missing.length ? 'Nota não emitida — complete os dados da empresa' : null,
  });
});

router.post('/orders/:id/emitir', auth, auth.allowRoles('admin', 'operador'), async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ msg: 'Pedido não encontrado' });
  if (order.nfce?.status === 'autorizada') return res.json({ order, nfce: order.nfce, jaEmitida: true });

  try {
    const productIds = [...new Set(order.itens.map((item) => String(item.produtoId)))];
    const products = await Product.find({ _id: { $in: productIds } }).select('ncm').lean();
    const resultado = await emitirNfce({ order, products });
    order.nfce = {
      status: 'autorizada',
      numero: resultado.numero,
      serie: resultado.serie,
      chaveAcesso: resultado.chaveAcesso,
      protocolo: resultado.protocolo,
      xml: resultado.xml,
      danfePdf: resultado.danfePdf,
      mensagemSeErro: resultado.avisos?.length ? `Avisos: ${resultado.avisos.join('; ')}` : undefined,
      dataEmissao: new Date(),
    };
    await order.save();
    return res.json({ order, nfce: order.nfce, avisos: resultado.avisos || [] });
  } catch (error) {
    const nfceError = error instanceof NfceProviderError
      ? error
      : new NfceProviderError('Não foi possível emitir a NFC-e', 'UNKNOWN_ERROR', { cause: error.message });
    order.nfce = {
      ...(order.nfce?.toObject?.() || order.nfce || {}),
      status: nfceError.code === 'CONFIG_MISSING' ? 'nao_emitida' : 'rejeitada',
      mensagemSeErro: nfceError.message,
      dataEmissao: undefined,
    };
    await order.save();
    const status = nfceError.code === 'NETWORK_ERROR' ? 503 : (nfceError.code === 'CONFIG_MISSING' ? 409 : 422);
    return res.status(status).json({ msg: nfceError.message, code: nfceError.code, faltantes: nfceError.details?.missing || [], nfce: order.nfce });
  }
});

module.exports = router;
