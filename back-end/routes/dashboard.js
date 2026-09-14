const express = require('express');
const Order = require('../models/Order');
const Comanda = require('../models/Comanda');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const { quantidadeNaUnidadeBase } = require('../utils/quantidade');

const router = express.Router();
const TIME_ZONE = 'America/Sao_Paulo';

const partesDataSaoPaulo = (value = new Date()) => {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const valores = Object.fromEntries(partes.filter((parte) => parte.type !== 'literal').map((parte) => [parte.type, parte.value]));
  return { year: Number(valores.year), month: Number(valores.month), day: Number(valores.day) };
};

const dataSaoPaulo = (value = new Date()) => {
  const { year, month, day } = partesDataSaoPaulo(value);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const inicioHojeSaoPaulo = () => new Date(`${dataSaoPaulo()}T00:00:00-03:00`);
const horaSaoPaulo = (value) => Number(new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(new Date(value)));

const periodoHistorico = (semanaInicio) => {
  const dataInformada = /^\d{4}-\d{2}-\d{2}$/.test(String(semanaInicio || '')) ? new Date(`${semanaInicio}T00:00:00-03:00`) : inicioHojeSaoPaulo();
  const inicio = new Date(dataInformada);
  const diaDaSemana = inicio.getUTCDay();
  inicio.setUTCDate(inicio.getUTCDate() - (diaDaSemana === 0 ? 6 : diaDaSemana - 1));
  const fim = new Date(inicio);
  fim.setUTCDate(fim.getUTCDate() + 7);
  return { inicio, fim };
};

const inicioDoPeriodo = (periodo) => {
  const agora = new Date();
  const inicio = new Date(agora);
  if (periodo === 'dia') inicio.setHours(0, 0, 0, 0);
  if (periodo === 'semana') {
    inicio.setHours(0, 0, 0, 0);
    inicio.setDate(inicio.getDate() - inicio.getDay());
  }
  if (periodo === 'mes') {
    inicio.setHours(0, 0, 0, 0);
    inicio.setDate(1);
  }
  return inicio;
};

const fimDoMesAtual = () => {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
};

const inicioDoMesAnterior = () => {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
};

const fimDoMesAnterior = () => {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), 1);
};

router.use(auth);
router.use((req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Acesso restrito ao administrador' });
  next();
});

const resumoVendasPeriodo = async (inicio, fim) => {
  const pedidos = await Order.find({ createdAt: { $gte: inicio, $lt: fim }, status: { $ne: 'cancelado' } }).select('total itens').lean();
  const total = pedidos.reduce((sum, pedido) => sum + Number(pedido.total || 0), 0);
  const itens = pedidos.reduce((sum, pedido) => sum + (pedido.itens || []).reduce((itemSum, item) => itemSum + quantidadeNaUnidadeBase(item), 0), 0);
  return { pedidos: pedidos.length, itens, total, ticketMedio: pedidos.length ? total / pedidos.length : 0 };
};

router.get('/comparar-vendas', async (req, res) => {
  try {
    const tipo = req.query.tipo === 'mes' ? 'mes' : 'semana';
    let periodoA;
    let periodoB;

    if (tipo === 'mes') {
      const mesA = /^\d{4}-\d{2}$/.test(String(req.query.periodoA || '')) ? req.query.periodoA : dataSaoPaulo().slice(0, 7);
      const mesB = /^\d{4}-\d{2}$/.test(String(req.query.periodoB || '')) ? req.query.periodoB : mesA;
      const criarMes = (mes) => {
        const [ano, numero] = mes.split('-').map(Number);
        return { inicio: new Date(`${mes}-01T00:00:00-03:00`), fim: new Date(Date.UTC(ano, numero, 1, 3)), rotulo: mes };
      };
      periodoA = criarMes(mesA);
      periodoB = criarMes(mesB);
    } else {
      const inicioA = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.periodoA || '')) ? req.query.periodoA : dataSaoPaulo();
      const inicioB = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.periodoB || '')) ? req.query.periodoB : inicioA;
      periodoA = periodoHistorico(inicioA);
      periodoB = periodoHistorico(inicioB);
      periodoA.rotulo = `${dataSaoPaulo(periodoA.inicio)} a ${dataSaoPaulo(new Date(periodoA.fim.getTime() - 1))}`;
      periodoB.rotulo = `${dataSaoPaulo(periodoB.inicio)} a ${dataSaoPaulo(new Date(periodoB.fim.getTime() - 1))}`;
    }

    const [resumoA, resumoB] = await Promise.all([
      resumoVendasPeriodo(periodoA.inicio, periodoA.fim),
      resumoVendasPeriodo(periodoB.inicio, periodoB.fim),
    ]);
    res.json({ tipo, periodoA: { ...resumoA, rotulo: periodoA.rotulo }, periodoB: { ...resumoB, rotulo: periodoB.rotulo } });
  } catch (error) { res.status(500).json({ msg: error.message }); }
});

