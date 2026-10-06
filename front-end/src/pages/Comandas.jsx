import { criarOperacoesFinanceiras } from '../utils/operacaoFinanceira';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api.jsx';
import { permiteFracionar } from '../utils/quantidadeVenda.js';
import { useToast } from '../components/useToast.js';
import { compartilharNotaWhatsApp } from '../utils/notaVenda.js';
import { FORMAS_PAGAMENTO, dataBR, normalizarPagamentos, rotuloPagamento, saldoDevedor, statusPagamentoInfo, totalPago } from '../utils/formasPagamento.jsx';
import {
  carregarConfiguracaoImpressao,
  carregarPreferenciaImpressora,
  imprimirCupomVenda,
  imprimirNFCeDanfe,
  imprimirPedidoCozinha,
} from '../services/impressaoService.js';

const formatMoney = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const formatQuantity = (item) => {
  if (item.tipoVenda === 'peso') return `${Number(item.pesoVendidoKg || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg vendidos`;
  const quantidade = Number(item.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  if (Number(item.pesoPorUnidade) > 0) {
    const peso = Number(item.pesoPorUnidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    return `${quantidade} unidade(s) · ${peso} ${item.unidadePeso || 'kg'} cada`;
  }
  return `${quantidade} ${item.unidadeVenda || 'un'}`;
};
const produtoPorPeso = (product) => Number(product?.pesoPorUnidade) > 0 && product?.unidadeVenda === 'kg';

async function enviarWhatsApp(pedido, comanda, telefone) {
  if (!pedido) return;
  await compartilharNotaWhatsApp(pedido, { comandaNumero: comanda?.numero }, telefone);
}

// ─── componente principal ─────────────────────────────────────────────────────

export default function Comandas() {
  const [comandas, setComandas] = useState([]);
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [modalMoverComanda, setModalMoverComanda] = useState(null);
  const [newCommand, setNewCommand] = useState({ clienteNome: '', observacao: '' });
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [tipoVenda, setTipoVenda] = useState('inteiro');
  const [pesoVendidoKg, setPesoVendidoKg] = useState('');
  const [adicionandoItem, setAdicionandoItem] = useState(false);
  const [itensEmAtualizacao, setItensEmAtualizacao] = useState(() => new Set());
  const [quantidadesRascunho, setQuantidadesRascunho] = useState({});
  const operacoesItemRef = useRef(new Set());
  const adicionandoItemRef = useRef(false);

  const [configuracaoMesas, setConfiguracaoMesas] = useState({ mesas: [], oferecerBalcao: true });
  const mesasAtivas = configuracaoMesas.mesas.filter((mesa) => mesa.ativa);
  const numerosMesasAtivas = mesasAtivas.map((mesa) => mesa.numero);
  const todasMesasOcupadas = mesasAtivas.length > 0 && numerosMesasAtivas.every((mesa) => comandas.some((comanda) => comanda.tipoAtendimento !== 'balcao' && String(comanda.mesa || '') === String(mesa)));

  // modal de fechamento
  const [modalFechamento, setModalFechamento] = useState(false);
  const operacoesFechamentoRef = useRef(null);
  if (operacoesFechamentoRef.current === null) { operacoesFechamentoRef.current = criarOperacoesFinanceiras(api); }
  const fechandoRef = useRef(false);
  const [fechando, setFechando] = useState(false);
  useEffect(() => {
    if (!modalFechamento) operacoesFechamentoRef.current.limpar();
  }, [modalFechamento]);
  const [discount, setDiscount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [utilizacaoInterna, setUtilizacaoInterna] = useState(false);
  const [paymentError, setPaymentError] = useState(false);
  const [telefoneModal, setTelefoneModal] = useState('');
  const [nomeModal, setNomeModal] = useState('');
  const [mobileView, setMobileView] = useState('list');

  // modal de sucesso pós-fechamento
  const [modalSucesso, setModalSucesso] = useState(null); // { pedido, comanda, telefone, nome }
  const [nfceLoading, setNfceLoading] = useState(false);

  const { showToast } = useToast();

  const opcoesImpressao = (config) => ({
    ...config,
    empresa: config.empresa,
    categoriasPorProduto: Object.fromEntries(products.map((product) => [String(product._id), product.categoria])),
    onFallback: (message) => showToast(message, 'warning'),
  });

  const imprimirCupom = async (pedido, comanda) => {
    if (!pedido) return;
    try {
      const config = carregarConfiguracaoImpressao();
      await imprimirCupomVenda({ ...pedido, comandaNumero: comanda?.numero }, opcoesImpressao(config));
      showToast('Cupom enviado para impressão.', 'success');
    } catch (error) {
      showToast(error.message || 'Impressão pendente. A venda foi concluída; tente reimprimir.', 'warning');
    }
  };

  const imprimirVendaAutomaticamente = async (pedido, comanda) => {
    let config;
    try {
      config = carregarConfiguracaoImpressao();
      if (!carregarPreferenciaImpressora()) return;
    } catch (error) {
      showToast(`Venda concluída, mas as configurações da impressora não foram lidas: ${error.message}`, 'warning');
      return;
    }
    const options = opcoesImpressao(config);
    if (config.imprimirCupomAutomaticamente) {
      try {
        await imprimirCupomVenda({ ...pedido, comandaNumero: comanda?.numero }, options);
      } catch (error) {
        showToast('Impressora offline — venda concluída, reimprima no menu. ' + (error.message || ''), 'warning');
      }
    }
    if (config.imprimirCozinhaAutomaticamente) {
      try {
        const kitchenOrder = {
          ...pedido,
          tipoAtendimento: comanda?.tipoAtendimento,
          mesa: comanda?.mesa,
          numero: comanda?.numero || pedido.numero,
        };
        await imprimirPedidoCozinha(kitchenOrder, options);
      } catch (error) {
        showToast('Impressora offline — venda concluída, pedido da cozinha pendente para reimpressão. ' + (error.message || ''), 'warning');
      }
    }
  };

  const load = useCallback(async () => {
    try {
      const [commands, catalog, tables] = await Promise.all([api.get('/comandas?status=aberta'), api.get('/products'), api.get('/mesas')]);
      setConfiguracaoMesas(tables.data);
      setComandas(commands.data);
      setProducts(catalog.data);
      setSelected((current) => commands.data.find((c) => c._id === current?._id) || commands.data[0] || null);
    } catch { showToast('Não foi possível carregar as comandas', 'error'); }
  }, [showToast]);
  useEffect(() => {
    const inicializar = async () => { await load(); };
    inicializar();
  }, [load]);

  const subtotal = useMemo(() => (selected?.itens || []).reduce((sum, item) => sum + item.precoUnitario * item.quantidade, 0), [selected]);
  const total = utilizacaoInterna ? 0 : Math.max(0, subtotal + Number(selected?.taxaEntrega || 0) - (Number(discount) || 0));
  const jaRecebido = useMemo(() => totalPago(selected?.historicoPagamentos), [selected]);
  const saldoEmAberto = Math.max(0, total - jaRecebido);

  const create = async (event) => {
    event.preventDefault();
    try {
      const { data } = await api.post('/comandas', { ...newCommand, tipoAtendimento: 'mesa' });
      setNewCommand({ clienteNome: '', observacao: '' }); setSelected(data); setMobileView('detail'); showToast('Comanda aberta', 'success'); load();
    } catch (error) { showToast(error.response?.data?.msg || 'Erro ao abrir comanda', 'error'); }
  };

  const createBalcao = async () => {
    try {
      const { data } = await api.post('/comandas', { tipoAtendimento: 'balcao', clienteNome: newCommand.clienteNome || undefined, observacao: newCommand.observacao || undefined });
      setNewCommand({ clienteNome: '', observacao: '' });
      setSelected(data);
      setMobileView('detail');
      showToast(`Pedido de balcão #${data.numero} criado`, 'success');
      load();
    } catch (error) { showToast(error.response?.data?.msg || 'Erro ao abrir pedido de balcão', 'error'); }
  };

  const createMesa = async (mesa) => {
    const existente = comandas.find((comanda) => comanda.tipoAtendimento !== 'balcao' && String(comanda.mesa || '') === String(mesa));
    if (existente) { setSelected(existente); setMobileView('detail'); return; }
    try {
      const { data } = await api.post('/comandas', { tipoAtendimento: 'mesa', mesa, clienteNome: 'Mesa ' + mesa });
      setSelected(data); setMobileView('detail'); showToast(`Mesa ${mesa} aberta`, 'success'); load();
    } catch (error) { showToast(error.response?.data?.msg || 'Erro ao abrir mesa', 'error'); }
  };

  const updateBalcaoStatus = async (status) => {
    if (!selected || selected.tipoAtendimento !== 'balcao') return;
    try { await api.patch(`/comandas/${selected._id}/balcao/status`, { status }); await load(); showToast(`Balcão: ${status}`, 'success'); }
    catch (error) { showToast(error.response?.data?.msg || 'Não foi possível atualizar o balcão', 'error'); }
  };

  const produtoSelecionado = products.find((product) => product._id === productId);

  const atualizarComandaLocal = (comanda) => {
    setSelected((atual) => atual?._id === comanda._id ? comanda : atual);
    setComandas((atuais) => atuais.map((item) => item._id === comanda._id ? comanda : item));
  };

  const marcarItemEmAtualizacao = (itemId, ocupado) => {
    setItensEmAtualizacao((atuais) => {
      const proximos = new Set(atuais);
      if (ocupado) proximos.add(itemId);
      else proximos.delete(itemId);
      return proximos;
    });
  };

  const addItem = async (event) => {
    event.preventDefault();
    if (!selected || !productId || adicionandoItemRef.current) return;
    adicionandoItemRef.current = true;
    setAdicionandoItem(true);
    try {
      const { data } = await api.post(`/comandas/${selected._id}/itens`, { produtoId: productId, quantidade: Number(quantity), tipoVenda: produtoPorPeso(produtoSelecionado) ? tipoVenda : 'unidade', pesoVendidoKg: tipoVenda === 'peso' ? Number(pesoVendidoKg) : undefined });
      atualizarComandaLocal(data);
      setProductId(''); setQuantity('1'); setTipoVenda('inteiro'); setPesoVendidoKg('');
    }
    catch (error) { showToast(error.response?.data?.msg || 'Erro ao adicionar item', 'error'); }
    finally { adicionandoItemRef.current = false; setAdicionandoItem(false); }
  };

  const removeItem = async (itemId) => {
    if (!selected || operacoesItemRef.current.has(itemId)) return;
    operacoesItemRef.current.add(itemId);
    marcarItemEmAtualizacao(itemId, true);
    try {
      const { data } = await api.delete(`/comandas/${selected._id}/itens/${itemId}`);
      atualizarComandaLocal(data);
      setSelectedItemIds((atuais) => atuais.filter((id) => id !== itemId));
      setQuantidadesRascunho((atuais) => { const proximas = { ...atuais }; delete proximas[itemId]; return proximas; });
    } catch (error) {
      showToast(error.response?.data?.msg || 'Erro ao remover item', 'error');
    } finally {
      operacoesItemRef.current.delete(itemId);
      marcarItemEmAtualizacao(itemId, false);
    }
  };

  const atualizarQuantidadeItem = async (itemId, valor) => {
    if (!selected) return;
    const quantidade = Number(valor);
    const itemAtual = selected.itens.find((item) => item._id === itemId);
    if (!Number.isFinite(quantidade) || quantidade < 0.001) {
      setQuantidadesRascunho((atuais) => { const proximas = { ...atuais }; delete proximas[itemId]; return proximas; });
      if (itemAtual) showToast('Informe uma quantidade válida', 'warning');
      return;
    }
    if (operacoesItemRef.current.has(itemId)) return;
    if (!itemAtual || quantidade === Number(itemAtual.quantidade)) {
      setQuantidadesRascunho((atuais) => { const proximas = { ...atuais }; delete proximas[itemId]; return proximas; });
      return;
    }
    const quantidadeAnterior = Number(itemAtual.quantidade);
    operacoesItemRef.current.add(itemId);
    marcarItemEmAtualizacao(itemId, true);
    setSelected((atual) => atual?._id === selected._id ? { ...atual, itens: atual.itens.map((item) => item._id === itemId ? { ...item, quantidade } : item) } : atual);
    setQuantidadesRascunho((atuais) => { const proximas = { ...atuais }; delete proximas[itemId]; return proximas; });
    try {
      const { data } = await api.patch(`/comandas/${selected._id}/itens/${itemId}`, { quantidade });
      atualizarComandaLocal(data);
    } catch (error) {
      setSelected((atual) => atual?._id === selected._id ? { ...atual, itens: atual.itens.map((item) => item._id === itemId ? { ...item, quantidade: quantidadeAnterior } : item) } : atual);
      showToast(error.response?.data?.msg || 'Erro ao atualizar quantidade', 'error');
    } finally {
      operacoesItemRef.current.delete(itemId);
      marcarItemEmAtualizacao(itemId, false);
    }
  };

  const toggleItemSelection = (itemId) => {
    setSelectedItemIds((current) => current.includes(itemId)
      ? current.filter((id) => id !== itemId)
      : [...current, itemId]);
  };

  const moverParaNovaComanda = async () => {
    if (!selected || !selectedItemIds.length) {
      showToast('Selecione ao menos um item para mover', 'warning');
      return;
    }

    setModalMoverComanda({
      origem: selected.numero,
      quantidade: selectedItemIds.length,
      clienteNome: selected.clienteNome || '',
      observacao: selected.observacao || '',
    });
  };

  const confirmarMovimentoParaNovaComanda = async () => {
    if (!selected || !selectedItemIds.length) return;

    try {
      const { data } = await api.post(`/comandas/${selected._id}/mover`, {
        itemIds: selectedItemIds,
        clienteNome: modalMoverComanda?.clienteNome || selected.clienteNome,
        observacao: modalMoverComanda?.observacao || selected.observacao,
      });
      setSelectedItemIds([]);
      setModalMoverComanda(null);
      await load();
      setSelected(data.novaComanda);
      setMobileView('detail');
      showToast(`Itens movidos para a comanda #${data.novaComanda.numero}`, 'success');
    } catch (error) {
      setModalMoverComanda(null);
      showToast(error.response?.data?.msg || 'Erro ao mover itens', 'error');
    }
  };

  const cancel = async () => {
    if (!selected || !window.confirm(`Cancelar a comanda #${selected.numero}?`)) return;
    try { await api.patch(`/comandas/${selected._id}/cancelar`); showToast('Comanda cancelada', 'warning'); load(); }
    catch (error) { showToast(error.response?.data?.msg || 'Erro ao cancelar comanda', 'error'); }
  };

  const abrirModalFechamento = () => {
    if (!selected) return;
    if (!selected.itens.length) { showToast('A comanda não tem itens', 'warning'); return; }
    setDiscount('0');
    setPaymentMethod('');
    setUtilizacaoInterna(false);
    setPaymentError(false);
    setTelefoneModal('');
    setNomeModal(selected.clienteNome || '');
    setModalFechamento(true);
  };


  const confirmarFechamento = async () => {
    if (!utilizacaoInterna && !paymentMethod) { setPaymentError(true); showToast('Escolha a forma de pagamento', 'warning'); return; }
    if (fechandoRef.current) return;
    fechandoRef.current = true;
    setFechando(true);
    const comandaFechada = selected;
    try {
      const { data } = await operacoesFechamentoRef.current.enviar('post', `/comandas/${selected._id}/fechar`, {
        desconto: Number(discount),
        metodoPagamento: utilizacaoInterna ? 'credito_loja' : paymentMethod,
        utilizacaoInterna,
        telefone: telefoneModal,
        nome: nomeModal,
      });
      setModalFechamento(false);
      setDiscount('0'); setPaymentMethod(''); setUtilizacaoInterna(false); setPaymentError(false);
      setModalSucesso({ pedido: data.pedido, comanda: comandaFechada, telefone: telefoneModal, nome: nomeModal });
      showToast(`Comanda #${comandaFechada.numero} fechada → Pedido #${data.pedido.numero}`, 'success');
      void imprimirVendaAutomaticamente(data.pedido, comandaFechada);
      load();
    } catch (error) { showToast(error.response?.data?.msg || error.message || 'Erro ao registrar pagamento', 'error'); }
    finally { fechandoRef.current = false; setFechando(false); }
  };

  const enviarComprovante = async () => {
    if (modalSucesso?.telefone) {
      try {
        await api.patch(`/comandas/${modalSucesso.comanda._id}/cliente`, { telefone: modalSucesso.telefone, nome: modalSucesso.nome });
      } catch { /* mantém o envio do comprovante mesmo se o cadastro falhar */ }
    }
    await enviarWhatsApp(modalSucesso.pedido, modalSucesso.comanda, modalSucesso.telefone);
  };

  const emitirNfce = async () => {
    if (!modalSucesso?.pedido?._id || nfceLoading) return;
    setNfceLoading(true);
    try {
      const { data } = await api.post(`/fiscal/orders/${modalSucesso.pedido._id}/emitir`);
      setModalSucesso((atual) => ({ ...atual, pedido: data.order || atual.pedido }));
      showToast(data.avisos?.length ? `NFC-e autorizada com avisos: ${data.avisos.join('; ')}` : 'NFC-e autorizada', data.avisos?.length ? 'warning' : 'success');
    } catch (error) {
      const nfce = error.response?.data?.nfce;
      if (nfce) setModalSucesso((atual) => ({ ...atual, pedido: { ...atual.pedido, nfce } }));
      const faltantes = error.response?.data?.faltantes || [];
      const mensagem = error.response?.data?.msg || 'Não foi possível emitir a NFC-e';
      showToast(faltantes.length ? `${mensagem}: ${faltantes.join(', ')}` : mensagem, error.response?.status === 409 ? 'warning' : 'error');
    } finally {
      setNfceLoading(false);
    }
  };

  const abrirDanfe = () => {
    const pdf = modalSucesso?.pedido?.nfce?.danfePdf;
    if (pdf) window.open(`data:application/pdf;base64,${pdf}`, '_blank', 'noopener,noreferrer');
  };

  const imprimirDanfe = async () => {
    const nfce = modalSucesso?.pedido?.nfce;
    if (!nfce) return;
    try {
      await imprimirNFCeDanfe({
        nfce,
        pdf: nfce.danfePdf ? `data:application/pdf;base64,${nfce.danfePdf}` : undefined,
      }, opcoesImpressao(carregarConfiguracaoImpressao()));
      showToast('DANFE enviado para impressão.', 'success');
    } catch (error) {
      showToast(error.message || 'Não foi possível imprimir o DANFE.', 'warning');
    }
  };

  const reimprimirCozinha = async () => {
    if (!modalSucesso?.pedido) return;
    try {
      const comanda = modalSucesso.comanda;
      await imprimirPedidoCozinha({
        ...modalSucesso.pedido,
        tipoAtendimento: comanda?.tipoAtendimento,
        mesa: comanda?.mesa,
        numero: comanda?.numero || modalSucesso.pedido.numero,
      }, opcoesImpressao(carregarConfiguracaoImpressao()));
      showToast('Pedido de cozinha enviado para impressão.', 'success');
    } catch (error) {
      showToast(error.message || 'Pedido de cozinha pendente para reimpressão.', 'warning');
    }
  };

  return (
    <div className="comandas-page">
      <div className="page-heading"><div><h1>🪑 Mesas / Comandas</h1><p>Abra comandas, lance consumos e feche no caixa.</p></div></div>
      <section className="service-mode-panel"><div className="service-mode-heading"><h2>🪑 Mesas ({mesasAtivas.length})</h2><span>Escolha a mesa ou prossiga em balcão quando todas estiverem ocupadas</span></div><div className="table-shortcuts">{mesasAtivas.map((configuracaoMesa) => { const mesa = configuracaoMesa.numero; const aberta = comandas.find((comanda) => comanda.tipoAtendimento !== 'balcao' && String(comanda.mesa || '') === String(mesa)); return <button type="button" key={mesa} className={aberta ? 'table-shortcut occupied' : 'table-shortcut'} onClick={() => createMesa(mesa)}><strong>{configuracaoMesa.nome || mesa}</strong><span>{aberta ? '🟡 Ocupada' : '🟢 Livre'}</span></button>; })}</div><div className="counter-service"><div><strong>📦 Pague e leve — Balcão</strong><span>{comandas.filter((comanda) => comanda.tipoAtendimento === 'balcao').length} pedidos em andamento</span></div>{todasMesasOcupadas && configuracaoMesas.oferecerBalcao && <div style={{ fontSize: 12, color: 'var(--warning-bg)', fontWeight: 700, marginTop: 6 }}>⚠️ Todas as mesas estão em uso. Prosseguir em balcão.</div>}<button type="button" className="comandas-primary-button" onClick={createBalcao}>➕ Novo Pedido</button></div></section>
      <form onSubmit={create} className="comandas-open-form">
        <input className="comandas-field" placeholder="Nome do cliente" value={newCommand.clienteNome} onChange={(e) => setNewCommand({ ...newCommand, clienteNome: e.target.value })} />
        <input className="comandas-field" placeholder="Observação" value={newCommand.observacao} onChange={(e) => setNewCommand({ ...newCommand, observacao: e.target.value })} />
        <button type="submit">Abrir mesa</button>
      </form>

      <div className="comandas-columns">
        <section className={`comandas-card comandas-list-card ${mobileView === 'detail' ? 'mobile-hidden' : ''}`}>
          <div className="comandas-card-heading"><div><h2>Em aberto</h2><p>Selecione uma comanda para editar.</p></div><span className="comandas-count">{comandas.length}</span></div>
          <div className="comandas-quick-products"><strong>Lançamento rápido</strong><div>{products.filter((product) => product.categoria !== 'Insumos').slice(0, 8).map((product) => <button key={product._id} type="button" onClick={() => { setProductId(product._id); setQuantity('1'); }} className={productId === product._id ? 'selected' : ''}>{product.nome}</button>)}</div></div>
          {comandas.map((command) => {
            const info = statusPagamentoInfo(command.statusPagamento);
            const saldo = saldoDevedor(command.valorTotal, command.historicoPagamentos);
            return (
              <button className="comanda-select-button" key={command._id} onClick={() => { setSelected(command); setMobileView('detail'); }} style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 8, padding: 12, border: selected?._id === command._id ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)' }}>
                <b>{command.tipoAtendimento === 'balcao' ? '📦' : '🪑'} #{command.numero}</b>
                {command.statusPagamento === 'parcial' && <span className="comanda-status-pill" style={{ background: info.bg, color: info.txt }}>{info.label}</span>}
                <br />
                <small>{command.tipoAtendimento === 'balcao' ? `Balcão · ${command.statusBalcao || 'aguardando'}` : 'Mesa'} · {command.clienteNome} · {command.itens.length} itens</small>
                {saldo > 0 && <small style={{ display: 'block', marginTop: 4, fontWeight: 700 }}>A receber: {formatMoney(saldo)}</small>}
              </button>
            );
          })}
        </section>

        <section className={`comandas-card comandas-detail-card ${mobileView === 'list' ? 'mobile-hidden' : ''}`}>
          {!selected ? <p>Selecione ou abra uma comanda.</p> : <>
            <button type="button" className="comandas-mobile-back" onClick={() => setMobileView('list')}>← Voltar para comandas</button>
            <h2 style={{ marginTop: 0 }}>{selected.tipoAtendimento === 'balcao' ? '📦 Balcão' : '🪑 Mesa'} #{selected.numero} <small style={{ fontWeight: 400, fontSize: 14, color: 'var(--text-secondary)' }}>— {selected.clienteNome}</small></h2>
            {selected.tipoAtendimento === 'balcao' && <div className="balcao-status-bar"><span>Status: <strong>{selected.statusBalcao || 'aguardando'}</strong></span><div>{['aguardando', 'preparando', 'pronto', 'pago', 'entregue'].map((status) => <button type="button" key={status} className={selected.statusBalcao === status ? 'active' : ''} onClick={() => updateBalcaoStatus(status)}>{status}</button>)}</div></div>}
            <form onSubmit={addItem} className="comandas-add-form">
              <select className="comandas-field" required disabled={adicionandoItem} value={productId} onChange={(e) => { setProductId(e.target.value); setTipoVenda('inteiro'); setPesoVendidoKg(''); }}><option value="">Adicionar produto…</option>{products.filter((product) => product.categoria !== 'Insumos').map((product) => <option key={product._id} value={product._id}>{product.nome} — {formatMoney(product.preco)}{produtoPorPeso(product) ? '/kg' : ''}</option>)}</select>
              {produtoPorPeso(produtoSelecionado) && <select className="comandas-field" disabled={adicionandoItem} value={tipoVenda} onChange={(e) => setTipoVenda(e.target.value)}><option value="inteiro">Bolo inteiro</option><option value="peso">Fatia pesada</option></select>}
              {tipoVenda === 'peso' && produtoPorPeso(produtoSelecionado) ? <input className="comandas-field quantity-field" disabled={adicionandoItem} required type="number" min="0.001" step="0.001" placeholder="Peso vendido (kg)" value={pesoVendidoKg} onChange={(e) => setPesoVendidoKg(e.target.value)} /> : <input className="comandas-field quantity-field" disabled={adicionandoItem} required type="number" min={permiteFracionar(produtoSelecionado) ? '0.001' : '1'} step={permiteFracionar(produtoSelecionado) ? '0.001' : '1'} value={quantity} onChange={(e) => setQuantity(e.target.value)} />}
              <button type="submit" disabled={adicionandoItem} className="comandas-secondary-button">{adicionandoItem ? 'Adicionando…' : 'Adicionar'}</button>
            </form>

            {selected.itens.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {selectedItemIds.length > 0 && (
                  <button type="button" onClick={moverParaNovaComanda} className="comandas-secondary-button" style={{ flex: 1, minWidth: 180 }}>
                    📦 Criar nova comanda com {selectedItemIds.length} item{selectedItemIds.length > 1 ? 'ns' : ''}
                  </button>
                )}
                {selectedItemIds.length > 0 && (
                  <button type="button" onClick={() => setSelectedItemIds([])} className="comandas-cancel-button" style={{ flex: 1, minWidth: 140 }}>
                    Limpar seleção
                  </button>
                )}
              </div>
            )}

            {(selected.itens || []).map((item) => {
              const step = item.tipoVenda === 'peso' ? 0.001 : 1;
              const quantidadeExibida = quantidadesRascunho[item._id] ?? item.quantidade;
              const itemOcupado = itensEmAtualizacao.has(item._id);
              return (
                <div key={item._id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--border-color)', padding: '10px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={selectedItemIds.includes(item._id)}
                      onChange={() => toggleItemSelection(item._id)}
                      style={{ marginTop: 5, width: 18, height: 18, accentColor: 'var(--accent-primary)' }}
                      aria-label={`Selecionar ${item.nome}`}
                    />
                    <span>
                      <b>{item.nome}</b><br />
                      <small>{formatQuantity(item)} × {formatMoney(item.precoUnitario)}</small>
                      {item.modificadores?.length > 0 && <><br /><small style={{ color: 'var(--accent-primary)' }}>☕ {item.modificadores.join(' · ')}</small></>}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
                      <button type="button" disabled={itemOcupado} onMouseDown={(event) => event.preventDefault()} onClick={() => atualizarQuantidadeItem(item._id, Math.max(step, Number(quantidadeExibida || 0) - step))} style={{ width: 28, height: 30, border: 0, background: 'transparent', cursor: itemOcupado ? 'wait' : 'pointer', fontWeight: 700, color: 'var(--text-primary)' }}>−</button>
                      <input
                        type="number"
                        min="0.001"
                        step={step}
                        disabled={itemOcupado}
                        value={quantidadeExibida}
                        onChange={(e) => setQuantidadesRascunho((atuais) => ({ ...atuais, [item._id]: e.target.value }))}
                        onBlur={(event) => atualizarQuantidadeItem(item._id, event.currentTarget.value)}
                        style={{ width: 72, height: 30, border: 0, background: 'transparent', textAlign: 'center', color: 'var(--text-primary)', fontWeight: 700 }}
                        aria-label={`Quantidade de ${item.nome}`}
                      />
                      <button type="button" disabled={itemOcupado} onMouseDown={(event) => event.preventDefault()} onClick={() => atualizarQuantidadeItem(item._id, Number(quantidadeExibida || 0) + step)} style={{ width: 28, height: 30, border: 0, background: 'transparent', cursor: itemOcupado ? 'wait' : 'pointer', fontWeight: 700, color: 'var(--text-primary)' }}>+</button>
                    </div>
                    <span style={{ minWidth: 78, textAlign: 'right', fontWeight: 700 }}>{formatMoney(Number(quantidadeExibida || 0) * item.precoUnitario)}</span>
                    <button type="button" disabled={itemOcupado} onMouseDown={(event) => event.preventDefault()} onClick={() => removeItem(item._id)} aria-label={`Remover ${item.nome}`} style={{ border: 0, background: 'transparent', color: 'var(--text-secondary)', cursor: itemOcupado ? 'wait' : 'pointer', fontSize: 20 }}>×</button>
                  </div>
                </div>
              );
            })}
            <div className="comandas-checkout">
              <div>
                <small style={{ display: 'block', color: 'var(--text-secondary)' }}>Total da comanda</small>
                <b style={{ fontSize: 20, color: 'var(--accent-primary)' }}>{formatMoney(subtotal)}</b>
                {jaRecebido > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <span className="comanda-status-pill" style={{ background: statusPagamentoInfo(selected.statusPagamento).bg, color: statusPagamentoInfo(selected.statusPagamento).txt }}>
                      {statusPagamentoInfo(selected.statusPagamento).label}
                    </span>
                    <small style={{ display: 'block', marginTop: 4, color: 'var(--text-secondary)' }}>
                      Recebido {formatMoney(jaRecebido)} · Falta <strong style={{ color: 'var(--text-primary)' }}>{formatMoney(saldoEmAberto)}</strong>
                    </small>
                  </div>
                )}
                {jaRecebido > 0 && normalizarPagamentos(selected.historicoPagamentos).length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>Histórico de recebimentos</summary>
                    <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                      {normalizarPagamentos(selected.historicoPagamentos).map((pagamento, indice) => (
                        <small key={indice} style={{ color: 'var(--text-secondary)' }}>
                          {dataBR(pagamento.data)} · {rotuloPagamento(pagamento.tipo)} · <strong>{formatMoney(pagamento.valor)}</strong>
                          {pagamento.usuario ? ` · ${pagamento.usuario}` : ''}
                        </small>
                      ))}
                    </div>
                  </details>
                )}
              </div>
              <button onClick={abrirModalFechamento} className="comandas-primary-button">{jaRecebido > 0 ? 'Receber / Fechar' : 'Fechar comanda'}</button>
              <button onClick={cancel} className="comandas-cancel-button">Cancelar</button>
            </div>
          </>}
        </section>
      </div>

      {/* ── MODAL DE FECHAMENTO ───────────────────────────────────────────── */}
      {modalFechamento && selected && (
        <div onClick={() => { if (!fechandoRef.current) setModalFechamento(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 18, padding: 24, boxShadow: 'var(--shadow-lg)', color: 'var(--text-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-primary)', letterSpacing: '.08em' }}>FECHAR COMANDA</span>
                <h2 style={{ margin: '4px 0 0', fontSize: 20 }}>#{selected.numero} — {selected.clienteNome}</h2>
              </div>
              <button onClick={() => { if (!fechandoRef.current) setModalFechamento(false); }} style={{ border: 0, background: 'transparent', fontSize: 22, cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
            </div>

            {/* itens resumo */}
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, maxHeight: 200, overflowY: 'auto' }}>
              {selected.itens.map(item => (
                <div key={item._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border-light)', fontSize: 13 }}>
                  <span>{item.quantidade}× {item.nome}{item.modificadores?.length ? <span style={{ color: 'var(--accent-primary)', fontSize: 11 }}> ({item.modificadores.join(', ')})</span> : ''}</span>
                  <span style={{ fontWeight: 700 }}>{formatMoney(item.quantidade * item.precoUnitario)}</span>
                </div>
              ))}
            </div>

            {Number(selected?.taxaEntrega) > 0 && <p style={{ display: 'flex', justifyContent: 'space-between' }}><span>Taxa de entrega</span><strong>{formatMoney(selected.taxaEntrega)}</strong></p>}

            {/* desconto */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Desconto (R$)</label>
                <input disabled={fechando} type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={e => setDiscount(e.target.value)}
                  className="comandas-field" style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{jaRecebido > 0 ? 'Saldo em aberto' : 'Total a cobrar'}</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-primary)' }}>{formatMoney(jaRecebido > 0 ? saldoEmAberto : total)}</span>
                {jaRecebido > 0 && <small style={{ color: 'var(--text-secondary)' }}>Total {formatMoney(total)} · já recebido {formatMoney(jaRecebido)}</small>}
              </div>
            </div>

            <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '10px 12px' }}>
              <input disabled={fechando}
                type="checkbox"
                checked={utilizacaoInterna}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setUtilizacaoInterna(checked);
                  if (checked) {
                    setPaymentMethod('credito_loja');
                  } else {
                    setPaymentMethod('');
                  }
                  setPaymentError(false);
                }}
                style={{ width: 18, height: 18, accentColor: 'var(--accent-primary)' }}
              />
              <label style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', cursor: 'pointer' }}>
                UTILIZAÇÃO INTERNA
              </label>
            </div>

            {/* forma de pagamento */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Forma de pagamento</label>
              <select disabled={fechando}
                className="comandas-field"
                value={utilizacaoInterna ? 'credito_loja' : paymentMethod}
                onChange={e => { setPaymentMethod(e.target.value); setPaymentError(false); }}
                disabled={utilizacaoInterna}
                style={{ width: '100%', borderColor: paymentError ? 'var(--error-bg)' : undefined, opacity: utilizacaoInterna ? 0.7 : 1 }}
              >
                <option value="">Selecione…</option>
                {FORMAS_PAGAMENTO.map((forma) => <option key={forma.value} value={forma.value}>{forma.label}</option>)}
              </select>
            </div>

            {/* nome do cliente */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                👤 Nome do cliente <span style={{ fontWeight: 400 }}>(opcional)</span>
              </label>
              <input disabled={fechando} type="text" placeholder="Nome do cliente" value={nomeModal} onChange={e => setNomeModal(e.target.value)}
                className="comandas-field" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>

            {/* telefone do cliente */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                📱 Celular do cliente <span style={{ fontWeight: 400 }}>(opcional — salva nome e telefone no cadastro)</span>
              </label>
              <input disabled={fechando} type="tel" placeholder="(00) 00000-0000" value={telefoneModal} onChange={e => setTelefoneModal(e.target.value)}
                className="comandas-field" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>

            <button disabled={fechando} onClick={confirmarFechamento} style={{ width: '100%', minHeight: 50, border: 0, borderRadius: 12, background: 'var(--accent-primary)', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>
              ✅ Confirmar Fechamento
            </button>
          </div>
        </div>
      )}

      {modalMoverComanda && (
        <div onClick={() => setModalMoverComanda(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9002, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 18, padding: 24, boxShadow: 'var(--shadow-lg)', color: 'var(--text-primary)' }}>
            <div style={{ width: 62, height: 62, borderRadius: '50%', margin: '0 auto 12px', background: 'rgba(124,75,30,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>📦</div>
            <h3 style={{ margin: '0 0 8px', textAlign: 'center', fontSize: 20 }}>Criar nova comanda?</h3>
            <p style={{ margin: '0 0 16px', textAlign: 'center', fontSize: 14, color: 'var(--text-secondary)' }}>
              Você vai mover <strong>{modalMoverComanda.quantidade}</strong> item{modalMoverComanda.quantidade > 1 ? 'ns' : ''} da comanda <strong>#{modalMoverComanda.origem}</strong> para uma nova comanda.
            </p>
            <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                Nome do cliente
                <input disabled={fechando}
                  value={modalMoverComanda.clienteNome}
                  onChange={(event) => setModalMoverComanda((prev) => ({ ...prev, clienteNome: event.target.value }))}
                  className="comandas-field"
                  placeholder="Cliente da nova comanda"
                />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                Observação
                <input disabled={fechando}
                  value={modalMoverComanda.observacao}
                  onChange={(event) => setModalMoverComanda((prev) => ({ ...prev, observacao: event.target.value }))}
                  className="comandas-field"
                  placeholder="Ex.: Cliente vai pagar separadamente"
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setModalMoverComanda(null)} style={{ flex: 1, minHeight: 48, border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontWeight: 700, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button type="button" onClick={confirmarMovimentoParaNovaComanda} style={{ flex: 1, minHeight: 48, border: 0, borderRadius: 10, background: 'var(--accent-primary)', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE SUCESSO ──────────────────────────────────────────────── */}
      {modalSucesso && (
        <div onClick={() => setModalSucesso(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9001, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 20, padding: 28, textAlign: 'center', boxShadow: 'var(--shadow-lg)', color: 'var(--text-primary)' }}>
            <div style={{ width: 68, height: 68, borderRadius: '50%', margin: '0 auto 14px', background: 'rgba(16,185,129,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 }}>✅</div>
            <h3 style={{ margin: '0 0 4px', fontSize: 20 }}>Comanda Fechada!</h3>
            <p style={{ margin: '0 0 6px', fontSize: 14, color: 'var(--text-secondary)' }}>
              Comanda <strong style={{ color: 'var(--text-primary)' }}>#{modalSucesso.comanda.numero}</strong> →{' '}
              Pedido <strong style={{ color: 'var(--text-primary)' }}>#{modalSucesso.pedido.numero}</strong>
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 800, color: 'var(--accent-primary)' }}>
              {formatMoney(modalSucesso.pedido.total)}
            </p>
            <div style={{ marginBottom: 18, padding: 12, borderRadius: 10, background: modalSucesso.pedido.nfce?.status === 'autorizada' ? 'rgba(16,185,129,.1)' : 'var(--bg-tertiary)', textAlign: 'left' }}>
              <strong>NFC-e: {modalSucesso.pedido.nfce?.status === 'autorizada' ? 'Autorizada' : modalSucesso.pedido.nfce?.status === 'rejeitada' ? 'Rejeitada' : 'Não emitida'}</strong>
              {modalSucesso.pedido.nfce?.mensagemSeErro && <small style={{ display: 'block', marginTop: 5, color: 'var(--text-secondary)' }}>{modalSucesso.pedido.nfce.mensagemSeErro}</small>}
              {modalSucesso.pedido.nfce?.chaveAcesso && <small style={{ display: 'block', marginTop: 5, wordBreak: 'break-all', color: 'var(--text-secondary)' }}>Chave: {modalSucesso.pedido.nfce.chaveAcesso}</small>}
            </div>

            {/* campo de telefone no modal de sucesso (se não preencheu antes) */}
            {!modalSucesso.telefone && (
              <div style={{ marginBottom: 16, textAlign: 'left' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  👤 Nome do cliente
                </label>
                <input type="text" placeholder="Nome do cliente"
                  value={modalSucesso.nome || ''}
                  onChange={e => setModalSucesso(prev => ({ ...prev, nome: e.target.value }))}
                  className="comandas-field" style={{ width: '100%', boxSizing: 'border-box', marginBottom: 8 }} />
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  📱 WhatsApp para enviar comprovante
                </label>
                <input type="tel" placeholder="(00) 00000-0000"
                  value={modalSucesso.telefone || ''}
                  onChange={e => setModalSucesso(prev => ({ ...prev, telefone: e.target.value }))}
                  className="comandas-field" style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
            )}

            {modalSucesso.telefone && !modalSucesso.nome && (
              <div style={{ marginBottom: 16, textAlign: 'left' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  👤 Nome do cliente (opcional)
                </label>
                <input type="text" placeholder="Nome do cliente"
                  value={modalSucesso.nome || ''}
                  onChange={e => setModalSucesso(prev => ({ ...prev, nome: e.target.value }))}
                  className="comandas-field" style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-light)', paddingTop: 18 }}>
              <button type="button" onClick={emitirNfce} disabled={nfceLoading} style={{ width: '100%', padding: '13px', background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: nfceLoading ? 'wait' : 'pointer', minHeight: 50 }}>
                {nfceLoading ? '⏳ Emitindo NFC-e...' : modalSucesso.pedido.nfce?.status === 'autorizada' ? '✅ NFC-e autorizada' : '🧾 Emitir NFC-e'}
              </button>
              {modalSucesso.pedido.nfce?.danfePdf && <button type="button" onClick={abrirDanfe} style={{ width: '100%', padding: '13px', background: 'var(--success-bg)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', minHeight: 50 }}>📄 Abrir DANFE PDF</button>}
              {modalSucesso.pedido.nfce?.status === 'autorizada' && <button type="button" onClick={() => void imprimirDanfe()} style={{ width: '100%', padding: '13px', background: 'var(--success-bg)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', minHeight: 50 }}>🧾 Imprimir DANFE NFC-e</button>}
              <button onClick={() => imprimirCupom(modalSucesso.pedido, modalSucesso.comanda)}
                style={{ width: '100%', padding: '13px', background: 'var(--brand-brown, #7c4b1e)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', minHeight: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                🖨️ Imprimir Cupom
              </button>
              <button type="button" onClick={() => void reimprimirCozinha()}
                style={{ width: '100%', padding: '13px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', minHeight: 50 }}>
                🍳 Reimprimir pedido de cozinha
              </button>
              <button onClick={enviarComprovante}
                style={{ width: '100%', padding: '13px', background: '#25d366', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', minHeight: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                💬 Enviar pelo WhatsApp
              </button>
              <button onClick={() => setModalSucesso(null)}
                style={{ width: '100%', padding: '11px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 42 }}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .comandas-page { width: 100%; max-width: 1180px; margin: 0 auto; }
        .service-mode-panel { display:grid; gap:12px; margin-bottom:16px; padding:18px; border:1px solid var(--border-color); border-radius:16px; background:var(--bg-secondary); box-shadow:var(--shadow-sm); }.service-mode-heading{display:flex;align-items:baseline;justify-content:space-between;gap:10px}.service-mode-heading h2{margin:0;font-size:17px}.service-mode-heading span{color:var(--text-secondary);font-size:12px}.table-shortcuts{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.table-shortcut{display:grid;gap:6px;min-height:76px;padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-tertiary);color:var(--text-primary);cursor:pointer;text-align:left}.table-shortcut strong{font-size:20px}.table-shortcut span{color:var(--success-bg);font-size:11px;font-weight:700}.table-shortcut.occupied{border-color:var(--warning-bg)}.table-shortcut.occupied span{color:var(--warning-bg)}.counter-service{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:12px;border-top:1px solid var(--border-light)}.counter-service>div{display:grid;gap:3px}.counter-service span{color:var(--text-secondary);font-size:12px}.counter-service strong{color:var(--accent-primary);font-size:13px}
        .page-heading { margin-bottom: 20px; }
        .comanda-status-pill { display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 999px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
        .page-heading p, .comandas-card-heading p { margin: 0; color: var(--text-secondary); font-size: 13px; }
        .comandas-open-form, .comandas-card { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 16px; box-shadow: var(--shadow-sm); }
        .comandas-open-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; padding: 18px; margin-bottom: 16px; }
        .comandas-field { width: 100%; min-height: 48px; padding: 12px 14px; border: 1.5px solid var(--border-color); border-radius: 10px; background: var(--input-bg); color: var(--input-text); font: inherit; box-sizing: border-box; }
        .comandas-open-form button, .comandas-primary-button { min-height: 48px; padding: 10px 18px; border: 0; border-radius: 10px; background: var(--accent-primary); color: #fff; font-weight: 800; cursor: pointer; }
        .comandas-secondary-button { min-height: 48px; padding: 10px 16px; border: 1px solid var(--accent-border); border-radius: 10px; background: var(--accent-light); color: var(--accent-primary); font-weight: 800; cursor: pointer; }
        .comandas-columns { display: grid; grid-template-columns: minmax(230px, .85fr) minmax(320px, 1.6fr); gap: 16px; }
        .comandas-card { padding: 18px; }
        .comandas-card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
        .comandas-card-heading h2 { margin: 0; font-size: 16px; color: var(--text-primary); }
        .comandas-count { min-width: 30px; padding: 5px 9px; border-radius: 20px; background: var(--accent-light); color: var(--accent-primary); font-weight: 800; text-align: center; }
        .comanda-select-button { background: var(--bg-tertiary) !important; border-radius: 10px !important; min-height: 58px; color: var(--text-primary); cursor: pointer; }
        .comanda-select-button:hover { border-color: var(--accent-primary) !important; background: var(--accent-light) !important; }
        .comandas-add-form { display: grid; grid-template-columns: minmax(0, 1fr) 90px auto; gap: 8px; margin-bottom: 16px; }
        .comandas-checkout { border-top: 2px solid var(--accent-primary); padding-top: 14px; margin-top: 8px; display: flex; align-items: flex-end; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
        .comandas-cancel-button { min-height: 48px; padding: 10px 14px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-tertiary); color: var(--error-bg); font-weight: 800; cursor: pointer; }
        .balcao-status-bar { display:grid; gap:8px; margin:0 0 14px; padding:10px 12px; border:1px solid var(--accent-border); border-radius:10px; background:var(--accent-light); color:var(--text-secondary); font-size:12px; }.balcao-status-bar>div{display:flex;gap:6px;overflow-x:auto}.balcao-status-bar button{flex-shrink:0;padding:7px 9px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);color:var(--text-secondary);font-size:11px;font-weight:700;cursor:pointer}.balcao-status-bar button.active{border-color:var(--accent-primary);background:var(--accent-primary);color:#fff}.comandas-quick-products { padding: 12px; margin-bottom: 12px; border-radius: 10px; background: var(--accent-light); color: var(--text-secondary); font-size: 11px; }
        .comandas-quick-products > div { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
        .comandas-quick-products button { min-height: 42px; padding: 6px 8px; border: 1px solid var(--accent-border); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); text-align: left; font-size: 11px; cursor: pointer; }
        .comandas-quick-products button.selected { border: 2px solid var(--accent-primary); color: var(--accent-primary); }
        @media (max-width: 760px) { .comandas-columns { grid-template-columns: 1fr; } .comandas-detail-card { min-width: 0; } .comandas-add-form { grid-template-columns: minmax(0, 1fr) 82px; } .comandas-add-form button { grid-column: 1 / -1; } .table-shortcuts{grid-template-columns:repeat(2,1fr)}.counter-service{align-items:stretch;flex-direction:column}.counter-service button{width:100%}.service-mode-heading{align-items:flex-start;flex-direction:column} }
        .comandas-mobile-back { display: none; }
        @media (max-width: 520px) { .comandas-open-form, .comandas-card { padding: 14px; } .comandas-checkout { align-items: stretch; flex-direction: column; position: sticky; bottom: 0; padding: 14px 0 max(14px, env(safe-area-inset-bottom)); background: var(--bg-secondary); } .comandas-checkout .comandas-field, .comandas-checkout button { width: 100%; } .comandas-mobile-back { display: inline-flex; min-height: 38px; align-items: center; margin-bottom: 12px; padding: 6px 10px; border: 1px solid var(--border-color); border-radius: 9px; background: var(--bg-tertiary); color: var(--text-secondary); font: inherit; font-size: 12px; font-weight: 700; } .comandas-list-card.mobile-hidden, .comandas-detail-card.mobile-hidden { display: none; } }
      `}</style>
    </div>
  );
}
