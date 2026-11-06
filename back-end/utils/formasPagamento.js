const FORMAS_PAGAMENTO = ['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'credito_loja'];
const ROTULOS_PAGAMENTO = { dinheiro: 'Dinheiro', pix: 'Pix', cartao_credito: 'Cartão de Crédito', cartao_debito: 'Cartão de Débito', credito_loja: 'Crédito na Loja' };
const FORMAS_GERENCIAVEIS = ['cartao_credito', 'cartao_debito'];
const formaPersonalizada = tipo => /^personalizado_[a-f0-9]{24}$/.test(String(tipo || ''));
// O histórico aceita códigos personalizados estáveis; novos recebimentos também
// precisam passar pela validação do cadastro em calcularPagamento.
const formaPagamentoValida = tipo => FORMAS_PAGAMENTO.includes(String(tipo || '')) || formaPersonalizada(tipo);
const normalizarNome = nome => String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
const catalogoDaConfiguracao = configuracao => [
  ...FORMAS_PAGAMENTO
    .filter(value => !configuracao?.formasDesativadas?.includes(value))
    .map(value => ({
      value,
      label: configuracao?.formasPadraoNomes?.find(forma => forma.tipo === value)?.nome || ROTULOS_PAGAMENTO[value],
      taxaPercentual: Number(configuracao?.[value] || 0),
      personalizada: false,
      gerenciavel: FORMAS_GERENCIAVEIS.includes(value),
    })),
  ...(configuracao?.formasPersonalizadas || []).map(forma => ({ value: forma.tipo, label: forma.nome, taxaPercentual: Number(forma.taxaPercentual || 0), personalizada: true })),
];

module.exports = { FORMAS_PAGAMENTO, ROTULOS_PAGAMENTO, FORMAS_GERENCIAVEIS, formaPagamentoValida, formaPersonalizada, normalizarNome, catalogoDaConfiguracao };