router.get('/historico-produtos', async (req, res) => {
  try {
    const produtoId = String(req.query.produtoId || '').trim();
    const { inicio, fim } = periodoHistorico(req.query.semanaInicio);
    const pontos = new Map();

    const cursor = new Date(inicio);
    while (cursor < fim) {
      const chave = dataSaoPaulo(cursor);
      const rotulo = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, weekday: 'short', day: '2-digit' }).format(cursor).replace('.', '');
      pontos.set(chave, { chave, rotulo, quantidade: 0, total: 0, pedidos: new Set() });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const pedidos = await Order.find({ createdAt: { $gte: inicio, $lt: fim }, status: { $ne: 'cancelado' } }).select('_id createdAt itens');
    pedidos.forEach((pedido) => {
      const chave = dataSaoPaulo(pedido.createdAt);
      const ponto = pontos.get(chave);
      if (!ponto) return;
      (pedido.itens || []).filter((item) => !produtoId || String(item.produtoId) === produtoId).forEach((item) => {
        ponto.quantidade += quantidadeNaUnidadeBase(item);
        ponto.total += Number(item.quantidade || 0) * Number(item.precoUnitario || 0);
        ponto.pedidos.add(String(pedido._id));
      });
    });

    const historico = [...pontos.values()].map(({ pedidos, ...ponto }) => ({ ...ponto, pedidos: pedidos.size }));
    const resumo = historico.reduce((total, ponto) => ({ quantidade: total.quantidade + ponto.quantidade, total: total.total + ponto.total, pedidos: total.pedidos + ponto.pedidos }), { quantidade: 0, total: 0, pedidos: 0 });
    res.json({ periodo: 'semana', produtoId: produtoId || null, inicio, fim, resumo, pontos: historico });
  } catch (error) { res.status(500).json({ msg: error.message }); }
});

