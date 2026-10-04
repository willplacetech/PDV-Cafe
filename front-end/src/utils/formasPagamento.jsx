export const FORMAS_PAGAMENTO = [
  { value: 'dinheiro', label: '💵 Dinheiro' },
  { value: 'pix', label: '🔄 PIX' },
  { value: 'cartao_debito', label: '💳 Cartão de Débito' },
  { value: 'cartao_credito', label: '💳 Cartão de Crédito' },
  { value: 'credito_loja', label: '🏪 Crédito na Loja' },
];

export const FORMAS_PAGAMENTO_VALOR = FORMAS_PAGAMENTO.map((forma) => forma.value);

export const rotuloPagamento = (tipo) => FORMAS_PAGAMENTO.find((forma) => forma.value === tipo)?.label
  || { dinheiro: 'Dinheiro', pix: 'Pix', cartao_debito: 'Cartão de Débito', cartao_credito: 'Cartão de Crédito', credito_loja: 'Crédito na Loja' }[tipo]
  || tipo;

export const STATUS_PAGAMENTO = {
  pendente: { label: 'Pendente', bg: 'var(--accent-light)', txt: 'var(--accent-primary)' },
  parcial: { label: 'Parcial', bg: 'rgba(210,137,48,.16)', txt: 'var(--warning-bg)' },
  quitado: { label: 'Quitado', bg: 'rgba(22,163,74,.12)', txt: 'var(--success-bg)' },
  cancelado: { label: 'Cancelado', bg: 'var(--bg-tertiary)', txt: 'var(--text-secondary)' },
};

export const statusPagamentoInfo = (status) => STATUS_PAGAMENTO[status] || STATUS_PAGAMENTO.pendente;

export const arredondar = (valor) => Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100;

/** Aceita tanto Order.pagamentos (tipo/valorRecebido/dataPagamento) quanto Comanda.historicoPagamentos (formaPagamento/valor/data). */
export const normalizarPagamento = (pagamento) => ({
  tipo: pagamento?.tipo || pagamento?.formaPagamento || 'dinheiro',
  valor: arredondar(pagamento?.valorRecebido ?? pagamento?.valor ?? 0),
  data: pagamento?.dataPagamento || pagamento?.data || null,
  quitado: Boolean(pagamento?.quitado),
  observacao: pagamento?.observacao || '',
  usuario: pagamento?.usuario || '',
});

export const normalizarPagamentos = (pagamentos) => (Array.isArray(pagamentos) ? pagamentos : []).map(normalizarPagamento);

export const totalPago = (pagamentos) => arredondar(normalizarPagamentos(pagamentos)
  .filter((pagamento) => pagamento.tipo !== 'credito_loja')
  .reduce((soma, pagamento) => soma + pagamento.valor, 0));

export const saldoDevedor = (valorTotal, pagamentos) => arredondar(Math.max(0, Number(valorTotal || 0) - totalPago(pagamentos)));

export const statusPagamentoDe = (valorTotal, pagamentos) => {
  const total = arredondar(valorTotal);
  const pago = totalPago(pagamentos);
  if (total <= 0) return 'quitado';
  if (pago <= 0) return 'pendente';
  if (pago >= total) return 'quitado';
  return 'parcial';
};

export const resumoPagamento = (total, pagamentos) => {
  const valorTotal = arredondar(total);
  const valorPago = totalPago(pagamentos);
  return {
    valorTotal,
    valorPago,
    saldoDevedor: arredondar(Math.max(0, valorTotal - valorPago)),
    statusPagamento: statusPagamentoDe(valorTotal, pagamentos),
  };
};

export const dataBR = (valor) => (valor ? new Date(valor).toLocaleString('pt-BR') : '-');
