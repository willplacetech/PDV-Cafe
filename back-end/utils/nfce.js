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

const getFiscalConfig = () => {
  const company = {
    cnpj: env('NFCE_CNPJ'),
    inscricaoEstadual: env('NFCE_IE'),
    razaoSocial: env('NFCE_RAZAO_SOCIAL'),
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
  if (!company.inscricaoEstadual) missing.push('Inscrição Estadual');
  if (!company.razaoSocial) missing.push('Razão Social');
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
    missing,
    ambiente: env('FISCAL_AMBIENTE') || 'homologacao',
    serie: env('NFCE_SERIE') || '1',
    providerUrl: env('NFCE_PROVIDER_URL'),
    certificadoVencendo,
    certificadoExpiraEm: expires?.toISOString() || null,
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
    throw new NfceProviderError('Nota não emitida — complete os dados da empresa', 'CONFIG_MISSING', { missing: config.missing, certificadoVencendo: config.certificadoVencendo });
  }

  const productsById = new Map(products.map((product) => [String(product._id), product]));
  const avisos = [];
  if (config.certificadoVencendo) avisos.push(`Certificado próximo do vencimento${config.certificadoExpiraEm ? ` (${new Date(config.certificadoExpiraEm).toLocaleDateString('pt-BR')})` : ''}`);
  const itens = order.itens.map((item) => {
    const product = productsById.get(String(item.produtoId));
    const ncm = product?.ncm || DEFAULT_NCM;
    if (!product?.ncm) avisos.push(`${item.nome}: NCM padrão ${DEFAULT_NCM}`);
    return {
      codigo: item.codigo,
      descricao: item.nome,
      quantidade: Number(item.quantidade),
      unidade: item.unidadeVenda || 'UN',
      valorUnitario: Number(item.precoUnitario),
      valorTotal: Number(item.precoUnitario) * Number(item.quantidade),
      ncm,
    };
  });

  let response;
  try {
    response = await fetch(config.providerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(env('NFCE_PROVIDER_TOKEN') ? { Authorization: `Bearer ${env('NFCE_PROVIDER_TOKEN')}` } : {}) },
      body: JSON.stringify({
        ambiente: config.ambiente,
        serie: config.serie,
        empresa: config.company,
        pedido: { id: String(order._id), numero: order.numero, total: order.total, desconto: order.desconto, itens },
        certificado: { pfxConfigurado: true, senhaConfigurada: true },
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    throw new NfceProviderError(NETWORK_MESSAGE, 'NETWORK_ERROR', { cause: error.message });
  }

  let body = {};
  try { body = await response.json(); } catch { /* resposta sem JSON será tratada como rejeição */ }
  if (!response.ok) {
    const motivo = normalizarResposta(body).mensagemSeErro || body.message || `Provedor fiscal respondeu HTTP ${response.status}`;
    throw new NfceProviderError(motivo, 'SEFAZ_REJECTED', { providerStatus: response.status, response: body });
  }

  return { ...normalizarResposta(body), avisos, ambiente: config.ambiente };
};

module.exports = { DEFAULT_NCM, NETWORK_MESSAGE, NfceProviderError, getFiscalConfig, emitirNfce };
