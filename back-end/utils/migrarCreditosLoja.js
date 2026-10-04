const { calcularStatusPagamento } = require('./pagamento');

const statusPedidoDe = (statusPagamento) => (statusPagamento === 'quitado' ? 'pago' : statusPagamento);

const migrarCreditosLoja = async ({ Comanda, Order }) => {
  const comandas = await Comanda.find({
    status: { $ne: 'cancelada' },
    utilizacaoInterna: { $ne: true },
    'historicoPagamentos.formaPagamento': 'credito_loja',
  }).select('_id valorTotal historicoPagamentos pedidoId valorPago saldoDevedor statusPagamento').lean();

  let comandasAtualizadas = 0;
  let pedidosAtualizados = 0;
  for (const comanda of comandas) {
    const situacao = calcularStatusPagamento(comanda);
    if (comanda.valorPago !== situacao.valorPago
      || comanda.saldoDevedor !== situacao.saldoDevedor
      || comanda.statusPagamento !== situacao.statusPagamento) {
      const resultado = await Comanda.updateOne({ _id: comanda._id }, {
        $set: {
          valorPago: situacao.valorPago,
          saldoDevedor: situacao.saldoDevedor,
          statusPagamento: situacao.statusPagamento,
        },
      });
      comandasAtualizadas += resultado.modifiedCount || 0;
    }

    if (comanda.pedidoId) {
      const status = statusPedidoDe(situacao.statusPagamento);
      const resultado = await Order.updateOne({
        _id: comanda.pedidoId,
        utilizacaoInterna: { $ne: true },
        status: { $nin: ['cancelado', status] },
      }, { $set: { status } });
      pedidosAtualizados += resultado.modifiedCount || 0;
    }
  }

  return { comandasAtualizadas, pedidosAtualizados };
};

module.exports = migrarCreditosLoja;