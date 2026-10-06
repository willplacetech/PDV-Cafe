const { EventEmitter } = require('node:events');
const mongoose = require('mongoose');
const PedidoEntrega = require('../models/PedidoEntrega');
const Entregador = require('../models/Entregador');
const Tenant = require('../models/Tenant');

const eventos = new EventEmitter();
eventos.setMaxListeners(0);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });
const texto = (valor, campo, obrigatorio = false, limite = 300) => {
  if (valor === undefined && !obrigatorio) return undefined;
  if (typeof valor !== 'string' || valor.length > limite || (obrigatorio && !valor.trim())) throw erro(`Informe ${campo} válido`);
  return valor.trim();
};
const validarId = (id) => { if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) throw erro('Identificador inválido'); return id; };
const senha = (valor, nova = false) => {
  if (typeof valor !== 'string' || !valor || Buffer.byteLength(valor, 'utf8') > 72 || (nova && valor.length < 8)) throw erro('Informe senha válida, com pelo menos 8 caracteres e até 72 bytes');
  return valor;
};
const numero = (valor, campo, padrao) => {
  const resultado = valor === undefined ? padrao : valor;
  if (typeof resultado !== 'number' || !Number.isFinite(resultado) || resultado < 0) throw erro(`Informe ${campo} válido`);
  return resultado;
};

const dadosPedido = (body, tenant, fonte = 'formulario', autor) => {
  const origem = body.origem || {};
  const endereco = body.enderecoEntrega || origem.endereco || {};
  if (body.itens !== undefined && (!Array.isArray(body.itens) || body.itens.length > 200)) throw erro('Lista de itens inválida');
  return {
    tenantId: tenant._id, fonte,
    origem: {
      nomeCliente: texto(origem.nomeCliente, 'nome do cliente', true, 160),
      telefone: texto(body.telefoneCliente || origem.telefone, 'telefone', true, 30),
      endereco: Object.fromEntries(['rua', 'numero', 'bairro', 'complemento', 'referencia'].map(campo => [campo, texto(endereco[campo], campo, ['rua', 'numero', 'bairro'].includes(campo))])),
    },
    itens: (body.itens || []).map(item => ({ descricao: texto(item.descricao, 'descrição', true), quantidade: numero(item.quantidade, 'quantidade'), precoUnitario: numero(item.precoUnitario, 'preço unitário') })),
    valorTotal: numero(body.valorTotal, 'valor total'), taxaEntrega: numero(body.taxaEntrega, 'taxa de entrega', 0),
    tempoEstimadoMinutos: tenant.configuracao.tempoEstimadoPadraoMin,
    statusHistorico: [{ status: 'pendente', por: autor || { tipo: 'sistema' }, data: new Date() }],
  };
};

const criarPedido = async (body, tenant, fonte, autor, referencia) => {
  const dados = dadosPedido(body, tenant, fonte, autor);
  if (referencia) {
    dados.referenciaIntegracao = texto(referencia, 'referência da venda', true, 128);
    const existente = await PedidoEntrega.findOne({ tenantId: tenant._id, referenciaIntegracao: dados.referenciaIntegracao });
    if (existente) return { pedido: existente, criado: false };
  }
  try { return { pedido: await PedidoEntrega.create(dados), criado: true }; }
  catch (error) {
    if (error.code === 11000 && referencia) {
      const pedido = await PedidoEntrega.findOne({ tenantId: tenant._id, referenciaIntegracao: referencia });
      if (pedido) return { pedido, criado: false };
    }
    throw error;
  }
};

const atualizarDisponibilidade = async (entregadorId) => {
  if (!entregadorId) return;
  const emEntrega = await PedidoEntrega.exists({ entregadorId, status: { $in: ['despachado', 'a_caminho'] } });
  await Entregador.updateOne({ _id: entregadorId, status: { $ne: 'offline' } }, { status: emEntrega ? 'em_entrega' : 'disponivel' });
};

