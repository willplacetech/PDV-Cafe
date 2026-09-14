import { useState, useEffect, useMemo } from 'react';
import api from '../services/api.jsx';
import { useToast } from '../components/Toast.jsx';
import { buildNotaVendaHtml, compartilharNotaWhatsApp } from '../utils/notaVenda.js';
import PagamentoResultadoModal from '../components/PagamentoResultadoModal.jsx';
import DateInput from '../components/DateInput.jsx';


const statusCor = {
  pendente: { bg: 'var(--accent-light)', txt: 'var(--accent-primary)', label: 'Pendente' },
  parcial: { bg: 'rgba(210,137,48,.16)', txt: 'var(--warning-bg)', label: 'Pagamento parcial' },
  pago: { bg: 'rgba(22,163,74,.12)', txt: 'var(--success-bg)', label: 'Quitado' },
  cancelado: { bg: 'var(--bg-tertiary)', txt: 'var(--text-secondary)', label: 'Cancelado' }
};


const formaPagamentoLabel = {
  dinheiro: '💵 Dinheiro',
  pix: '🔄 PIX',
  credito_loja: '🏪 Crédito Loja',
  cartao_credito: '💳 Cartão Crédito',
  cartao_debito: '💳 Cartão Débito',
};


export default function ContasReceber() {
  const [carregando, setCarregando] = useState(true);
  const [pedidos, setPedidos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [comandasAbertas, setComandasAbertas] = useState([]);
  const [clienteFiltro, setClienteFiltro] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('pendente');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [pagamentoModal, setPagamentoModal] = useState(null);
  const [pagamentoConcluido, setPagamentoConcluido] = useState(null);
  const [quitarClienteModal, setQuitarClienteModal] = useState(false);
  const [pagamentoMultiploModal, setPagamentoMultiploModal] = useState(null);
  const [novoPedidoModal, setNovoPedidoModal] = useState(null);
  const [alterarComandaModal, setAlterarComandaModal] = useState(null);
  const [novaComandaId, setNovaComandaId] = useState('');
  const [novoPedidoForm, setNovoPedidoForm] = useState({ produtoId: '', quantidade: '1', nomeSolicitante: '', observacao: '', itens: [] });
  const [formPagamento, setFormPagamento] = useState({ tipo: 'credito_loja', valorRecebido: '', observacao: '' });
  const [formPagamentoMultiplo, setFormPagamentoMultiplo] = useState({ tipo: 'credito_loja', observacao: '' });
  const [selecionados, setSelecionados] = useState(new Set());
  const { showToast } = useToast();


  useEffect(() => { carregarDados(); }, []);
  useEffect(() => { 
    carregarPedidos(); 
    setSelecionados(new Set());
  }, [clienteFiltro, statusFiltro, inicio, fim]);


  const carregarDados = async () => {
    try {
      const [clientesResponse, produtosResponse, comandasResponse] = await Promise.all([
        api.get('/customers'),
        api.get('/products'),
        api.get('/comandas?status=aberta')
      ]);
      setClientes(clientesResponse.data);
      setProdutos(produtosResponse.data);
      setComandasAbertas(comandasResponse.data || []);
    } catch { showToast('Erro ao carregar clientes', 'error'); }
  };


  const carregarPedidos = async () => {
    try {
      setCarregando(true);
      const params = new URLSearchParams();
      if (clienteFiltro) params.append('clienteId', clienteFiltro);
      if (statusFiltro) params.append('status', statusFiltro);
      if (inicio) params.append('inicio', inicio);
      if (fim) params.append('fim', fim);

      const res = await api.get(`/orders?${params}`);
      setPedidos(res.data || []);
    } catch { 
      showToast('Erro ao carregar pedidos', 'error'); 
      setPedidos([]);
    } finally {
      setCarregando(false);
    }
  };


  const totais = useMemo(() => {
    let totalEmAberto = 0;
    let totalBruto = 0;
    let totalPagoGeral = 0;

    if (!Array.isArray(pedidos) || pedidos.length === 0) {
      return { totalEmAberto, totalBruto, totalPagoGeral };
    }

    pedidos.forEach(pedido => {
      const valorTotal = parseFloat(pedido?.total) || 0;
      totalBruto += valorTotal;

      const valorPago = Array.isArray(pedido?.pagamentos)
        ? pedido.pagamentos.reduce((soma, pg) => soma + (parseFloat(pg?.valorRecebido) || 0), 0)
        : 0;
      totalPagoGeral += valorPago;

      const status = String(pedido?.status || '').toLowerCase();
      if (status !== 'pago' && status !== 'cancelado') {
        totalEmAberto += Math.max(0, valorTotal - valorPago);
      }
    });

    return { totalEmAberto, totalBruto, totalPagoGeral };
  }, [pedidos]);


  const toggleSelecionarTodos = () => {
    const disponiveis = pedidos.filter(p => p.status === 'pendente' || p.status === 'parcial');
    const todosIds = new Set(disponiveis.map(p => p._id));
    if (selecionados.size === disponiveis.length && disponiveis.length > 0) {
      setSelecionados(new Set());
    } else {
      const clientes = new Set(disponiveis.map(p => p.clienteId || `nome:${p.clienteNome || ''}`));
      if (clientes.size > 1) return showToast('Selecione apenas pedidos do mesmo cliente', 'warning');
      setSelecionados(todosIds);
    }
  };


  const toggleSelecionar = (id) => {
    const proximo = new Set(selecionados);
    if (proximo.has(id)) {
      proximo.delete(id);
    } else {
      const pedido = pedidos.find(p => p._id === id);
      const selecionado = pedidos.find(p => proximo.has(p._id));
      const chavePedido = pedido?.clienteId || `nome:${pedido?.clienteNome || ''}`;
      const chaveSelecionado = selecionado?.clienteId || `nome:${selecionado?.clienteNome || ''}`;
      if (selecionado && chavePedido !== chaveSelecionado) {
        return showToast('Selecione apenas pedidos do mesmo cliente', 'warning');
      }
      if (pedido?.status === 'pago' || pedido?.status === 'cancelado') {
        return showToast('Selecione apenas pedidos em aberto', 'warning');
      }
      proximo.add(id);
    }
    setSelecionados(proximo);
  };


  // ✅ Calcular valor total a receber dos selecionados
  const valorTotalSelecionados = useMemo(() => {
    return pedidos
      .filter(p => selecionados.has(p._id))
      .reduce((soma, pedido) => {
        const valorTotal = parseFloat(pedido?.total) || 0;
        const valorPago = Array.isArray(pedido?.pagamentos)
          ? pedido.pagamentos.reduce((s, pg) => s + (parseFloat(pg?.valorRecebido) || 0), 0)
          : 0;
        return soma + Math.max(0, valorTotal - valorPago);
      }, 0);
  }, [pedidos, selecionados]);


  // ✅ Abrir modal de RECEBIMENTO MÚLTIPLO dos marcados
  const abrirReceberMarcados = () => {
    if (selecionados.size === 0) {
      return showToast('Selecione pelo menos um pedido!', 'warning');
    }
    const pedidosSelecionados = pedidos.filter(p => selecionados.has(p._id));
    const clientes = new Set(pedidosSelecionados.map(p => p.clienteId || `nome:${p.clienteNome || ''}`));
    if (clientes.size > 1) return showToast('Selecione apenas pedidos do mesmo cliente', 'warning');
    setPagamentoMultiploModal(true);
    setFormPagamentoMultiplo({
      tipo: 'credito_loja',
      observacao: ''
    });
  };

  const consolidarPedidos = (pedidosConcluidos) => {
    const primeiro = pedidosConcluidos[0];
    return {
      ...primeiro,
      numero: pedidosConcluidos.map(pedido => pedido.numero).join(', '),
      itens: pedidosConcluidos.flatMap(pedido => pedido.itens || []),
      subtotal: pedidosConcluidos.reduce((soma, pedido) => soma + (Number(pedido.subtotal || pedido.total) || 0), 0),
      desconto: pedidosConcluidos.reduce((soma, pedido) => soma + (Number(pedido.desconto) || 0), 0),
      total: pedidosConcluidos.reduce((soma, pedido) => soma + (Number(pedido.total) || 0), 0),
      pagamentos: pedidosConcluidos.flatMap(pedido => pedido.pagamentos || []),
      status: 'pago',
    };
  };


  // ✅ Registrar pagamento de TODOS os marcados
  const registrarPagamentoMultiplo = async () => {
    const pedidosSelecionados = pedidos.filter(p => selecionados.has(p._id));
    const pedidosRecebidos = [];
    let sucessos = 0;
    let falhas = 0;

    for (const pedido of pedidosSelecionados) {
      try {
        const valorTotal = parseFloat(pedido?.total) || 0;
        const valorPago = Array.isArray(pedido?.pagamentos)
          ? pedido.pagamentos.reduce((s, pg) => s + (parseFloat(pg?.valorRecebido) || 0), 0)
          : 0;
        const valorAReceber = valorTotal - valorPago;

        const { data: pedidoAtualizado } = await api.patch(`/orders/${pedido._id}/pagar`, {
          tipo: formPagamentoMultiplo.tipo,
          valorRecebido: valorAReceber,
          observacao: formPagamentoMultiplo.observacao
        });
        pedidosRecebidos.push(pedidoAtualizado);
        sucessos++;
      } catch {
        falhas++;
      }
    }

    setPagamentoMultiploModal(null);
    setSelecionados(new Set());
    if (pedidosRecebidos.length > 0) {
      setPagamentoConcluido(consolidarPedidos(pedidosRecebidos));
    }
    carregarPedidos();

    if (sucessos > 0 && falhas === 0) {
      showToast(`✅ ${sucessos} pedido(s) recebido(s) com sucesso!`, 'success');
    } else if (sucessos > 0) {
      showToast(`✅ ${sucessos} recebido(s), ⚠️ ${falhas} falha(s)`, 'warning');
    } else {
      showToast('❌ Erro ao registrar pagamentos', 'error');
    }
  };


  // ✅ Receber pedido individual
  const abrirModalReceber = (pedido) => {
    const valorTotal = parseFloat(pedido?.total) || 0;
    const valorPago = Array.isArray(pedido?.pagamentos)
      ? pedido.pagamentos.reduce((soma, pg) => soma + (parseFloat(pg?.valorRecebido) || 0), 0)
      : 0;
    const valorAReceber = (valorTotal - valorPago).toFixed(2);

    setPagamentoModal(pedido);
    setFormPagamento({
      tipo: 'credito_loja',
      valorRecebido: valorAReceber,
      observacao: ''
    });
  };


  const registrarPagamento = async () => {
    try {
      const valorTotal = Number(pagamentoModal?.total) || 0;
      const valorPago = Array.isArray(pagamentoModal?.pagamentos)
        ? pagamentoModal.pagamentos.reduce((soma, pagamento) => soma + (Number(pagamento?.valorRecebido) || 0), 0)
        : 0;
      const valorAReceber = Math.max(0, valorTotal - valorPago).toFixed(2);
      const { data: pedidoAtualizado } = await api.patch(`/orders/${pagamentoModal._id}/pagar`, {
        tipo: formPagamento.tipo,
        valorRecebido: valorAReceber,
        observacao: formPagamento.observacao,
      });
      showToast('✅ Pagamento registrado!', 'success');
      setPagamentoModal(null);
      setPagamentoConcluido(pedidoAtualizado);
      setFormPagamento({ tipo: 'credito_loja', valorRecebido: '', observacao: '' });
      carregarPedidos();
    } catch { showToast('Erro ao registrar pagamento', 'error'); }
  };


  const quitarTotalCliente = async () => {
    if (!clienteFiltro) return showToast('Selecione um cliente para quitar todas as pendências', 'warning');
    setQuitarClienteModal(true);
  };

  const confirmarQuitacaoCliente = async () => {
    try {
      const { data } = await api.patch(`/orders/cliente/${clienteFiltro}/quitar`, { tipo: formPagamentoMultiplo.tipo, observacao: formPagamentoMultiplo.observacao });
      setQuitarClienteModal(false);
      setPagamentoConcluido(consolidarPedidos(data.pedidos));
      showToast('✅ Todas as pendências do cliente foram quitadas!', 'success');
      carregarPedidos();
    } catch (error) { showToast(error.response?.data?.msg || 'Erro ao quitar pendências', 'error'); }
  };

  const abrirNovoPedido = (pedido) => {
    setNovoPedidoModal(pedido);
    setNovoPedidoForm({ produtoId: '', quantidade: '1', nomeSolicitante: '', observacao: '', itens: [] });
  };

  const abrirAlterarComanda = (pedido) => {
    const comandaSelecionada = pedido.comandaId || comandasAbertas[0]?._id || '';
    setAlterarComandaModal(pedido);
    setNovaComandaId(comandaSelecionada);
  };

  const confirmarAlterarComanda = async () => {
    if (!alterarComandaModal) return;
    try {
      await api.patch(`/orders/${alterarComandaModal._id}/alterar-comanda`, { comandaId: novaComandaId || null });
      setAlterarComandaModal(null);
      setNovaComandaId('');
      carregarPedidos();
      showToast('✅ Comanda alterada com sucesso!', 'success');
    } catch (error) {
      showToast(error.response?.data?.msg || 'Erro ao alterar comanda', 'error');
    }
  };

  const adicionarItemNovoPedido = () => {
    if (!novoPedidoForm.produtoId || Number(novoPedidoForm.quantidade) < 0.001) return showToast('Selecione um produto e uma quantidade válida', 'warning');
    const produto = produtos.find((item) => item._id === novoPedidoForm.produtoId);
    const quantidade = Number(novoPedidoForm.quantidade);
    if (!produto) return;
    if (!produto.vendidoFracionado && !Number.isInteger(quantidade)) return showToast('Este produto é vendido somente por unidade', 'warning');
    setNovoPedidoForm((form) => ({ ...form, produtoId: '', quantidade: '1', itens: [...form.itens, { produtoId: produto._id, nome: produto.nome, quantidade }] }));
  };

  const adicionarItensAoPedido = async () => {
    if (!novoPedidoForm.itens.length) return showToast('Adicione pelo menos um produto', 'warning');
    if (!novoPedidoForm.nomeSolicitante.trim()) return showToast('Informe o nome de quem está fazendo o novo pedido', 'warning');
    try {
      await api.patch(`/orders/${novoPedidoModal._id}/adicionar-itens`, {
        itens: novoPedidoForm.itens,
        nomeSolicitante: novoPedidoForm.nomeSolicitante,
        observacao: novoPedidoForm.observacao,
      });
      setNovoPedidoModal(null);
      showToast('Novo pedido adicionado à conta', 'success');
      carregarPedidos();
    } catch (error) { showToast(error.response?.data?.msg || 'Erro ao adicionar novo pedido', 'error'); }
  };


  const imprimirComprovante = (pedido) => {
    {
      const janela = window.open('', '_blank', 'width=350,height=600');
      janela.document.write(buildNotaVendaHtml(pedido, { titulo: 'COMPROVANTE DE PAGAMENTO' }));
      janela.document.close();
      return;
    }
    const totalPago = Array.isArray(pedido.pagamentos)
      ? pedido.pagamentos.reduce((ac, pg) => ac + (parseFloat(pg.valorRecebido) || 0), 0)
      : 0;

    const data = new Date().toLocaleString('pt-BR');
    
    const cupom = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Comprovante de Quitação #${pedido.numero}</title>
        <style>
          * { font-family: 'Courier New', monospace; font-size: 12px; }
          body { width: 76mm; margin: 0; padding: 4mm; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .linha { border-top: 1px dashed #000; margin: 8px 0; }
          @media print { @page { margin: 0; size: 80mm auto; } }
        </style>
      </head>
      <body>
        <div class="center bold" style="font-size:16px;">COMPROVANTE DE QUITAÇÃO</div>
        <div class="center">Sabor de Abraço</div>
        <div class="linha"></div>
        <div><span class="bold">Pedido:</span> #${pedido.numero}</div>
        <div><span class="bold">Cliente:</span> ${pedido.clienteNome}</div>
        <div><span class="bold">Data Emissão:</span> ${data}</div>
        <div class="linha"></div>
        <div><span class="bold">Valor Total:</span> R$ ${parseFloat(pedido.total).toFixed(2).replace('.',',')}</div>
        <div><span class="bold">Total Pago:</span> R$ ${totalPago.toFixed(2).replace('.',',')}</div>
        <div style="color:green; font-weight:bold; font-size:14px; margin-top:10px;">✅ QUITADO</div>
        <div class="linha"></div>
        <div class="center">
          Declaro que o valor foi recebido.<br><br>
          ___________________________<br>
          Assinatura / Data
        </div>
        <script>window.onload=()=>{print();close()}</script>
      </body>
      </html>
    `;
    const janela = window.open('', '_blank', 'width=350,height=600');
    janela.document.write(cupom);
    janela.document.close();
  };


  const imprimirPedido = (pedido) => {
    {
      const janela = window.open('', '_blank', 'width=350,height=600');
      janela.document.write(buildNotaVendaHtml(pedido, { titulo: pedido.status === 'pago' ? 'NOTA DE VENDA' : 'PEDIDO PENDENTE' }));
      janela.document.close();
      return;
    }
    const totalPago = Array.isArray(pedido.pagamentos)
      ? pedido.pagamentos.reduce((ac, pg) => ac + (parseFloat(pg.valorRecebido) || 0), 0)
      : 0;
    const falta = Math.max(0, parseFloat(pedido.total) - totalPago);
    const data = new Date(pedido.createdAt).toLocaleString('pt-BR');
    
    const itensHtml = pedido.itens.map(item => `
      <div style="display:flex; justify-content:space-between; border-bottom: 1px dashed #000; padding: 4px 0;">
        <div style="flex:1; margin-right:8px;">
          <div style="font-weight:bold;">${item.nome}</div>
          <div style="font-size:10px;">Qtd: ${item.quantidade} x R$ ${item.precoUnitario.toFixed(2).replace('.',',')}</div>
        </div>
        <div style="font-weight:bold; white-space:nowrap;">R$ ${(item.quantidade * item.precoUnitario).toFixed(2).replace('.',',')}</div>
      </div>
    `).join('');

    const cupom = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Pedido #${pedido.numero}</title>
        <style>
          * { font-family: 'Courier New', monospace; font-size: 12px; }
          body { width: 76mm; margin: 0; padding: 4mm; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .linha { border-top: 2px dashed #000; margin: 8px 0; }
          .total { font-size: 14px; font-weight: bold; border-top: 2px solid #000; padding-top: 8px; margin-top: 8px; }
          @media print { @page { margin: 0; size: 80mm auto; } }
        </style>
      </head>
      <body>
        <div class="center bold" style="font-size:14px;">SABOR DE ABRAÇO</div>
        <div class="center" style="font-size:10px; color:#c2410c; font-weight:bold;">
          ${pedido.status === 'pendente' ? 'PEDIDO PENDENTE' : 'PAGAMENTO PARCIAL'}
        </div>
        <div class="linha"></div>
        <div><span class="bold">Pedido:</span> #${pedido.numero}</div>
        <div><span class="bold">Data:</span> ${data}</div>
        <div><span class="bold">Cliente:</span> ${pedido.clienteNome}</div>
        <div class="linha"></div>
        <div class="bold center">=== ITENS ===</div>
        ${itensHtml}
        <div class="linha"></div>
        <div style="display:flex; justify-content:space-between;">
          <span>Subtotal:</span><span>R$ ${parseFloat(pedido.subtotal || pedido.total).toFixed(2).replace('.',',')}</span>
        </div>
        ${pedido.desconto > 0 ? `
        <div style="display:flex; justify-content:space-between; color:#16a34a;">
          <span>Desconto:</span><span>-R$ ${parseFloat(pedido.desconto).toFixed(2).replace('.',',')}</span>
        </div>
        ` : ''}
        <div class="total" style="display:flex; justify-content:space-between;">
          <span>TOTAL:</span><span>R$ ${parseFloat(pedido.total).toFixed(2).replace('.',',')}</span>
        </div>
        ${totalPago > 0 ? `
        <div style="display:flex; justify-content:space-between; margin-top:8px; color:#16a34a;">
          <span>Já Pago:</span><span>R$ ${totalPago.toFixed(2).replace('.',',')}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-weight:bold; color:#dc2626;">
          <span>FALTA:</span><span>R$ ${falta.toFixed(2).replace('.',',')}</span>
        </div>
        ` : `
        <div style="display:flex; justify-content:space-between; font-weight:bold; color:#c2410c; margin-top:8px;">
          <span>TOTAL A PAGAR:</span><span>R$ ${parseFloat(pedido.total).toFixed(2).replace('.',',')}</span>
        </div>
        `}
        <div class="linha"></div>
        <div class="center" style="font-size:10px;">Obrigado pela preferência!</div>
        <script>window.onload=()=>{print();close()}</script>
      </body>
      </html>
    `;
    const janela = window.open('', '_blank', 'width=350,height=600');
    janela.document.write(cupom);
    janela.document.close();
  };


  const enviarWhatsApp = (pedido) => {
    return compartilharNotaWhatsApp(pedido, { titulo: pedido.status === 'pago' ? 'NOTA DE VENDA' : 'PEDIDO PENDENTE' });
    const totalPago = Array.isArray(pedido.pagamentos)
      ? pedido.pagamentos.reduce((ac, pg) => ac + (parseFloat(pg.valorRecebido) || 0), 0)
      : 0;
    const falta = Math.max(0, parseFloat(pedido.total) - totalPago);
    const data = new Date(pedido.createdAt).toLocaleString('pt-BR');

    const itensTexto = pedido.itens.map(item => 
      `• ${item.nome}\n  ${item.quantidade} x R$ ${item.precoUnitario.toFixed(2).replace('.',',')} = R$ ${(item.quantidade * item.precoUnitario).toFixed(2).replace('.',',')}`
    ).join('\n');

    const statusTexto = pedido.status === 'pago' 
      ? '✅ *QUITADO*' 
      : pedido.status === 'parcial' 
        ? '💰 *PAGAMENTO PARCIAL*' 
        : '⏳ *PENDENTE*';

    const texto = encodeURIComponent(
`${pedido.status === 'pago' ? '✅' : pedido.status === 'parcial' ? '💰' : '⏳'} *PEDIDO #${pedido.numero}*
${statusTexto}
📅 ${data}
👤 Cliente: ${pedido.clienteNome}

━━━━━━━━━━━━━━━━
📦 *ITENS:*
${itensTexto}
━━━━━━━━━━━━━━━━

💰 Valor Total: R$ ${parseFloat(pedido.total).toFixed(2).replace('.',',')}
${totalPago > 0 ? `💵 Já Pago: R$ ${totalPago.toFixed(2).replace('.',',')}\n` : ''}
${falta > 0 ? `🔴 *FALTA: R$ ${falta.toFixed(2).replace('.',',')}*\n` : ''}
Obrigado! 🙏`
    );

    const telefone = pedido.clienteTelefone ? pedido.clienteTelefone.replace(/\D/g, '') : '';
    const url = telefone 
      ? `https://wa.me/55${telefone}?text=${texto}`
      : `https://wa.me/?text=${texto}`;
    
    window.open(url, '_blank');
  };


  // ✅ Relatório completo do cliente
  const gerarRelatorioCompleto = () => {
    if (!clienteFiltro) return showToast('Selecione um cliente primeiro!', 'warning');
    if (pedidos.length === 0) return showToast('Nenhum pedido encontrado', 'warning');

    const data = new Date().toLocaleString('pt-BR');
    const clienteNome = clientes.find(c => c._id === clienteFiltro)?.nome || 'Cliente';

    const totaisRel = {
      bruto: pedidos.reduce((s, p) => s + (parseFloat(p.total) || 0), 0),
      pago: pedidos.reduce((s, p) => s + (Array.isArray(p.pagamentos) ? p.pagamentos.reduce((a, pg) => a + (parseFloat(pg.valorRecebido) || 0), 0) : 0), 0),
      aberto: pedidos.reduce((s, p) => {
        const st = String(p.status || '').toLowerCase();
        if (st === 'pago' || st === 'cancelado') return s;
        const tp = Array.isArray(p.pagamentos) ? p.pagamentos.reduce((a, pg) => a + (parseFloat(pg.valorRecebido) || 0), 0) : 0;
        return s + Math.max(0, parseFloat(p.total) - tp);
      }, 0)
    };

    const pedidosHtml = pedidos.map(p => {
      const totalPago = Array.isArray(p.pagamentos)
        ? p.pagamentos.reduce((ac, pg) => ac + (parseFloat(pg.valorRecebido) || 0), 0)
        : 0;
      const falta = Math.max(0, parseFloat(p.total) - totalPago);
      
      return `
        <div style="border-bottom: 1px dashed #000; padding: 6px 0;">
          <div style="display:flex; justify-content:space-between; font-weight:bold;">
            <span>#${p.numero} - ${p.clienteNome}</span>
            <span>R$ ${parseFloat(p.total).toFixed(2).replace('.',',')}</span>
          </div>
          <div style="font-size:10px;">
            Status: ${statusCor[p.status]?.label || p.status} | 
            ${falta > 0 ? `Falta: R$ ${falta.toFixed(2).replace('.',',')}` : 'Quitado'}
          </div>
        </div>
      `;
    }).join('');

    const relatorio = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Relatório Completo - ${clienteNome}</title>
        <style>
          * { font-family: 'Courier New', monospace; font-size: 12px; }
          body { width: 76mm; margin: 0; padding: 4mm; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .linha { border-top: 2px dashed #000; margin: 8px 0; }
          .total { font-size: 14px; font-weight: bold; border-top: 2px solid #000; padding-top: 8px; margin-top: 8px; }
          @media print { @page { margin: 0; size: 80mm auto; } }
        </style>
      </head>
      <body>
        <div class="center bold" style="font-size:14px;">RELATÓRIO DO CLIENTE</div>
        <div class="linha"></div>
        <div><span class="bold">Data:</span> ${data}</div>
        <div><span class="bold">Cliente:</span> ${clienteNome}</div>
        <div><span class="bold">Qtde Pedidos:</span> ${pedidos.length}</div>
        <div class="linha"></div>
        ${pedidosHtml}
        <div class="linha"></div>
        <div class="total" style="display:flex; justify-content:space-between;">
          <span>Total Bruto:</span>
          <span>R$ ${totaisRel.bruto.toFixed(2).replace('.',',')}</span>
        </div>
        <div style="display:flex; justify-content:space-between; color:#16a34a;">
          <span>Total Pago:</span>
          <span>R$ ${totaisRel.pago.toFixed(2).replace('.',',')}</span>
        </div>
        <div class="total" style="display:flex; justify-content:space-between; color:#c2410c;">
          <span>TOTAL A RECEBER:</span>
          <span>R$ ${totaisRel.aberto.toFixed(2).replace('.',',')}</span>
        </div>
        <script>window.onload=()=>{print();close()}</script>
      </body>
      </html>
    `;
    const janela = window.open('', '_blank', 'width=350,height=600');
    janela.document.write(relatorio);
    janela.document.close();
  };


  return (
    <div>
      <div className="page-heading">
        <div>
          <h1>📊 Contas a Receber</h1>
          <p>Acerto de pendências por cliente</p>
        </div>
      </div>

      {/* FILTROS */}
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16, boxShadow: 'var(--shadow-sm)',
        padding: 16, marginBottom: 16, display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))'
      }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Cliente</label>
          <select value={clienteFiltro} onChange={e => setClienteFiltro(e.target.value)} style={{
            width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: 10
          }}>
            <option value="">Todos os clientes</option>
            {clientes.map(c => <option key={c._id} value={c._id}>{c.nome}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Status</label>
          <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} style={{
            width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: 10
          }}>
            <option value="">Todos</option>
            <option value="pendente">Pendentes</option>
            <option value="parcial">Pagamento Parcial</option>
            <option value="pago">Quitados</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Data Início</label>
          <DateInput value={inicio} onChange={setInicio} style={{
            width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: 10
          }} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Data Fim</label>
          <DateInput value={fim} onChange={setFim} style={{
            width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: 10
          }} />
        </div>
      </div>

      {/* CARD DE TOTAL + BOTÕES */}
      <div style={{
        background: 'var(--brand-brown)',
        color: '#fff', borderRadius: 16, padding: 16, marginBottom: 16
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>Total a Receber</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {carregando ? '⏳ Carregando...' : `R$ ${Number(totais?.totalEmAberto ?? 0).toFixed(2).replace('.', ',')}`}
            </div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>
              {carregando ? 'Aguardando dados...' : `Bruto: R$ ${Number(totais?.totalBruto ?? 0).toFixed(2).replace('.', ',')} | Pago: R$ ${Number(totais?.totalPagoGeral ?? 0).toFixed(2).replace('.', ',')}`}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* ✅ Selecionar Todos */}
            {pedidos.length > 0 && (
              <button 
                onClick={toggleSelecionarTodos}
                style={{
                  padding: '6px 12px', 
                  background: selecionados.size === pedidos.length && pedidos.length > 0 ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.2)', 
                  color: '#fff', border: '1px solid rgba(255,255,255,.3)', borderRadius: 8,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer'
                }}
              >
                {selecionados.size === pedidos.filter(p => p.status === 'pendente' || p.status === 'parcial').length && pedidos.some(p => p.status === 'pendente' || p.status === 'parcial') ? '✓ Desmarcar Todos' : '☑ Selecionar Todos'}
              </button>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={abrirReceberMarcados} style={{
                  padding: '6px 12px', background: 'var(--brand-cream)', color: 'var(--brand-brown)',
                border: 'none', borderRadius: 8,
                fontSize: 12, fontWeight: 700, cursor: 'pointer'
              }}>💰 Receber Marcados ({selecionados.size})</button>
              {clienteFiltro && (
                <button onClick={quitarTotalCliente} style={{
                  padding: '6px 12px', background: 'var(--success-bg)', color: '#fff',
                  border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer'
                }}>✅ Quitar Total do Cliente</button>
              )}
              
              {clienteFiltro && (
                <button onClick={gerarRelatorioCompleto} style={{
                  padding: '6px 12px', background: 'var(--success-bg)', color: '#fff',
                  border: 'none', borderRadius: 8,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer'
                }}>📄 Relatório do cliente</button>
              )}
            </div>
            {/* ✅ Mostra valor dos marcados */}
            {selecionados.size > 0 && (
              <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>
                Valor selecionado: <strong>R$ {valorTotalSelecionados.toFixed(2).replace('.',',')}</strong>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* LISTA DE PEDIDOS */}
      {pedidos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12 }}>
          {carregando ? 'Carregando pedidos...' : 'Nenhum pedido encontrado'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {pedidos.map(pedido => {
            const st = statusCor[pedido.status];
            const totalPago = Array.isArray(pedido.pagamentos)
              ? pedido.pagamentos.reduce((ac, pg) => ac + (parseFloat(pg.valorRecebido) || 0), 0)
              : 0;
            const falta = Math.max(0, parseFloat(pedido.total) - totalPago);
            const estaSelecionado = selecionados.has(pedido._id);

            return (
              <div key={pedido._id} style={{
                background: estaSelecionado ? 'rgba(22,163,74,.12)' : 'var(--bg-secondary)', 
                border: estaSelecionado ? '2px solid var(--success-bg)' : '1px solid var(--border-color)', 
                borderRadius: 14, padding: 16,
                transition: 'all 0.15s'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 220px' }}>
                    <input 
                      type="checkbox" 
                      checked={estaSelecionado}
                      onChange={() => toggleSelecionar(pedido._id)}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, overflowWrap: 'anywhere' }}>#{pedido.numero} — {pedido.clienteNome}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {new Date(pedido.createdAt).toLocaleString('pt-BR')} • Atendente: {pedido.atendente}
                      </div>
                    </div>
                  </div>
                  <span style={{
                    background: st?.bg || 'var(--bg-tertiary)', 
                    color: st?.txt || 'var(--text-secondary)', 
                    padding: '4px 10px',
                    borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap'
                  }}>{st?.label || pedido.status}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Valor Total</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>R$ {parseFloat(pedido.total).toFixed(2).replace('.',',')}</div>
                  </div>
                  {pedido.status !== 'pendente' && (
                    <>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Pago</div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--success-bg)' }}>R$ {totalPago.toFixed(2).replace('.',',')}</div>
                      </div>
                      {falta > 0 && (
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>A Receber</div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--error-bg)' }}>R$ {falta.toFixed(2).replace('.',',')}</div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {pedido.pagamentos?.length > 0 && (
                  <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Pagamentos:</div>
                    {pedido.pagamentos.map((pg, i) => (
                      <div key={i} style={{ fontSize: 12, padding: '4px 0', borderTop: '1px solid var(--border-light)' }}>
                        {pg.dataPagamento ? new Date(pg.dataPagamento).toLocaleDateString('pt-BR') : '-'}
                        {' • '}{formaPagamentoLabel[pg.tipo] || pg.tipo}
                        {' • '}<strong>R$ {parseFloat(pg.valorRecebido).toFixed(2).replace('.',',')}</strong>
                        {pg.quitado && ' ✅'}
                      </div>
                    ))}
                  </div>
                )}

                {/* ✅ Ações principais em uma linha no desktop */}
                <div className="order-actions" style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  alignItems: 'stretch'
                }}>
                  <button 
                    onClick={() => pedido.status === 'pago' ? imprimirComprovante(pedido) : imprimirPedido(pedido)} 
                    style={{
                      flex: '1 1 160px',
                      padding: '10px 8px', 
                      background: 'var(--brand-brown)', 
                      color: '#fff',
                      border: 'none', borderRadius: 8, 
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      whiteSpace: 'nowrap', minHeight: 42, boxSizing: 'border-box'
                    }}
                  >
                    🖨️ {pedido.status === 'pago' ? 'Comprovante' : 'Imprimir'}
                  </button>
                  
                  <button 
                    onClick={() => enviarWhatsApp(pedido)} 
                    style={{
                      flex: '1 1 160px',
                      padding: '10px 8px', 
                      background: 'var(--success-bg)', 
                      color: '#fff',
                      border: 'none', borderRadius: 8, 
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      whiteSpace: 'nowrap', minHeight: 42, boxSizing: 'border-box' 
                    }}
                  >
                    💬 WhatsApp
                  </button>

                  {pedido.status !== 'pago' && pedido.status !== 'cancelado' && (
                    <>
                      <button
                        onClick={() => (pedido.comandaId ? abrirNovoPedido(pedido) : abrirAlterarComanda(pedido))}
                        style={{
                          flex: '1 1 180px',
                          padding: '10px 8px', background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8,
                          fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          whiteSpace: 'nowrap', minHeight: 42, boxSizing: 'border-box'
                        }}
                      >{pedido.comandaId ? '➕ Novo pedido' : '🔗 Vincular comanda'}</button>
                      <button
                        onClick={() => abrirAlterarComanda(pedido)}
                        style={{
                          flex: '1 1 180px',
                          padding: '10px 8px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 8,
                          fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          whiteSpace: 'nowrap', minHeight: 42, boxSizing: 'border-box'
                        }}
                      >✏️ Alterar comanda</button>
                      <button 
                        onClick={() => abrirModalReceber(pedido)}
                        style={{
                          flex: '1 1 160px',
                          padding: '10px 8px', 
                          background: 'var(--success-bg)',
                          color: '#fff',
                          border: 'none', borderRadius: 8, 
                          fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          whiteSpace: 'nowrap', minHeight: 42, boxSizing: 'border-box'
                        }}
                      >
                        💰 Receber
                      </button>
                    </>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* ✅ MODAL DE RECEBIMENTO MÚLTIPLO (para marcados) */}
      {pagamentoMultiploModal && (
        <div onClick={() => setPagamentoMultiploModal(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 20
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380
          }}>
            <h3 style={{ margin: '0 0 16px' }}>💰 Receber Pedidos Selecionados</h3>
            <p style={{ fontSize: 14, margin: '0 0 16px' }}>
              <strong>{selecionados.size}</strong> pedido(s) selecionado(s)<br/>
              Valor total a receber: <strong style={{ color: 'var(--accent-primary)', fontSize: 16 }}>R$ {valorTotalSelecionados.toFixed(2).replace('.',',')}</strong>
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Forma de Pagamento</label>
              <select value={formPagamentoMultiplo.tipo} onChange={e => setFormPagamentoMultiplo({...formPagamentoMultiplo, tipo: e.target.value})} style={{
                width: '100%', padding: 10, border: '1px solid var(--border-color)', borderRadius: 10
              }}>
                <option value="dinheiro">💵 Dinheiro</option>
                <option value="pix">🔄 PIX</option>
                <option value="credito_loja">🏪 Crédito Loja</option>
                <option value="cartao_credito">💳 Cartão de Crédito</option>
                <option value="cartao_debito">💳 Cartão de Débito</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Observação</label>
              <input type="text" placeholder="Ex: Pagamento em lote"
                value={formPagamentoMultiplo.observacao}
                onChange={e => setFormPagamentoMultiplo({...formPagamentoMultiplo, observacao: e.target.value})}
                style={{ width: '100%', padding: 10, border: '1px solid var(--border-color)', borderRadius: 10 }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setPagamentoMultiploModal(null)} style={{
                flex: 1, padding: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 10, fontWeight: 600, cursor: 'pointer'
              }}>Cancelar</button>
              <button onClick={registrarPagamentoMultiplo} style={{
                flex: 1, padding: 12, background: 'var(--success-bg)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer'
              }}>✅ Receber Tudo</button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ MODAL DE RECEBIMENTO INDIVIDUAL */}
      {pagamentoModal && (
        <div onClick={() => setPagamentoModal(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 20
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360
          }}>
            <h3 style={{ margin: '0 0 16px' }}>Receber Pagamento</h3>
            <p style={{ fontSize: 14, margin: '0 0 16px' }}>
              Pedido #{pagamentoModal.numero} — <strong>{pagamentoModal.clienteNome}</strong>
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Forma de Pagamento</label>
              <select value={formPagamento.tipo} onChange={e => setFormPagamento({...formPagamento, tipo: e.target.value})} style={{
                width: '100%', padding: 10, border: '1px solid var(--border-color)', borderRadius: 10
              }}>
                <option value="dinheiro">💵 Dinheiro</option>
                <option value="pix">🔄 PIX</option>
                <option value="credito_loja">🏪 Crédito Loja</option>
                <option value="cartao_credito">💳 Cartão de Crédito</option>
                <option value="cartao_debito">💳 Cartão de Débito</option>
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Valor total para quitar (R$)</label>
              <input type="text" readOnly autoFocus
                value={formPagamento.valorRecebido}
                style={{ width: '100%', padding: 10, border: '1px solid var(--border-color)', borderRadius: 10, fontSize: 16, background: 'var(--bg-tertiary)', fontWeight: 700 }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Observação</label>
              <input type="text" placeholder="Ex: Pagamento parcial"
                value={formPagamento.observacao}
                onChange={e => setFormPagamento({...formPagamento, observacao: e.target.value})}
                style={{ width: '100%', padding: 10, border: '1px solid var(--border-color)', borderRadius: 10 }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setPagamentoModal(null)} style={{
                flex: 1, padding: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 10, fontWeight: 600, cursor: 'pointer'
              }}>Cancelar</button>
              <button onClick={registrarPagamento} style={{
                flex: 1, padding: 12, background: 'var(--success-bg)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer'
              }}>Quitar Total</button>
            </div>
          </div>
        </div>
      )}

      {alterarComandaModal && (
        <div onClick={() => setAlterarComandaModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 20 }}>
          <div onClick={event => event.stopPropagation()} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 420 }}>
            <h3 style={{ margin: '0 0 6px' }}>✏️ Alterar comanda</h3>
            <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)', fontSize: 13 }}>Pedido #{alterarComandaModal.numero} · {alterarComandaModal.clienteNome}</p>
            <label style={{ display: 'block', marginBottom: 12, fontSize: 12, fontWeight: 700 }}>Comanda aberta
              <select value={novaComandaId} onChange={event => setNovaComandaId(event.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 10, marginTop: 4, border: '1px solid var(--border-color)', borderRadius: 10 }}>
                <option value="">Selecione uma comanda</option>
                {comandasAbertas.map((comanda) => (
                  <option key={comanda._id} value={comanda._id}>#{comanda.numero} · {comanda.clienteNome}</option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAlterarComandaModal(null)} style={{ flex: 1, padding: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmarAlterarComanda} disabled={!novaComandaId} style={{ flex: 1, padding: 12, background: novaComandaId ? 'var(--success-bg)' : 'var(--bg-tertiary)', color: novaComandaId ? '#fff' : 'var(--text-secondary)', border: 'none', borderRadius: 10, fontWeight: 700, cursor: novaComandaId ? 'pointer' : 'not-allowed' }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {novoPedidoModal && (
        <div onClick={() => setNovoPedidoModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 20 }}>
          <div onClick={event => event.stopPropagation()} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 6px' }}>➕ Novo pedido na conta</h3>
            <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)', fontSize: 13 }}>Pedido #{novoPedidoModal.numero} · {novoPedidoModal.clienteNome}</p>
            <div className="novo-pedido-item-form">
              <label className="novo-pedido-field">Produto<select value={novoPedidoForm.produtoId} onChange={event => setNovoPedidoForm({ ...novoPedidoForm, produtoId: event.target.value })}><option value="">Selecione um produto</option>{produtos.map(produto => <option key={produto._id} value={produto._id}>{produto.nome}</option>)}</select></label>
              <label className="novo-pedido-field novo-pedido-quantity">Quantidade<input type="number" min="0.001" step="0.001" value={novoPedidoForm.quantidade} onChange={event => setNovoPedidoForm({ ...novoPedidoForm, quantidade: event.target.value })} /></label>
              <button type="button" className="novo-pedido-add" onClick={adicionarItemNovoPedido}>Adicionar produto</button>
            </div>
            {novoPedidoForm.itens.length > 0 && <div className="novo-pedido-items">{novoPedidoForm.itens.map((item, index) => <div className="novo-pedido-item" key={`${item.produtoId}-${index}`}><span><strong>{item.quantidade}x</strong> {item.nome}</span><button type="button" onClick={() => setNovoPedidoForm({ ...novoPedidoForm, itens: novoPedidoForm.itens.filter((_, itemIndex) => itemIndex !== index) })}>Remover</button></div>)}</div>}
            <label style={{ display: 'block', marginBottom: 12, fontSize: 12, fontWeight: 700 }}>Nome de quem está fazendo o novo pedido<input value={novoPedidoForm.nomeSolicitante} onChange={event => setNovoPedidoForm({ ...novoPedidoForm, nomeSolicitante: event.target.value })} placeholder="Ex.: Maria" style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 10, marginTop: 4, border: '1px solid var(--border-color)', borderRadius: 10 }} /></label>
            <label style={{ display: 'block', marginBottom: 16, fontSize: 12, fontWeight: 700 }}>Observação do novo pedido<textarea value={novoPedidoForm.observacao} onChange={event => setNovoPedidoForm({ ...novoPedidoForm, observacao: event.target.value })} placeholder="Ex.: café e salgado para Maria" rows="3" style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 10, marginTop: 4, border: '1px solid var(--border-color)', borderRadius: 10, resize: 'vertical' }} /></label>
            <div style={{ display: 'flex', gap: 10 }}><button onClick={() => setNovoPedidoModal(null)} style={{ flex: 1, padding: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button><button onClick={adicionarItensAoPedido} style={{ flex: 1, padding: 12, background: 'var(--success-bg)', color: '#fff', border: 0, borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Confirmar novo pedido</button></div>
          </div>
        </div>
      )}

      <PagamentoResultadoModal
        pedido={pagamentoConcluido}
        titulo="Pagamento concluído"
        onPrint={() => pagamentoConcluido?.status === 'pago' ? imprimirComprovante(pagamentoConcluido) : imprimirPedido(pagamentoConcluido)}
        onWhatsApp={() => enviarWhatsApp(pagamentoConcluido)}
        onClose={() => setPagamentoConcluido(null)}
      />

      {quitarClienteModal && (
        <div onClick={() => setQuitarClienteModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 20 }}>
          <div onClick={event => event.stopPropagation()} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380 }}>
            <h3 style={{ margin: '0 0 8px' }}>✅ Quitar total do cliente</h3>
            <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)' }}>Todas as pendências do cliente selecionado serão quitadas.</p>
            <label style={{ display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 700 }}>Forma de pagamento</label>
            <select value={formPagamentoMultiplo.tipo} onChange={event => setFormPagamentoMultiplo({ ...formPagamentoMultiplo, tipo: event.target.value })} style={{ width: '100%', padding: 10, border: '1px solid var(--border-color)', borderRadius: 10, marginBottom: 16 }}>
              <option value="dinheiro">💵 Dinheiro</option>
              <option value="pix">🔄 PIX</option>
              <option value="credito_loja">🏪 Crédito Loja</option>
              <option value="cartao_credito">💳 Cartão de Crédito</option>
              <option value="cartao_debito">💳 Cartão de Débito</option>
            </select>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setQuitarClienteModal(false)} style={{ flex: 1, padding: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmarQuitacaoCliente} style={{ flex: 1, padding: 12, background: 'var(--success-bg)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Quitar tudo</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .novo-pedido-item-form {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 112px 150px;
          gap: 10px;
          align-items: end;
          margin-bottom: 14px;
          padding: 12px;
          border: 1px solid var(--border-color);
          border-radius: 12px;
          background: var(--bg-tertiary);
        }

        .novo-pedido-field {
          display: grid;
          gap: 6px;
          color: var(--text-secondary);
          font-size: 11px;
          font-weight: 800;
        }

        .novo-pedido-field select,
        .novo-pedido-field input {
          width: 100%;
          min-height: 42px;
          box-sizing: border-box;
          padding: 9px 10px;
          border: 1px solid var(--border-color);
          border-radius: 9px;
          background: var(--input-bg);
          color: var(--input-text);
          font-size: 14px;
        }

        .novo-pedido-add {
          min-height: 42px;
          padding: 9px 12px;
          border: 1px solid var(--accent-primary);
          border-radius: 9px;
          background: var(--accent-primary);
          color: #fff;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
        }

        .novo-pedido-items {
          display: grid;
          gap: 0;
          margin-bottom: 14px;
          padding: 4px 12px;
          border: 1px solid var(--border-light);
          border-radius: 10px;
          background: var(--bg-tertiary);
        }

        .novo-pedido-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-height: 42px;
          border-bottom: 1px solid var(--border-light);
          color: var(--text-primary);
          font-size: 13px;
        }

        .novo-pedido-item:last-child { border-bottom: 0; }
        .novo-pedido-item strong { color: var(--accent-primary); }
        .novo-pedido-item button {
          border: 0;
          background: transparent;
          color: var(--error-bg);
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }

        @media (max-width: 900px) {
          .novo-pedido-item-form { grid-template-columns: minmax(0, 1fr) 112px; }
          .novo-pedido-add { grid-column: 1 / -1; }
        }

        @media (max-width: 480px) {
          .novo-pedido-item-form { grid-template-columns: 1fr; }
          .novo-pedido-add { grid-column: auto; width: 100%; }
          .novo-pedido-item { align-items: flex-start; flex-direction: column; justify-content: center; gap: 4px; padding: 8px 0; }
        }
      `}</style>
    </div>
  );
}
