import { criarOperacoesFinanceiras } from '../utils/operacaoFinanceira';
import { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import api from '../services/api.jsx';
import { permiteFracionar } from '../utils/quantidadeVenda.js';
import { useToast } from '../components/useToast.js';
import { buildNotaVendaHtml, compartilharNotaWhatsApp, textoSeguro } from '../utils/notaVenda.js';
import PagamentoResultadoModal from '../components/PagamentoResultadoModal.jsx';
import DateInput from '../components/DateInput.jsx';
import { FORMAS_PAGAMENTO, dataBR, normalizarPagamentos, rotuloPagamento, saldoDevedor, statusPagamentoInfo, totalPago as somarPagamentos } from '../utils/formasPagamento.jsx';


const statusCor = {
  pendente: { bg: 'var(--accent-light)', txt: 'var(--accent-primary)', label: 'Pendente' },
  parcial: { bg: 'rgba(210,137,48,.16)', txt: 'var(--warning-bg)', label: 'Pagamento parcial' },
  pago: { bg: 'rgba(22,163,74,.12)', txt: 'var(--success-bg)', label: 'Quitado' },
  cancelado: { bg: 'var(--bg-tertiary)', txt: 'var(--text-secondary)', label: 'Cancelado' }
};


export default function ContasReceber() {
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState('pedidos');
  const [pedidos, setPedidos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [comandasAbertas, setComandasAbertas] = useState([]);
  const [clienteFiltro, setClienteFiltro] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('abertas');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [pagamentoModal, setPagamentoModal] = useState(null);
  const [pagamentoConcluido, setPagamentoConcluido] = useState(null);
  const [quitarClienteModal, setQuitarClienteModal] = useState(false);
  const [pagamentoMultiploModal, setPagamentoMultiploModal] = useState(null);
  const [novoPedidoModal, setNovoPedidoModal] = useState(null);
  const [novoPedidoForm, setNovoPedidoForm] = useState({ produtoId: '', quantidade: '1', nomeSolicitante: '', observacao: '', itens: [] });
  const [formPagamento, setFormPagamento] = useState({ tipo: 'dinheiro', valorRecebido: '', observacao: '' });
  const [formPagamentoMultiplo, setFormPagamentoMultiplo] = useState({ tipo: 'dinheiro', observacao: '' });
  const [formComanda, setFormComanda] = useState(null);
  const [selecionados, setSelecionados] = useState(new Set());
  const operacoesRef = useRef(null);
  if (operacoesRef.current === null) { operacoesRef.current = criarOperacoesFinanceiras(api); }
  const recebendoRef = useRef(false);
  const [recebendo, setRecebendo] = useState(false);
  useEffect(() => {
    if (!pagamentoModal && !formComanda && !pagamentoMultiploModal && !quitarClienteModal) operacoesRef.current.limpar();
  }, [pagamentoModal, formComanda, pagamentoMultiploModal, quitarClienteModal]);
  const { showToast } = useToast();
  const produtoNovoPedido = produtos.find((produto) => produto._id === novoPedidoForm.produtoId);
  const passoQuantidadeNovoPedido = permiteFracionar(produtoNovoPedido) ? '0.001' : '1';
  const saldoPagamentoIndividual = Math.max(0, Number(pagamentoModal?.total || 0) - somarPagamentos(pagamentoModal?.pagamentos));


  const carregarDados = useCallback(async () => {
    try {
      const [clientesResponse, produtosResponse] = await Promise.all([
        api.get('/customers'),
        api.get('/products')
      ]);
      setClientes(clientesResponse.data);
      setProdutos(produtosResponse.data);
    } catch { showToast('Erro ao carregar clientes', 'error'); }
  }, [showToast]);


  const carregarComandas = useCallback(async () => {
    if (aba !== 'comandas') return;
    try {
      const params = new URLSearchParams();
      if (clienteFiltro) params.append('clienteId', clienteFiltro);
      if (inicio) params.append('dataInicio', inicio);
      if (fim) params.append('dataFim', fim);
      const res = await api.get(`/comandas/a-receber?${params}`);
      setComandasAbertas(res.data || []);
    } catch {
      showToast('Erro ao carregar comandas em aberto', 'error');
      setComandasAbertas([]);
    }
  }, [aba, clienteFiltro, inicio, fim, showToast]);


  const carregarPedidos = useCallback(async () => {
    try {
      setCarregando(true);
      const params = new URLSearchParams();
      if (clienteFiltro) params.append('clienteId', clienteFiltro);
      if (statusFiltro) params.append('status', statusFiltro);
      if (inicio) params.append('inicio', inicio);
      if (fim) params.append('fim', fim);

      const res = await api.get(`/orders?${params}`);
      setPedidos(res.data || []);
      setSelecionados(new Set());
    } catch {
      showToast('Erro ao carregar pedidos', 'error');
      setPedidos([]);
    } finally {
      setCarregando(false);
    }
  }, [clienteFiltro, statusFiltro, inicio, fim, showToast]);


  useEffect(() => {
    const inicializar = async () => { await carregarDados(); };
    inicializar();
  }, [carregarDados]);
  useEffect(() => {
    const atualizar = async () => {
      await Promise.all([carregarPedidos(), carregarComandas()]);
    };
    atualizar();
  }, [carregarPedidos, carregarComandas, aba]);

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

      const valorPago = somarPagamentos(pedido?.pagamentos);
      totalPagoGeral += valorPago;

      const status = String(pedido?.status || '').toLowerCase();
      if (status !== 'pago' && status !== 'cancelado') {
        totalEmAberto += Math.max(0, valorTotal - valorPago);
      }
    });

    return { totalEmAberto, totalBruto, totalPagoGeral };
  }, [pedidos]);


  const totaisComandas = useMemo(() => {
    let emAberto = 0;
    let bruto = 0;
    let pago = 0;
    comandasAbertas.forEach((comanda) => {
      const valorTotal = Number(comanda?.valorTotal || 0);
      const valorPago = somarPagamentos(comanda?.historicoPagamentos);
      bruto += valorTotal;
      pago += valorPago;
      emAberto += saldoDevedor(valorTotal, comanda?.historicoPagamentos);
    });
    return { emAberto, bruto, pago };
  }, [comandasAbertas]);


  const totaisExibidos = aba === 'comandas'
    ? { emAberto: totaisComandas.emAberto, bruto: totaisComandas.bruto, pago: totaisComandas.pago }
    : { emAberto: totais.totalEmAberto, bruto: totais.totalBruto, pago: totais.totalPagoGeral };


  const abrirReceberComanda = (comanda) => {
    const saldo = saldoDevedor(comanda?.valorTotal, comanda?.historicoPagamentos);
    setFormComanda({ comanda, formaPagamento: 'dinheiro', valor: saldo > 0 ? saldo.toFixed(2).replace('.', ',') : '', observacao: '' });
  };


  /** Aceita só dígitos e uma vírgula, evitando que o campo congele como number input. */
  const digitarValorComanda = (texto) => {
    const limpo = String(texto ?? '').replace(/[^\d,]/g, '').replace(/^,+/, '');
    const partes = limpo.split(',');
    const normalizado = partes.length > 1 ? `${partes[0]},${partes.slice(1).join('')}` : partes[0];
    setFormComanda((atual) => ({ ...atual, valor: normalizado }));
  };


  const registrarRecebimentoComanda = async (event) => {
    event.preventDefault();
    if (!formComanda?.comanda?._id) return;
    const valor = Number(String(formComanda.valor || '').replace(',', '.'));
    const saldo = saldoDevedor(formComanda.comanda.valorTotal, formComanda.comanda.historicoPagamentos);
    if (!Number.isFinite(valor) || valor <= 0) return showToast('Informe um valor válido', 'warning');
    if (valor > saldo) return showToast(`O valor não pode ser maior que o saldo em aberto (R$ ${saldo.toFixed(2)})`, 'warning');
    if (recebendoRef.current) return;
    recebendoRef.current = true;
    setRecebendo(true);
    try {
      await operacoesRef.current.enviar('patch', `/comandas/${formComanda.comanda._id}/receber-parcial`, {
        valorRecebido: valor,
        formaPagamento: formComanda.formaPagamento,
        observacao: formComanda.observacao,
      });
      const restante = Math.max(0, Number((saldo - valor).toFixed(2)));
      showToast(restante > 0 ? `Recebido R$ ${valor.toFixed(2)}. Falta R$ ${restante.toFixed(2)}.` : `Comanda #${formComanda.comanda.numero} quitada.`, 'success');
      setFormComanda(null);
      await carregarComandas();
    } catch (error) {
      showToast(error.response?.data?.msg || 'Não foi possível registrar o recebimento', 'error');
    } finally { recebendoRef.current = false; setRecebendo(false); }
  };


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
        const valorPago = somarPagamentos(pedido?.pagamentos);
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
      tipo: 'dinheiro',
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
    if (recebendoRef.current) return;
    recebendoRef.current = true;
    setRecebendo(true);
    const pedidosSelecionados = pedidos.filter(p => selecionados.has(p._id));
    const pedidosRecebidos = [];
    let sucessos = 0;
    let falhas = 0;

    for (const pedido of pedidosSelecionados) {
      try {
        const valorTotal = parseFloat(pedido?.total) || 0;
        const valorPago = somarPagamentos(pedido.pagamentos);
        const valorAReceber = valorTotal - valorPago;

        const { data: pedidoAtualizado } = await operacoesRef.current.enviar('patch', `/orders/${pedido._id}/pagar`, {
          tipo: formPagamentoMultiplo.tipo,
          valorRecebido: valorAReceber,
          observacao: formPagamentoMultiplo.observacao
        }, { reusarConcluido: true });
        pedidosRecebidos.push(pedidoAtualizado);
        sucessos++;
      } catch {
        falhas++;
      }
    }

    if (falhas === 0) { setPagamentoMultiploModal(null); setSelecionados(new Set()); }
    if (falhas === 0 && pedidosRecebidos.length > 0) {
      setPagamentoConcluido(consolidarPedidos(pedidosRecebidos));
    }
    if (falhas === 0) carregarPedidos();
    recebendoRef.current = false;
    setRecebendo(false);

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
    const valorPago = somarPagamentos(pedido?.pagamentos);
    const valorAReceber = (valorTotal - valorPago).toFixed(2);

    setPagamentoModal(pedido);
    setFormPagamento({
      tipo: 'dinheiro',
      valorRecebido: valorAReceber,
      observacao: ''
    });
  };


  const registrarPagamento = async () => {
    const valorRecebido = Number(String(formPagamento.valorRecebido || '').replace(',', '.'));
    if (!Number.isFinite(valorRecebido) || valorRecebido <= 0) return showToast('Informe um valor válido', 'warning');
    if (valorRecebido > saldoPagamentoIndividual) return showToast(`O valor não pode ser maior que o saldo pendente (R$ ${saldoPagamentoIndividual.toFixed(2)})`, 'warning');

    if (recebendoRef.current) return;
    recebendoRef.current = true;
    setRecebendo(true);
    try {
      const { data: pedidoAtualizado } = await operacoesRef.current.enviar('patch', `/orders/${pagamentoModal._id}/pagar`, {
        tipo: formPagamento.tipo,
        valorRecebido,
        observacao: formPagamento.observacao,
      });
      const restante = Math.max(0, Number((saldoPagamentoIndividual - valorRecebido).toFixed(2)));
      showToast(restante > 0 ? `Recebido R$ ${valorRecebido.toFixed(2)}. Falta R$ ${restante.toFixed(2)}.` : 'Pedido quitado.', 'success');
      setPagamentoModal(null);
      setPagamentoConcluido(pedidoAtualizado);
      setFormPagamento({ tipo: 'dinheiro', valorRecebido: '', observacao: '' });
      carregarPedidos();
    } catch { showToast('Erro ao registrar pagamento', 'error'); } finally { recebendoRef.current = false; setRecebendo(false); }
  };


  const quitarTotalCliente = async () => {
    if (!clienteFiltro) return showToast('Selecione um cliente para quitar todas as pendências', 'warning');
    setQuitarClienteModal(true);
  };

  const confirmarQuitacaoCliente = async () => {
    if (recebendoRef.current) return;
    recebendoRef.current = true;
    setRecebendo(true);
    try {
      const { data } = await operacoesRef.current.enviar('patch', `/orders/cliente/${clienteFiltro}/quitar`, { tipo: formPagamentoMultiplo.tipo, observacao: formPagamentoMultiplo.observacao });
      setQuitarClienteModal(false);
      setPagamentoConcluido(consolidarPedidos(data.pedidos));
      showToast('✅ Todas as pendências do cliente foram quitadas!', 'success');
      carregarPedidos();
    } catch (error) { showToast(error.response?.data?.msg || 'Erro ao quitar pendências', 'error'); } finally { recebendoRef.current = false; setRecebendo(false); }
  };

  const abrirNovoPedido = (pedido) => {
    setNovoPedidoModal(pedido);
    setNovoPedidoForm({ produtoId: '', quantidade: '1', nomeSolicitante: '', observacao: '', itens: [] });
  };

  const adicionarItemNovoPedido = () => {
    if (!novoPedidoForm.produtoId || !Number.isFinite(Number(novoPedidoForm.quantidade)) || Number(novoPedidoForm.quantidade) < Number(passoQuantidadeNovoPedido)) return showToast('Selecione um produto e uma quantidade válida', 'warning');
    const produto = produtos.find((item) => item._id === novoPedidoForm.produtoId);
    const quantidade = Number(novoPedidoForm.quantidade);
    if (!produto) return;
    if (!permiteFracionar(produto) && !Number.isInteger(quantidade)) return showToast('Este produto é vendido somente por unidade', 'warning');
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
  };


  const imprimirPedido = (pedido) => {
    {
      const janela = window.open('', '_blank', 'width=350,height=600');
      janela.document.write(buildNotaVendaHtml(pedido, { titulo: pedido.status === 'pago' ? 'NOTA DE VENDA' : 'PEDIDO PENDENTE' }));
      janela.document.close();
      return;
    }
  };


  const enviarWhatsApp = (pedido) => {
    return compartilharNotaWhatsApp(pedido, { titulo: pedido.status === 'pago' ? 'NOTA DE VENDA' : 'PEDIDO PENDENTE' });
  };


  // ✅ Relatório completo do cliente
  const gerarRelatorioCompleto = () => {
    if (!clienteFiltro) return showToast('Selecione um cliente primeiro!', 'warning');
    if (pedidos.length === 0) return showToast('Nenhum pedido encontrado', 'warning');

    const data = new Date().toLocaleString('pt-BR');
    const clienteNome = clientes.find(c => c._id === clienteFiltro)?.nome || 'Cliente';

    const totaisRel = {
      bruto: pedidos.reduce((s, p) => s + (parseFloat(p.total) || 0), 0),
      pago: pedidos.reduce((s, p) => s + somarPagamentos(p.pagamentos), 0),
      aberto: pedidos.reduce((s, p) => {
        const st = String(p.status || '').toLowerCase();
        if (st === 'pago' || st === 'cancelado') return s;
        const tp = somarPagamentos(p.pagamentos);
        return s + Math.max(0, parseFloat(p.total) - tp);
      }, 0)
    };

    const pedidosHtml = pedidos.map(p => {
      const totalPago = somarPagamentos(p.pagamentos);
      const falta = Math.max(0, parseFloat(p.total) - totalPago);

      return `
        <div style="border-bottom: 1px dashed #000; padding: 6px 0;">
          <div style="display:flex; justify-content:space-between; font-weight:bold;">
            <span>#${textoSeguro(p.numero)} - ${textoSeguro(p.clienteNome)}</span>
            <span>R$ ${parseFloat(p.total).toFixed(2).replace('.',',')}</span>
          </div>
          <div style="font-size:10px;">
            Status: ${textoSeguro(statusCor[p.status]?.label || p.status)} |
            ${falta > 0 ? `Falta: R$ ${falta.toFixed(2).replace('.',',')}` : 'Quitado'}
          </div>
        </div>
      `;
    }).join('');

    const relatorio = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Relatório Completo - ${textoSeguro(clienteNome)}</title>
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
        <div><span class="bold">Cliente:</span> ${textoSeguro(clienteNome)}</div>
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
          <h1>📊 Contas a Receber</h1>
          <p>Acerto de pendências por cliente</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {[['pedidos', '📄 Pedidos'], ['comandas', '🧾 Comandas em aberto']].map(([chave, label]) => (
              <button key={chave} type="button" onClick={() => setAba(chave)} style={{
                padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                border: aba === chave ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                background: aba === chave ? 'var(--accent-light)' : 'var(--bg-tertiary)',
                color: aba === chave ? 'var(--accent-primary)' : 'var(--text-secondary)',
              }}>{label}</button>
            ))}
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
            <option value="abertas">Todos em A Receber</option>
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
              {carregando ? '⏳ Carregando...' : `R$ ${Number(totaisExibidos?.emAberto ?? 0).toFixed(2).replace('.', ',')}`}
            </div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>
              {carregando ? 'Aguardando dados...' : `Bruto: R$ ${Number(totaisExibidos?.bruto ?? 0).toFixed(2).replace('.', ',')} | Pago: R$ ${Number(totaisExibidos?.pago ?? 0).toFixed(2).replace('.', ',')}`}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* ✅ Selecionar Todos */}
            {aba === 'pedidos' && pedidos.length > 0 && (
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
              {aba === 'pedidos' && (
                <button onClick={abrirReceberMarcados} style={{
                    padding: '6px 12px', background: 'var(--brand-cream)', color: 'var(--brand-brown)',
                  border: 'none', borderRadius: 8,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer'
                }}>💰 Receber Marcados ({selecionados.size})</button>
              )}
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
            {aba === 'pedidos' && selecionados.size > 0 && (
              <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>
                Valor selecionado: <strong>R$ {valorTotalSelecionados.toFixed(2).replace('.',',')}</strong>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* LISTA DE COMANDAS EM ABERTO */}
      {aba === 'comandas' && (
        comandasAbertas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12 }}>
            Nenhuma comanda com saldo em aberto
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {comandasAbertas.map((comanda) => {
              const info = statusPagamentoInfo(comanda.statusPagamento);
              const valorTotal = Number(comanda.valorTotal || 0);
              const recebido = somarPagamentos(comanda.historicoPagamentos);
              const saldo = saldoDevedor(valorTotal, comanda.historicoPagamentos);
              const pagamentos = normalizarPagamentos(comanda.historicoPagamentos);
              return (
                <div key={comanda._id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <strong>
                        {comanda.tipoAtendimento === 'balcao' ? '📦' : '🪑'} Comanda #{comanda.numero}
                      </strong>
                      <span style={{ marginLeft: 8, ...(() => ({ background: info.bg, color: info.txt }))(), padding: '1px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>{info.label}</span>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                        {comanda.clienteNome || 'Consumidor'} · {dataBR(comanda.dataAbertura)} · {comanda.itens?.length || 0} itens
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent-primary)' }}>
                        R$ {saldo.toFixed(2).replace('.', ',')}
                      </div>
                      <small style={{ color: 'var(--text-secondary)' }}>Total R$ {valorTotal.toFixed(2).replace('.', ',')}</small>
                    </div>
                  </div>

                  {recebido > 0 && (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                        Já recebido R$ {recebido.toFixed(2).replace('.', ',')} ({pagamentos.length}x)
                      </summary>
                      <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                        {pagamentos.map((pagamento, indice) => (
                          <small key={indice} style={{ color: 'var(--text-secondary)' }}>
                            {dataBR(pagamento.data)} · {rotuloPagamento(pagamento.tipo)} · <strong>R$ {Number(pagamento.valor || 0).toFixed(2).replace('.', ',')}</strong>
                            {pagamento.observacao ? ` · ${pagamento.observacao}` : ''}
                          </small>
                        ))}
                      </div>
                    </details>
                  )}

                  <button onClick={() => abrirReceberComanda(comanda)} style={{
                    marginTop: 12, padding: '8px 14px', border: 'none', borderRadius: 8,
                    background: 'var(--brand-cream)', color: 'var(--brand-brown)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer'
                  }}>💰 Receber</button>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* LISTA DE PEDIDOS */}
      {aba === 'pedidos' && (pedidos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12 }}>
          {carregando ? 'Carregando pedidos...' : 'Nenhum pedido encontrado'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {pedidos.map(pedido => {
            const st = statusCor[pedido.status];
            const totalPago = somarPagamentos(pedido.pagamentos);
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
                        {' • '}{rotuloPagamento(pg.tipo)}
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
                        onClick={() => abrirNovoPedido(pedido)}
                        style={{
                          flex: '1 1 180px',
                          padding: '10px 8px', background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8,
                          fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          whiteSpace: 'nowrap', minHeight: 42, boxSizing: 'border-box'
                        }}
                      >{pedido.comandaId ? '➕ Novo pedido' : '🔗 Vincular comanda'}</button>
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
      ))}

      {/* MODAL DE RECEBIMENTO DE COMANDA */}
      {formComanda && (
        <div onClick={() => { if (!recebendoRef.current) setFormComanda(null); }} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <form onSubmit={registrarRecebimentoComanda} onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-primary)', borderRadius: 16, padding: 20, width: '100%',
            maxWidth: 440, boxShadow: 'var(--shadow-lg)'
          }}>
            <h3 style={{ margin: 0 }}>💰 Receber comanda #{formComanda.comanda.numero}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 14px' }}>
              Total R$ {Number(formComanda.comanda.valorTotal || 0).toFixed(2).replace('.', ',')} · já recebido R$ {somarPagamentos(formComanda.comanda.historicoPagamentos).toFixed(2).replace('.', ',')} · saldo R$ {saldoDevedor(formComanda.comanda.valorTotal, formComanda.comanda.historicoPagamentos).toFixed(2).replace('.', ',')}
            </p>

            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Forma de pagamento</label>
            <select disabled={recebendo} value={formComanda.formaPagamento} onChange={e => setFormComanda(f => ({ ...f, formaPagamento: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border-color)', marginBottom: 12, boxSizing: 'border-box' }}>
              {FORMAS_PAGAMENTO.filter((forma) => forma.value !== 'credito_loja').map((forma) => <option key={forma.value} value={forma.value}>{forma.label}</option>)}
            </select>
            <small style={{ display: 'block', margin: '-8px 0 12px', color: 'var(--text-secondary)' }}>Crédito na loja não entra como recebimento: aqui só entra dinheiro de verdade.</small>

            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Valor recebido (R$)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input disabled={recebendo}
                type="text" inputMode="decimal" autoComplete="off"
                placeholder="0,00"
                value={formComanda.valor}
                onChange={e => digitarValorComanda(e.target.value)}
                style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid var(--border-color)', boxSizing: 'border-box' }}
              />
              <button type="button" onClick={() => digitarValorComanda(saldoDevedor(formComanda.comanda.valorTotal, formComanda.comanda.historicoPagamentos).toFixed(2))} style={{ padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Saldo total</button>
            </div>
            <small style={{ display: 'block', margin: '6px 0 12px', color: 'var(--text-secondary)' }}>
              Máximo: R$ {saldoDevedor(formComanda.comanda.valorTotal, formComanda.comanda.historicoPagamentos).toFixed(2).replace('.', ',')}. Deixe abaixo do saldo para um pagamento parcial.
            </small>

            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Observação</label>
            <input disabled={recebendo} value={formComanda.observacao} onChange={e => setFormComanda(f => ({ ...f, observacao: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border-color)', marginBottom: 16, boxSizing: 'border-box' }} />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { if (!recebendoRef.current) setFormComanda(null); }} style={{ padding: '9px 16px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancelar</button>
              <button type="submit" disabled={recebendo} style={{ padding: '9px 16px', border: 'none', borderRadius: 8, background: 'var(--success-bg)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Confirmar recebimento</button>
            </div>
          </form>
        </div>
      )}

      {/* ✅ MODAL DE RECEBIMENTO MÚLTIPLO (para marcados) */}
      {pagamentoMultiploModal && (
        <div onClick={() => { if (!recebendoRef.current) setPagamentoMultiploModal(null); }} style={{
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
              <select disabled={recebendo} value={formPagamentoMultiplo.tipo} onChange={e => setFormPagamentoMultiplo({...formPagamentoMultiplo, tipo: e.target.value})} style={{
                width: '100%', padding: 10, border: '1px solid var(--border-color)', borderRadius: 10
              }}>
                <option value="dinheiro">💵 Dinheiro</option>
                <option value="pix">🔄 PIX</option>
                <option value="cartao_credito">💳 Cartão de Crédito</option>
                <option value="cartao_debito">💳 Cartão de Débito</option>
              </select>
            </div>


            <div style={{ marginBottom: 16 }}>
              <input disabled={recebendo} type="text" placeholder="Ex: Pagamento em lote"
                value={formPagamentoMultiplo.observacao}
                onChange={e => setFormPagamentoMultiplo({...formPagamentoMultiplo, observacao: e.target.value})}
                style={{ width: '100%', padding: 10, border: '1px solid var(--border-color)', borderRadius: 10 }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { if (!recebendoRef.current) setPagamentoMultiploModal(null); }} style={{
                flex: 1, padding: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 10, fontWeight: 600, cursor: 'pointer'
              }}>Cancelar</button>
              <button disabled={recebendo} onClick={registrarPagamentoMultiplo} style={{
                flex: 1, padding: 12, background: 'var(--success-bg)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer'
              }}>✅ Receber Tudo</button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ MODAL DE RECEBIMENTO INDIVIDUAL */}
      {pagamentoModal && (
        <div onClick={() => { if (!recebendoRef.current) setPagamentoModal(null); }} style={{
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
              <select disabled={recebendo} value={formPagamento.tipo} onChange={e => setFormPagamento({...formPagamento, tipo: e.target.value})} style={{
                width: '100%', padding: 10, border: '1px solid var(--border-color)', borderRadius: 10
              }}>
                <option value="dinheiro">💵 Dinheiro</option>
                <option value="pix">🔄 PIX</option>
                <option value="cartao_credito">💳 Cartão de Crédito</option>
                <option value="cartao_debito">💳 Cartão de Débito</option>
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Valor a pagar (R$)</label>
              <input disabled={recebendo} type="number" min="0.01" max={saldoPagamentoIndividual} step="0.01" autoFocus
                value={formPagamento.valorRecebido}
                onChange={event => setFormPagamento({ ...formPagamento, valorRecebido: event.target.value })}
                style={{ width: '100%', padding: 10, border: '1px solid var(--border-color)', borderRadius: 10, fontSize: 16, background: 'var(--bg-tertiary)', fontWeight: 700 }} />
              <small style={{ display: 'block', marginTop: 5, color: 'var(--text-secondary)' }}>Saldo pendente: R$ {saldoPagamentoIndividual.toFixed(2)}</small>
            </div>

            <div style={{ marginBottom: 16 }}>
              <input disabled={recebendo} type="text" placeholder="Ex: Pagamento parcial"
                value={formPagamento.observacao}
                onChange={e => setFormPagamento({...formPagamento, observacao: e.target.value})}
                style={{ width: '100%', padding: 10, border: '1px solid var(--border-color)', borderRadius: 10 }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { if (!recebendoRef.current) setPagamentoModal(null); }} style={{
                flex: 1, padding: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 10, fontWeight: 600, cursor: 'pointer'
              }}>Cancelar</button>
              <button disabled={recebendo} onClick={registrarPagamento} style={{
                flex: 1, padding: 12, background: 'var(--success-bg)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer'
              }}>Pagar</button>
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
              <label className="novo-pedido-field">Produto<select disabled={recebendo} value={novoPedidoForm.produtoId} onChange={event => setNovoPedidoForm({ ...novoPedidoForm, produtoId: event.target.value, quantidade: '1' })}><option value="">Selecione um produto</option>{produtos.map(produto => <option key={produto._id} value={produto._id}>{produto.nome}</option>)}</select></label>
              <label className="novo-pedido-field novo-pedido-quantity">Quantidade<input disabled={recebendo} type="number" min={passoQuantidadeNovoPedido} step={passoQuantidadeNovoPedido} value={novoPedidoForm.quantidade} onChange={event => setNovoPedidoForm({ ...novoPedidoForm, quantidade: event.target.value })} /></label>
              <button type="button" className="novo-pedido-add" onClick={adicionarItemNovoPedido}>Adicionar produto</button>
            </div>
            {novoPedidoForm.itens.length > 0 && <div className="novo-pedido-items">{novoPedidoForm.itens.map((item, index) => <div className="novo-pedido-item" key={`${item.produtoId}-${index}`}><span><strong>{item.quantidade}x</strong> {item.nome}</span><button type="button" onClick={() => setNovoPedidoForm({ ...novoPedidoForm, itens: novoPedidoForm.itens.filter((_, itemIndex) => itemIndex !== index) })}>Remover</button></div>)}</div>}
            <label style={{ display: 'block', marginBottom: 12, fontSize: 12, fontWeight: 700 }}>Nome de quem está fazendo o novo pedido<input disabled={recebendo} value={novoPedidoForm.nomeSolicitante} onChange={event => setNovoPedidoForm({ ...novoPedidoForm, nomeSolicitante: event.target.value })} placeholder="Ex.: Maria" style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 10, marginTop: 4, border: '1px solid var(--border-color)', borderRadius: 10 }} /></label>
            <label style={{ display: 'block', marginBottom: 16, fontSize: 12, fontWeight: 700 }}>Observação do novo pedido<textarea value={novoPedidoForm.observacao} onChange={event => setNovoPedidoForm({ ...novoPedidoForm, observacao: event.target.value })} placeholder="Ex.: café e salgado para Maria" rows="3" style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 10, marginTop: 4, border: '1px solid var(--border-color)', borderRadius: 10, resize: 'vertical' }} /></label>
            <div style={{ display: 'flex', gap: 10 }}><button onClick={() => setNovoPedidoModal(null)} style={{ flex: 1, padding: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button><button onClick={adicionarItensAoPedido} style={{ flex: 1, padding: 12, background: 'var(--success-bg)', color: '#fff', border: 0, borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Confirmar novo pedido</button></div>
          </div>
        </div>
      )}

      <PagamentoResultadoModal
        pedido={pagamentoConcluido}
        titulo={pagamentoConcluido?.status === 'parcial' ? 'Pagamento parcial registrado' : 'Pagamento concluído'}
        onPrint={() => pagamentoConcluido?.status === 'pago' ? imprimirComprovante(pagamentoConcluido) : imprimirPedido(pagamentoConcluido)}
        onWhatsApp={() => enviarWhatsApp(pagamentoConcluido)}
        onClose={() => setPagamentoConcluido(null)}
      />

      {quitarClienteModal && (
        <div onClick={() => { if (!recebendoRef.current) setQuitarClienteModal(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 20 }}>
          <div onClick={event => event.stopPropagation()} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380 }}>
            <h3 style={{ margin: '0 0 8px' }}>✅ Quitar total do cliente</h3>
            <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)' }}>Todas as pendências do cliente selecionado serão quitadas.</p>
            <label style={{ display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 700 }}>Forma de pagamento</label>
            <select disabled={recebendo} value={formPagamentoMultiplo.tipo} onChange={event => setFormPagamentoMultiplo({ ...formPagamentoMultiplo, tipo: event.target.value })} style={{ width: '100%', padding: 10, border: '1px solid var(--border-color)', borderRadius: 10, marginBottom: 16 }}>
              <option value="dinheiro">💵 Dinheiro</option>
              <option value="pix">🔄 PIX</option>
              <option value="cartao_credito">💳 Cartão de Crédito</option>
              <option value="cartao_debito">💳 Cartão de Débito</option>
            </select>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { if (!recebendoRef.current) setQuitarClienteModal(false); }} style={{ flex: 1, padding: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button disabled={recebendo} onClick={confirmarQuitacaoCliente} style={{ flex: 1, padding: 12, background: 'var(--success-bg)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Quitar tudo</button>
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