const mudarStatus = async ({ filtro, permitido, status, por, campos = {} }) => {
  const pedido = await PedidoEntrega.findOneAndUpdate({ ...filtro, status: { $in: permitido } }, {
    $set: { ...campos, status }, $push: { statusHistorico: { status, por, data: new Date() } },
  }, { new: true, runValidators: true });
  if (!pedido) {
    if (!await PedidoEntrega.exists(filtro)) throw erro('Pedido não encontrado', 404);
    throw erro('Esta mudança de status não é permitida', 409);
  }
  eventos.emit(pedido.tokenRastreamento);
  if (pedido.entregadorId) void atualizarDisponibilidade(pedido.entregadorId).catch(() => {});
  return pedido;
};

const rastrear = async (token) => {
  if (!UUID.test(token)) throw erro('Pedido não encontrado', 404);
  const pedido = await PedidoEntrega.findOne({ tokenRastreamento: token }).select('status statusHistorico tempoEstimadoMinutos tenantId entregadorId atualizadoEm').lean();
  if (!pedido) throw erro('Pedido não encontrado', 404);
  const tenant = await Tenant.findById(pedido.tenantId).select('nome telefone').lean();
  if (!tenant) throw erro('Pedido não encontrado', 404);
  const publico = {
    status: pedido.status, statusHistorico: pedido.statusHistorico.map(({ status, data }) => ({ status, data })),
    tempoEstimado: pedido.tempoEstimadoMinutos, nomeComercio: tenant.nome,
    whatsappComercio: `https://wa.me/${telefoneWhatsApp(tenant.telefone)}?text=${encodeURIComponent('Olá! Quero fazer um novo pedido.')}`,
  };
  if (pedido.status === 'a_caminho' && pedido.entregadorId) {
    const entregador = await Entregador.findById(pedido.entregadorId).select('posicaoAtual').lean();
    const posicao = entregador?.posicaoAtual;
    if (posicao && Date.now() - new Date(posicao.atualizadoEm).getTime() < 300_000) publico.posicaoEntregador = { lat: posicao.lat, lng: posicao.lng };
  }
  return publico;
};

const telefoneWhatsApp = (telefone) => {
  const digitos = String(telefone || '').replace(/\D/g, '');
  return digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
};
const mensagemWhatsApp = (pedido, tenant) => {
  const base = (process.env.DELIVERY_PUBLIC_URL || process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:5173').replace(/\/$/, '');
  const link = `${base}/pedido/${pedido.tokenRastreamento}`;
  const template = tenant.configuracao.mensagemWhatsApp || 'Acompanhe sua entrega: {link}';
  const mensagemPronta = template.includes('{link}') ? template.replaceAll('{link}', link) : `${template}\n${link}`;
  return { link, mensagemPronta, whatsappUrl: `https://wa.me/${telefoneWhatsApp(pedido.origem.telefone)}?text=${encodeURIComponent(mensagemPronta)}`, enviado: false };
};
const enviarWhatsApp = async (pedido, tenant) => {
  const resultado = mensagemWhatsApp(pedido, tenant);
  if (!process.env.WHATSAPP_API_URL || !process.env.WHATSAPP_ACCESS_TOKEN) return resultado;
  try {
    const url = new URL(process.env.WHATSAPP_API_URL);
    if (url.protocol !== 'https:' || url.hostname !== 'graph.facebook.com') throw erro('Configure a URL da API oficial do WhatsApp');
    const response = await fetch(url, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: telefoneWhatsApp(pedido.origem.telefone), type: 'text', text: { body: resultado.mensagemPronta } }),
      signal: AbortSignal.timeout(5000),
    });
    resultado.enviado = response.ok;
  } catch { resultado.enviado = false; }
  return resultado;
};

module.exports = { eventos, UUID, erro, texto, numero, validarId, senha, dadosPedido, criarPedido, mudarStatus, rastrear, mensagemWhatsApp, enviarWhatsApp, atualizarDisponibilidade };