router.get('/', async (req, res) => {
  try {
    const periodos = ['dia', 'semana', 'mes'];
    const inicioInsights = new Date();
    inicioInsights.setDate(inicioInsights.getDate() - 90);
    const [periodMetrics, openCommands, pedidosDia, pedidosMes, recebimentosDia, recebimentosMes, clientesCadastrados, clientesRecentes, produtosCatalogo, pedidosInsights, comandasInsights] = await Promise.all([
      Promise.all(periodos.map(async (periodo) => {
        const pedidos = await Order.find({ createdAt: { $gte: inicioDoPeriodo(periodo) }, status: { $ne: 'cancelado' } }).select('total itens createdAt');
        const total = pedidos.reduce((sum, pedido) => sum + Number(pedido.total || 0), 0);
        const itens = pedidos.reduce((sum, pedido) => sum + (pedido.itens || []).reduce((itemSum, item) => itemSum + quantidadeNaUnidadeBase(item), 0), 0);
        const produtos = new Map();
        pedidos.forEach((pedido) => (pedido.itens || []).forEach((item) => produtos.set(item.nome, (produtos.get(item.nome) || 0) + quantidadeNaUnidadeBase(item))));
        const maisVendidos = [...produtos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([nome, quantidade]) => ({ nome, quantidade }));
        return { periodo, total, pedidos: pedidos.length, itens, ticketMedio: pedidos.length ? total / pedidos.length : 0, maisVendidos };
      })),
      Comanda.countDocuments({ status: 'aberta' }),
      Order.find({ createdAt: { $gte: inicioDoPeriodo('dia') } }).sort({ createdAt: -1 }).select('numero total status clienteNome createdAt itens pagamentos'),
      Order.find({ createdAt: { $gte: inicioDoPeriodo('mes'), $lt: fimDoMesAtual() } }).select('numero total subtotal desconto status clienteId clienteNome clienteTelefone createdAt itens pagamentos'),
      Order.find({ 'pagamentos.dataPagamento': { $gte: inicioDoPeriodo('dia') } }).select('pagamentos'),
      Order.find({ 'pagamentos.dataPagamento': { $gte: inicioDoPeriodo('mes'), $lt: fimDoMesAtual() } }).select('pagamentos'),
      Customer.countDocuments(),
      Customer.find().sort({ createdAt: -1 }).limit(8).select('nome telefone createdAt cafesFidelidade'),
      Product.find().select('nome codigo preco custo estoque categoria'),
      Order.find({ createdAt: { $gte: inicioInsights } }).select('createdAt status total itens clienteId clienteNome'),
      Comanda.find({ createdAt: { $gte: inicioInsights } }).select('createdAt status'),
    ]);
    const vendasHoje = pedidosDia.filter((pedido) => pedido.status !== 'cancelado');
    const vendasHojeTotal = vendasHoje.reduce((total, pedido) => total + Number(pedido.total || 0), 0);
    const vendasHojeItens = vendasHoje.reduce((total, pedido) => total + (pedido.itens || []).reduce((itens, item) => itens + quantidadeNaUnidadeBase(item), 0), 0);
    const vendasHojeRecebido = recebimentosDia.reduce((total, pedido) => total + (pedido.pagamentos || []).filter((pagamento) => new Date(pagamento.dataPagamento) >= inicioDoPeriodo('dia')).reduce((soma, pagamento) => soma + Number(pagamento.valorRecebido || 0), 0), 0);
    const vendasHojePendente = Math.max(0, vendasHojeTotal - vendasHojeRecebido);
    const vendasMes = pedidosMes.filter((pedido) => pedido.status !== 'cancelado');
    const pagamentosMes = new Map();
    const produtosMes = new Map();
    const clientesMes = new Set();
    const vendasPorDia = new Map();
    vendasMes.forEach((pedido) => {
      if (pedido.clienteNome) clientesMes.add(pedido.clienteNome);
      const dia = new Date(pedido.createdAt).toLocaleDateString('pt-BR');
      vendasPorDia.set(dia, (vendasPorDia.get(dia) || 0) + Number(pedido.total || 0));
      (pedido.itens || []).forEach((item) => {
        const atual = produtosMes.get(item.nome) || { nome: item.nome, quantidade: 0, total: 0 };
        atual.quantidade += quantidadeNaUnidadeBase(item);
        atual.total += Number(item.quantidade || 0) * Number(item.precoUnitario || 0);
        produtosMes.set(item.nome, atual);
      });
    });
    recebimentosMes.forEach((pedido) => (pedido.pagamentos || []).filter((pagamento) => new Date(pagamento.dataPagamento) >= inicioDoPeriodo('mes') && new Date(pagamento.dataPagamento) < fimDoMesAtual()).forEach((pagamento) => pagamentosMes.set(pagamento.tipo, (pagamentosMes.get(pagamento.tipo) || 0) + Number(pagamento.valorRecebido || 0))));
    const totalMes = vendasMes.reduce((total, pedido) => total + Number(pedido.total || 0), 0);
    const recebidoMes = vendasMes.reduce((total, pedido) => total + (pedido.pagamentos || []).reduce((soma, pagamento) => soma + Number(pagamento.valorRecebido || 0), 0), 0);
    const statusMes = pedidosMes.reduce((status, pedido) => { status[pedido.status] = (status[pedido.status] || 0) + 1; return status; }, {});
    const clientesRelatorio = new Map(clientesRecentes.map((cliente) => [String(cliente._id), {
      id: cliente._id,
      nome: cliente.nome,
      telefone: cliente.telefone || '',
      pedidos: 0,
      total: 0,
      recebido: 0,
      ultimaCompra: null,
    }]));
    const todosClientes = await Customer.find().sort({ nome: 1 }).select('nome telefone createdAt cafesFidelidade');
    todosClientes.forEach((cliente) => {
      if (!clientesRelatorio.has(String(cliente._id))) clientesRelatorio.set(String(cliente._id), { id: cliente._id, nome: cliente.nome, telefone: cliente.telefone || '', pedidos: 0, total: 0, recebido: 0, ultimaCompra: null });
    });
    const relatorioClientes = [...clientesRelatorio.values()].map((cliente) => ({ ...cliente, pendente: Math.max(0, cliente.total - cliente.recebido) })).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
    const relatorioMes = {
      periodo: `${inicioDoPeriodo('mes').toLocaleDateString('pt-BR')} a ${new Date(fimDoMesAtual().getTime() - 1).toLocaleDateString('pt-BR')}`,
      pedidos: pedidosMes.length,
      vendas: vendasMes.length,
      itens: vendasMes.reduce((total, pedido) => total + (pedido.itens || []).reduce((soma, item) => soma + quantidadeNaUnidadeBase(item), 0), 0),
      total: totalMes,
      recebido: recebidoMes,
      pendente: Math.max(0, totalMes - recebidoMes),
      ticketMedio: vendasMes.length ? totalMes / vendasMes.length : 0,
      status: statusMes,
      pagamentos: [...pagamentosMes.entries()].map(([tipo, total]) => ({ tipo, total })).sort((a, b) => b.total - a.total),
      produtos: [...produtosMes.values()].sort((a, b) => b.quantidade - a.quantidade).slice(0, 10),
      clientes: clientesMes.size,
      vendasPorDia: [...vendasPorDia.entries()].map(([dia, total]) => ({ dia, total })),
    };
    const vendasPorProduto = new Map();
    const inicioEstoqueParado = new Date();
    inicioEstoqueParado.setDate(inicioEstoqueParado.getDate() - 60);
    const vendasUltimos60Dias = new Set();
    const vendasPorHora = Array.from({ length: 12 }, (_, indice) => ({ hora: indice + 8, pedidos: 0, itens: 0, total: 0 }));
    pedidosInsights.filter((pedido) => pedido.status !== 'cancelado').forEach((pedido) => {
      const hora = horaSaoPaulo(pedido.createdAt);
      if (hora < 8 || hora > 19) return;
      const vendaHora = vendasPorHora[hora - 8];
      vendaHora.pedidos += 1;
      vendaHora.total += Number(pedido.total || 0);
      (pedido.itens || []).forEach((item) => {
        const produtoId = String(item.produtoId || '');
        if (new Date(pedido.createdAt) >= inicioEstoqueParado) vendasUltimos60Dias.add(produtoId);
        const atual = vendasPorProduto.get(produtoId) || { produtoId, nome: item.nome, quantidade: 0, receita: 0 };
        atual.quantidade += quantidadeNaUnidadeBase(item);
        atual.receita += Number(item.quantidade || 0) * Number(item.precoUnitario || 0);
        vendasPorProduto.set(produtoId, atual);
        vendaHora.itens += quantidadeNaUnidadeBase(item);
      });
    });
    const produtosABC = [...vendasPorProduto.values()].sort((a, b) => b.receita - a.receita);
    const receitaABC = produtosABC.reduce((total, produto) => total + produto.receita, 0);
    let receitaAcumulada = 0;
    const curvaABC = produtosABC.map((produto) => {
      receitaAcumulada += produto.receita;
      const acumulado = receitaABC ? receitaAcumulada / receitaABC : 0;
      return { ...produto, classe: acumulado <= 0.8 ? 'A' : acumulado <= 0.95 ? 'B' : 'C', percentualReceita: receitaABC ? (produto.receita / receitaABC) * 100 : 0 };
    });
    const margemProdutos = produtosCatalogo.map((produto) => {
      const venda = vendasPorProduto.get(String(produto._id)) || { quantidade: 0, receita: 0 };
      const lucro = venda.receita - venda.quantidade * Number(produto.custo || 0);
      return { produtoId: produto._id, nome: produto.nome, preco: Number(produto.preco || 0), custo: Number(produto.custo || 0), quantidade: venda.quantidade, receita: venda.receita, lucro, margemPercentual: venda.receita ? (lucro / venda.receita) * 100 : 0 };
    }).sort((a, b) => b.lucro - a.lucro);
    const estoqueParado = produtosCatalogo.filter((produto) => Number(produto.estoque || 0) > 0 && !vendasUltimos60Dias.has(String(produto._id))).map((produto) => ({ produtoId: produto._id, nome: produto.nome, categoria: produto.categoria, estoque: Number(produto.estoque || 0), diasSemVenda: 60 }));
    const comandasCanceladas = comandasInsights.filter((comanda) => comanda.status === 'cancelada').length;
    const comandasFinalizadas = comandasInsights.filter((comanda) => ['cancelada', 'fechada'].includes(comanda.status)).length;
    const mesAtual = pedidosInsights.filter((pedido) => new Date(pedido.createdAt) >= inicioDoPeriodo('mes') && pedido.status !== 'cancelado');
    const mesAnterior = pedidosInsights.filter((pedido) => { const data = new Date(pedido.createdAt); return data >= inicioDoMesAnterior() && data < fimDoMesAnterior() && pedido.status !== 'cancelado'; });
    const totalMesAnterior = mesAnterior.reduce((total, pedido) => total + Number(pedido.total || 0), 0);
    const totalMesAtual = mesAtual.reduce((total, pedido) => total + Number(pedido.total || 0), 0);
    const clientesInsight = new Map();
    pedidosInsights.filter((pedido) => pedido.status !== 'cancelado' && pedido.clienteId).forEach((pedido) => {
      const id = String(pedido.clienteId);
      const cliente = clientesInsight.get(id) || { id, nome: pedido.clienteNome || 'Cliente', compras: 0, total: 0, datas: [] };
      cliente.compras += 1;
      cliente.total += Number(pedido.total || 0);
      cliente.datas.push(new Date(pedido.createdAt));
      clientesInsight.set(id, cliente);
    });
    const clientesFrequentes = [...clientesInsight.values()].map((cliente) => {
      const datas = cliente.datas.sort((a, b) => a - b);
      const intervalos = datas.slice(1).map((data, index) => (data - datas[index]) / 86400000);
      return { id: cliente.id, nome: cliente.nome, compras: cliente.compras, total: cliente.total, intervaloMedioDias: intervalos.length ? intervalos.reduce((sum, valor) => sum + valor, 0) / intervalos.length : null };
    }).sort((a, b) => b.compras - a.compras || b.total - a.total).slice(0, 10);
    const clientesComCompra = clientesInsight.size;
    const clientesRecorrentes = [...clientesInsight.values()].filter((cliente) => cliente.compras > 1).length;
    const insights = {
      vendasPorHora: vendasPorHora.filter((item) => item.pedidos > 0),
      horarioPico: vendasPorHora.reduce((pico, item) => item.total > pico.total ? item : pico, { hora: null, total: 0, pedidos: 0, itens: 0 }),
      curvaABC,
      margemProdutos,
      estoqueParado,
      cancelamentoComandas: { canceladas: comandasCanceladas, totalFinalizadas: comandasFinalizadas, taxa: comandasFinalizadas ? (comandasCanceladas / comandasFinalizadas) * 100 : 0 },
      comparativoMes: { atual: { total: totalMesAtual, pedidos: mesAtual.length }, anterior: { total: totalMesAnterior, pedidos: mesAnterior.length }, variacaoPercentual: totalMesAnterior ? ((totalMesAtual - totalMesAnterior) / totalMesAnterior) * 100 : null },
      fidelidade: { clientesComCompra, clientesRecorrentes, taxaRecorrencia: clientesComCompra ? (clientesRecorrentes / clientesComCompra) * 100 : 0, clientes: clientesFrequentes },
    };
    res.json({ periodos: Object.fromEntries(periodMetrics.map((metric) => [metric.periodo, metric])), comandasAbertas: openCommands, pedidosHoje: pedidosDia.slice(0, 30), clientesCadastrados, clientesRecentes, vendasHoje: { pedidos: vendasHoje.length, itens: vendasHojeItens, total: vendasHojeTotal, recebido: vendasHojeRecebido, pendente: vendasHojePendente }, relatorioMes, relatorioClientes: { periodo: relatorioMes.periodo, totalCadastrados: todosClientes.length, clientesComCompra: relatorioClientes.filter((cliente) => cliente.pedidos > 0).length, totalVendido: relatorioClientes.reduce((total, cliente) => total + cliente.total, 0), totalRecebido: relatorioClientes.reduce((total, cliente) => total + cliente.recebido, 0), totalPendente: relatorioClientes.reduce((total, cliente) => total + cliente.pendente, 0), clientes: relatorioClientes }, insights, atualizadoEm: new Date() });
  } catch (error) { res.status(500).json({ msg: error.message }); }
});

module.exports = router;
