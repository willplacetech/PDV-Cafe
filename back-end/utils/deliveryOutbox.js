const Comanda = require('../models/Comanda');
const Tenant = require('../models/Tenant');
const PedidoEntrega = require('../models/PedidoEntrega');
const service = require('./deliveryService');

let processando = null;

const processar = () => {
  if (processando) return processando;
  processando = (async () => {
    const comandas = await Comanda.find({ status: { $ne: 'cancelada' }, 'entrega.status': { $in: ['pendente', 'erro'] }, $or: [{ 'entrega.proximaTentativa': { $exists: false } }, { 'entrega.proximaTentativa': { $lte: new Date() } }] }).limit(30);
    for (const comanda of comandas) {
      try {
        const tenant = comanda.entrega.tenantId && await Tenant.findOne({ _id: comanda.entrega.tenantId, ativo: true });
        if (!tenant) throw service.erro('O comércio deve estar associado no momento da venda');
        const body = {
          origem: { nomeCliente: comanda.clienteNome, telefone: comanda.entrega.telefone, endereco: comanda.entrega.endereco },
          itens: comanda.itens.map(item => ({ descricao: item.nome, quantidade: item.quantidade, precoUnitario: item.precoUnitario })),
          valorTotal: Math.max(0, comanda.valorTotal - (comanda.taxaEntrega || 0)), taxaEntrega: comanda.taxaEntrega || 0,
        };
        const { pedido } = await service.criarPedido(body, tenant, 'pdv', { tipo: 'sistema' }, `comanda:${comanda.id}`);
        await Comanda.updateOne({ _id: comanda._id }, { $set: { 'entrega.status': 'processado', 'entrega.pedidoEntregaId': pedido._id, 'entrega.ultimoErro': '' } });
      } catch {
        await Comanda.updateOne({ _id: comanda._id }, {
          $set: { 'entrega.status': 'erro', 'entrega.ultimoErro': 'Entrega ainda não integrada. Confira vínculo do operador e endereço.', 'entrega.proximaTentativa': new Date(Date.now() + 60_000) },
          $inc: { 'entrega.tentativas': 1 },
        });
      }
    }
    if (process.env.WHATSAPP_API_URL && process.env.WHATSAPP_ACCESS_TOKEN) {
      const pedidos = await PedidoEntrega.find({ whatsappPendente: true, status: { $in: ['despachado', 'a_caminho'] } }).limit(20);
      for (const pedido of pedidos) {
        const tenant = await Tenant.findById(pedido.tenantId);
        if (tenant && (await service.enviarWhatsApp(pedido, tenant)).enviado) await PedidoEntrega.updateOne({ _id: pedido._id }, { whatsappPendente: false });
      }
    }
  })().finally(() => { processando = null; });
  return processando;
};

const iniciar = () => {
  const executar = () => { void processar().catch(() => console.warn('[DeliveryLink] Integração pendente; nova tentativa automática.')); };
  executar();
  const timer = setInterval(executar, 15000);
  timer.unref();
  return () => clearInterval(timer);
};

module.exports = { processar, iniciar };
