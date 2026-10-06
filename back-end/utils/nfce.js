const DEFAULT_NCM = '21069090';
const NETWORK_MESSAGE = 'Aguardando rede... tente em 5 min';

class NfceProviderError extends Error {
  constructor(message, code = 'PROVIDER_ERROR', details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const env = (name) => String(process.env[name] || '').trim();

// Determina regime tributário e regras de ICMS
const getRegimeTributario = (tipoContribuinte) => {
  if (tipoContribuinte === 'mei') {
    return {
      crt: '30',
      cstICMS: '403',
      aliquotaICMS: 0,
      valorICMS: 0,
      descricaoRegime: 'MEI — Isento de ICMS'
    };
  }
  // Empresa normal / Simples / Lucro
  return {
    crt: env('FISCAL_CRT') || '3',
    cstICMS: env('FISCAL_CST_PADRAO') || '00',
    aliquotaICMS: Number(env('FISCAL_ICMS_ALIQUOTA') || 18),
    valorICMS: null, // calculado por item
    descricaoRegime: null
  };
};

const getFiscalConfig = () => {
  const tipoContribuinte = env('FISCAL_TIPO_CONTRIBUINTE') || 'normal';
  const regime = getRegimeTributario(tipoContribuinte);

  const company = {
    cnpj: env('NFCE_CNPJ'),
    inscricaoEstadual: env('NFCE_IE'),
    razaoSocial: env('NFCE_RAZAO_SOCIAL'),
    tipoContribuinte,
    crt: regime.crt,
    endereco: {
      logradouro: env('NFCE_ENDERECO_LOGRADOURO'),
      numero: env('NFCE_ENDERECO_NUMERO'),
      bairro: env('NFCE_ENDERECO_BAIRRO'),
      municipio: env('NFCE_ENDERECO_MUNICIPIO'),
      uf: env('NFCE_ENDERECO_UF'),
      cep: env('NFCE_ENDERECO_CEP'),
    },
  };

  const missing = [];
  if (!company.cnpj) missing.push('CNPJ');
  if (!company.razaoSocial) missing.push('Razão Social');

  // IE é obrigatória para NFC-e em SP, mas avisa de forma diferenciada para MEI
  if (!company.inscricaoEstadual) {
    missing.push(
      tipoContribuinte === 'mei'
        ? 'Inscrição Estadual — MEI precisa se inscrever no site da SEFAZ-SP para emitir NFC-e'
        : 'Inscrição Estadual'
    );
  }

  Object.entries({
    'logradouro do endereço': company.endereco.logradouro,
    'número do endereço': company.endereco.numero,
    bairro: company.endereco.bairro,
    município: company.endereco.municipio,
    UF: company.endereco.uf,
    CEP: company.endereco.cep,
  }).forEach(([label, value]) => { if (!value) missing.push(label); });

  if (!env('NFCE_CERTIFICATE_PFX_BASE64')) missing.push('certificado .pfx');
  if (!env('NFCE_CERTIFICATE_PASSWORD')) missing.push('senha do certificado');
  if (!env('NFCE_PROVIDER_URL')) missing.push('provedor fiscal');

  const expiresAt = env('NFCE_CERTIFICATE_EXPIRES_AT');
  const expires = expiresAt ? new Date(expiresAt) : null;
  const certificadoVencendo = expires && !Number.isNaN(expires.getTime())
    ? expires.getTime() - Date.now() <= 30 * 24 * 60 * 60 * 1000
    : false;

  return {
    company,
    regime,
    missing,
    ambiente: env('FISCAL_AMBIENTE') || 'homologacao',
    serie: env('NFCE_SERIE') || '1',
    providerUrl: env('NFCE_PROVIDER_URL'),
    certificadoVencendo,
    certificadoExpiraEm: expires && !Number.isNaN(expires.getTime()) ? expires.toISOString() : null,
  };
};

const normalizarResposta = (body = {}) => ({
  numero: body.numero || body.nfce?.numero,
  serie: body.serie || body.nfce?.serie,
  chaveAcesso: body.chaveAcesso || body.chave || body.nfce?.chaveAcesso,
  protocolo: body.protocolo || body.nfce?.protocolo,
  xml: body.xml || body.nfce?.xml,
  danfePdf: body.danfePdf || body.pdf || body.nfce?.danfePdf,
  mensagemSeErro: body.mensagemSeErro || body.mensagem || body.motivo,
});

const emitirNfce = async ({ order, products }) => {
  const config = getFiscalConfig();

  if (config.missing.length) {
    throw new NfceProviderError('Nota não emitida — complete os dados da empresa', 'CONFIG_MISSING', {
      missing: config.missing,
      certificadoVencendo: config.certificadoVencendo,
      regime: config.regime.descricaoRegime
    });
  }

  const productsById = new Map(products.map((product) => [String(product._id), product]));
  const avisos = [];

  if (config.certificadoVencendo) {
    avisos.push(`Certificado próximo do vencimento${config.certificadoExpiraEm ? ` (${new Date(config.certificadoExpiraEm).toLocaleDateString('pt-BR')})` : ''}`);
  }
  if (config.regime.descricaoRegime) {
    avisos.push(config.regime.descricaoRegime);
  }

  const itens = order.itens.map((item) => {
    const product = productsById.get(String(item.produtoId));
    const ncm = product?.ncm || DEFAULT_NCM;
    if (!product?.ncm) avisos.push(`${item.nome}: NCM padrão ${DEFAULT_NCM}`);

    const valorTotal = Number(item.precoUnitario) * Number(item.quantidade);
    const valorICMS = config.regime.aliquotaICMS > 0
      ? Number((valorTotal * config.regime.aliquotaICMS / 100).toFixed(2))
      : 0;

    return {
      codigo: item.codigo,
      descricao: item.nome,
      quantidade: Number(item.quantidade),
      unidade: item.unidadeVenda || 'UN',
      valorUnitario: Number(item.precoUnitario),
      valorTotal,
      ncm,
      imposto: {
        cst: config.regime.cstICMS,
        aliquotaICMS: config.regime.aliquotaICMS,
        valorICMS
      }
    };
  });

  let response;
  try {
    response = await fetch(config.providerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env('NFCE_PROVIDER_TOKEN') ? { Authorization: `Bearer ${env('NFCE_PROVIDER_TOKEN')}` } : {})
      },
      body: JSON.stringify({
        ambiente: config.ambiente,
        serie: config.serie,
        empresa: config.company,
        pedido: {
          id: String(order._id),
          numero: order.numero,
          total: order.total,
          desconto: order.desconto,
          ...(Number(order.taxaEntrega) > 0 ? { frete: Number(order.taxaEntrega) } : {}),
          itens
        },
        certificado: { pfxConfigurado: true, senhaConfigurada: true },
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    throw new NfceProviderError(NETWORK_MESSAGE, 'NETWORK_ERROR', { cause: error.message });
  }

  let body = {};
  try { body = await response.json(); } catch { /* resposta sem JSON = rejeição */ }

  if (!response.ok) {
    const motivo = normalizarResposta(body).mensagemSeErro || body.message || `Provedor fiscal respondeu HTTP ${response.status}`;
    throw new NfceProviderError(motivo, 'SEFAZ_REJECTED', {
      providerStatus: response.status,
      response: body,
      regime: config.regime
    });
  }

  const resultado = normalizarResposta(body);
  const status = String(body.status || body.nfce?.status || '').toLowerCase();
  const cStat = String(body.cStat || body.nfce?.cStat || '');
  if (response.status === 202 || ['processando', 'pendente', 'pending', 'processing', 'em_processamento'].includes(status)) {
    throw new NfceProviderError('Emissão em processamento no provedor. Consulte a situação antes de tentar novamente.', 'PROVIDER_PENDING');
  }
  if (['rejeitada', 'rejected', 'cancelada', 'denegada'].includes(status) || (cStat && !['100', '150'].includes(cStat))) {
    throw new NfceProviderError(resultado.mensagemSeErro || 'Emissão não autorizada pelo provedor', 'SEFAZ_REJECTED');
  }
  if (!resultado.numero || !resultado.serie || !/^\d{44}$/.test(String(resultado.chaveAcesso || '')) || !resultado.protocolo) {
    throw new NfceProviderError('Resposta fiscal sem os dados de autorização obrigatórios', 'INVALID_PROVIDER_RESPONSE');
  }
  return {
    ...resultado,
    avisos,
    ambiente: config.ambiente,
    regime: config.regime
  };
};

module.exports = {
  DEFAULT_NCM,
  NETWORK_MESSAGE,
  NfceProviderError,
  getFiscalConfig,
  emitirNfce
};
