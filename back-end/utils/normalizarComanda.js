const Comanda = require('../models/Comanda');
const { calcularStatusPagamento } = require('./pagamento');

const normalizarNumero = (numero) => {
  const texto = String(numero ?? '').trim();
  if (!/^\d+$/.test(texto)) throw new Error('numero deve conter somente dígitos');
  return texto.padStart(4, '0');
};

const mapearPagamento = (pagamento) => ({
  ...pagamento,
  valor: pagamento.valor ?? pagamento.valorRecebido,
  formaPagamento: pagamento.formaPagamento ?? pagamento.tipo,
  data: pagamento.data ?? pagamento.dataPagamento,
});

const normalizarComanda = async (documento, numero) => {
  const origem = { ...documento };
  if (origem.valorTotal === undefined && origem.total !== undefined) origem.valorTotal = origem.total;
  if (!Array.isArray(origem.historicoPagamentos) && Array.isArray(origem.pagamentos)) {
    origem.historicoPagamentos = origem.pagamentos.map(mapearPagamento);
  }
  delete origem.total;
  delete origem.pagamentos;

  origem.numero = normalizarNumero(origem.numero || numero);
  if (origem.status === 'aberto') origem.status = 'aberta';
  if (origem.status === 'fechado') origem.status = 'fechada';
  if (origem.status === 'cancelado') origem.status = 'cancelada';
  if (origem.status === 'pendente') origem.status = 'fechada';
  if (origem.tipoAtendimento === 'balcão') origem.tipoAtendimento = 'balcao';

  if (!origem.createdAt) {
    origem.createdAt = typeof origem._id?.getTimestamp === 'function'
      ? origem._id.getTimestamp()
      : new Date();
  }
  if (!origem.updatedAt) origem.updatedAt = origem.createdAt;

  const comanda = new Comanda(origem);
  const pagamento = calcularStatusPagamento({
    valorTotal: comanda.valorTotal,
    historicoPagamentos: comanda.historicoPagamentos,
  });
  comanda.valorPago = pagamento.valorPago;
  comanda.saldoDevedor = pagamento.saldoDevedor;
  comanda.statusPagamento = comanda.status === 'cancelada' ? 'cancelado' : pagamento.statusPagamento;
  await comanda.validate();

  return comanda.toObject({ depopulate: true });
};

module.exports = { normalizarComanda, normalizarNumero };
