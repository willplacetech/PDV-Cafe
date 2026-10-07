const express = require('express');
const auth = require('../middleware/auth');
const Order = require('../models/Order');
const Comanda = require('../models/Comanda');
const { normalizarPagamentos, totalPago } = require('../utils/pagamento');

const router = express.Router();

router.use(auth, auth.allowRoles('admin'));

router.get('/resumo', async (req, res) => {
  try {
    const [comandas, pedidos] = await Promise.all([
      Comanda.find({ status: { $in: ['aberta', 'fechada'] }, statusPagamento: { $in: ['pendente', 'parcial'] } })
        .select('_id valorTotal historicoPagamentos clienteId clienteNome clienteTelefone')
        .lean(),
      Order.find({ status: { $in: ['pendente', 'parcial'] }, utilizacaoInterna: { $ne: true } })
        .select('_id comandaId total pagamentos clienteId clienteNome clienteTelefone')
        .lean(),
    ]);
    const comandasPorId = new Map(comandas.map((comanda) => [String(comanda._id), comanda]));
    const devedores = new Map();
    let total = 0;

    const acumularDevedor = (registro, valor) => {
      if (valor <= 0) return;
      total += valor;
      const nome = String(registro.clienteNome || 'Cliente não identificado').trim();
      const chave = registro.clienteId ? String(registro.clienteId) : `${nome.toLocaleLowerCase('pt-BR')}:${registro.clienteTelefone || ''}`;
      const atual = devedores.get(chave) || { nome, telefone: registro.clienteTelefone || '', valor: 0 };
      atual.valor += valor;
      if (!atual.telefone && registro.clienteTelefone) atual.telefone = registro.clienteTelefone;
      devedores.set(chave, atual);
    };

    comandas.forEach((comanda) => {
      const saldo = Math.max(0, Number(comanda.valorTotal || 0) - totalPago(comanda.historicoPagamentos));
      acumularDevedor(comanda, saldo);
    });

    pedidos.forEach((pedido) => {
      if (pedido.comandaId && comandasPorId.has(String(pedido.comandaId))) return;
      const saldo = Math.max(0, Number(pedido.total || 0) - totalPago(normalizarPagamentos(pedido.pagamentos)));
      acumularDevedor(pedido, saldo);
    });

    const topDevedores = [...devedores.values()]
      .map((devedor) => ({ ...devedor, valor: Math.round((devedor.valor + Number.EPSILON) * 100) / 100 }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 3);

    return res.json({
      total: Math.round((total + Number.EPSILON) * 100) / 100,
      vencimentoDisponivel: false,
      vencemHoje: { valor: 0, count: 0 },
      atrasadas: { valor: 0, count: 0 },
      topDevedores,
    });
  } catch (error) {
    return res.status(500).json({ msg: error.message });
  }
});

module.exports = router;
