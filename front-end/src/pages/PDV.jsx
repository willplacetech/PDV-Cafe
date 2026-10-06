import { useCallback, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api.jsx';
import { permiteFracionar } from '../utils/quantidadeVenda.js';
import { useToast } from '../components/useToast.js';
import { compartilharNotaWhatsApp } from '../utils/notaVenda.js';
import useFilaOffline from '../hooks/useFilaOffline.js';
import DeliveryPDV from '../components/DeliveryPDV.jsx';
import {
  carregarConfiguracaoImpressao,
  carregarPreferenciaImpressora,
  imprimirCupomVenda,
  imprimirPedidoCozinha,
} from '../services/impressaoService.js';


const corCategoria = {
  'Bebidas Quentes': { bg: 'var(--category-hot-bg)', txt: 'var(--category-hot-text)', border: 'var(--category-hot-border)' },
  'Bebidas geladas': { bg: 'var(--category-cold-bg)', txt: 'var(--category-cold-text)', border: 'var(--category-cold-border)' },
  Salgados: { bg: 'var(--category-savory-bg)', txt: 'var(--category-savory-text)', border: 'var(--category-savory-border)' },
  Doces: { bg: 'var(--category-sweet-bg)', txt: 'var(--category-sweet-text)', border: 'var(--category-sweet-border)' },
  Insumos: { bg: 'var(--category-supply-bg)', txt: 'var(--category-supply-text)', border: 'var(--category-supply-border)' },
  Outros: { bg: 'var(--category-other-bg)', txt: 'var(--category-other-text)', border: 'var(--category-other-border)' }
};

const grupos = ['Todos', 'Favoritos', 'Bebidas Quentes', 'Bebidas geladas', 'Salgados', 'Doces', 'Congelados', 'Sorvetes', 'Outros'];
const normalizarTexto = (valor) => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const formatMoney = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const precoPorUnidade = (produto) => {
  const pesoEmKg = Number(produto?.pesoPorUnidade || 0) * (produto?.unidadePeso === 'g' ? 0.001 : 1);
  const preco = pesoEmKg > 0 ? Number(produto.preco || 0) * pesoEmKg : Number(produto.preco || 0);
  return Math.round((preco + Number.EPSILON) * 100) / 100;
};
const precoComDesconto = (produto, quantidade, precoNormal = precoPorUnidade(produto)) => {
  const faixas = (produto?.descontosPorQuantidade || [])
    .filter((faixa) => faixa.ativo !== false && Number(faixa.quantidadeMinima) <= Number(quantidade))
    .sort((a, b) => Number(a.quantidadeMinima) - Number(b.quantidadeMinima));
  const faixaAplicada = faixas[faixas.length - 1];
  const precoUnitario = faixaAplicada ? Number(faixaAplicada.precoUnitario) : precoNormal;
  return { precoNormal, precoUnitario, economiaTotal: Math.max(0, (precoNormal - precoUnitario) * Number(quantidade || 0)), faixaAplicada };
};
const precoComDescontoGrupo = (produto, quantidade, cartItens, precoBase) => {
  const grupo = produto?.grupoDesconto;
  if (!grupo?.nome || grupo.ativo === false) return null;
  const totalGrupo = cartItens.reduce((total, item) => {
    const itemGrupo = item.produto?.grupoDesconto;
    if (itemGrupo?.nome === grupo.nome && itemGrupo?.ativo !== false) {
      return total + Number(item.quantidade || 0);
    }
    return total;
  }, 0);
  const quantidadeMinima = Number(grupo.quantidadeMinima || 0);
  const grupoAtivo = quantidadeMinima > 0 && totalGrupo >= quantidadeMinima;
  const precoNormal = Number(precoBase);
  const precoUnitario = grupoAtivo ? Number(grupo.precoPromocional) : precoNormal;
  const qtd = Number(quantidade || 0);
  return {
    precoNormal,
    precoUnitario,
    economiaUnitario: Math.max(0, precoNormal - precoUnitario),
    economiaTotal: Math.max(0, (precoNormal - precoUnitario) * qtd),
    grupoAtivo,
    totalGrupo,
    faltamParaGrupo: Math.max(0, quantidadeMinima - totalGrupo),
  };
};


export default function PDV() {
  const [produtos, setProdutos] = useState([]);
  const [maisVendidos, setMaisVendidos] = useState([]);
  const [carrinho, setCarrinho] = useState([]);
  const [quantidadesRascunho, setQuantidadesRascunho] = useState({});
  const [busca, setBusca] = useState('');
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState('');
  const [clienteNome, setClienteNome] = useState('');
  const [grupoAtivo, setGrupoAtivo] = useState('Todos');
  const [feedbackProduto, setFeedbackProduto] = useState(null);
  const [modalSucesso, setModalSucesso] = useState(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const { showToast } = useToast();
  const { enfileirar } = useFilaOffline();
  const [entregaPDV, setEntregaPDV] = useState(null);
  const navigate = useNavigate();
  const selectClienteRef = useRef(null);
  const envioRef = useRef(false);
  const idempotenciaRef = useRef(null);
  const [enviando, setEnviando] = useState(false);


  const carregarDados = useCallback(async () => {
    const resultados = navigator.onLine ? await Promise.allSettled([
      api.get('/products/pdv'), api.get('/customers'), api.get('/products/mais-vendidos?limite=8')
    ]) : [];
    const resultadoProdutos = resultados[0];
    if (resultadoProdutos?.status === 'fulfilled') {
      setProdutos(resultadoProdutos.value.data);
      try { localStorage.setItem('pdv_catalogo_offline', JSON.stringify(resultadoProdutos.value.data)); } catch { /* cache auxiliar não deve bloquear o PDV */ }
    } else {
      try {
        const produtosOffline = JSON.parse(localStorage.getItem('pdv_catalogo_offline') || '[]');
        if (Array.isArray(produtosOffline)) setProdutos(produtosOffline);
      } catch { /* catálogo local inválido; mantém a lista vazia */ }
    }
    if (resultados[1]?.status === 'fulfilled') setClientes(resultados[1].value.data);
    if (resultados[2]?.status === 'fulfilled') setMaisVendidos(resultados[2].value.data);
    let temCatalogoOffline = false;
    try { temCatalogoOffline = JSON.parse(localStorage.getItem('pdv_catalogo_offline') || '[]').length > 0; } catch { /* ignora armazenamento local inválido */ }
    if (resultados.every((resultado) => resultado.status === 'rejected') && !temCatalogoOffline) {
      showToast('Sem conexão e sem catálogo salvo neste dispositivo', 'warning');
    }
  }, [showToast]);

  useEffect(() => {
    const carregarInicial = async () => { await carregarDados(); };
    carregarInicial();
  }, [carregarDados]);


  const tocarFeedback = () => {
    try {
      const contexto = new window.AudioContext();
      const oscilador = contexto.createOscillator();
      const ganho = contexto.createGain();
      oscilador.frequency.value = 620;
      ganho.gain.setValueAtTime(0.035, contexto.currentTime);
      ganho.gain.exponentialRampToValueAtTime(0.001, contexto.currentTime + 0.08);
      oscilador.connect(ganho).connect(contexto.destination);
      oscilador.start();
      oscilador.stop(contexto.currentTime + 0.08);
    } catch { /* áudio pode ser bloqueado pelo navegador */ }
  };

  const recalcularPrecosCarrinho = (itens) => {
    const cartItens = itens.map((item) => ({
      produto: produtos.find((registro) => registro._id === item.produtoId),
      quantidade: item.quantidade,
    }));
    return itens.map((item) => {
      const produto = produtos.find((registro) => registro._id === item.produtoId);
      if (!produto) return item;
      const quantidadeTotal = itens.filter((linha) => linha.produtoId === item.produtoId).reduce((total, linha) => total + Number(linha.quantidade || 0), 0);
      const pricing = precoComDesconto(produto, quantidadeTotal, item.precoUnitarioOriginal || precoPorUnidade(produto));
      const grupoPricing = precoComDescontoGrupo(produto, quantidadeTotal, cartItens, pricing.precoUnitario);
      const grupoAtivo = grupoPricing && grupoPricing.grupoAtivo && grupoPricing.precoUnitario < pricing.precoUnitario;
      const precoUnitario = grupoAtivo ? grupoPricing.precoUnitario : pricing.precoUnitario;
      const precoUnitarioOriginal = grupoAtivo ? grupoPricing.precoNormal : pricing.precoNormal;
      const economiaTotal = grupoAtivo ? grupoPricing.economiaTotal : pricing.economiaTotal;
      return {
        ...item,
        precoUnitario,
        precoUnitarioOriginal,
        economiaQuantidade: economiaTotal,
        faixaDescontoQuantidade: !grupoAtivo ? pricing.faixaAplicada?.quantidadeMinima : null,
        grupoDescontoAtivo: !!grupoAtivo,
        totalGrupo: grupoPricing?.totalGrupo || 0,
        faltamParaGrupo: grupoPricing?.faltamParaGrupo || 0,
      };
    });
  };

  const adicionarItem = (prod, opcoes = {}) => {
    if (prod.tipo !== 'venda') return showToast('Este item não pode entrar no PDV', 'warning');
    const estoqueDisponivel = prod.aFazer ? Number(prod.cozDisponibilidade?.disponivel || 0) : Number(prod.estoque || 0);
    if (prod.aFazer && estoqueDisponivel <= 0 && !prod.permitirVendaSemInsumo) {
      const faltantes = prod.cozDisponibilidade?.faltantes?.join(', ') || 'ingrediente da ficha técnica';
      return showToast(`${prod.nome} indisponível. Faltam: ${faltantes}`, 'error');
    }
    if (!prod.aFazer && estoqueDisponivel <= 0) return showToast('Produto sem estoque!', 'error');
    const modificadoresItem = opcoes.modificadores || [];
    const assinatura = modificadoresItem.join('|');
    const existe = carrinho.find(i => i.produtoId === prod._id && (i.modificadores || []).join('|') === assinatura);
    const incremento = 1;
    const quantidadeProduto = carrinho.filter(i => i.produtoId === prod._id).reduce((total, item) => total + item.quantidade, 0);
    if (!prod.permitirVendaSemInsumo && quantidadeProduto + incremento > estoqueDisponivel) return showToast('Estoque máximo atingido!', 'warning');
    if (existe) {
      if (!prod.permitirVendaSemInsumo && existe.quantidade >= estoqueDisponivel) return showToast('Estoque máximo atingido!', 'warning');
      setCarrinho(recalcularPrecosCarrinho(carrinho.map(i => i.produtoId === prod._id && (i.modificadores || []).join('|') === assinatura ? { ...i, quantidade: Number((i.quantidade + incremento).toFixed(3)) } : i)));
    } else {
      const pricing = precoComDesconto(prod, incremento);
      const novoItem = {
        produtoId: prod._id, codigo: prod.codigo, nome: prod.nome,
        categoria: prod.categoria,
        precoUnitario: pricing.precoUnitario, precoUnitarioOriginal: pricing.precoNormal, economiaQuantidade: pricing.economiaTotal, faixaDescontoQuantidade: pricing.faixaAplicada?.quantidadeMinima, quantidade: incremento, unidadeVenda: prod.unidadeVenda || 'un', pesoPorUnidade: prod.pesoPorUnidade, unidadePeso: prod.unidadePeso, vendidoFracionado: permiteFracionar(prod), modificadores: modificadoresItem
      };
      setCarrinho(recalcularPrecosCarrinho([...carrinho, novoItem]));
    }
    setFeedbackProduto(prod._id);
    tocarFeedback();
    window.setTimeout(() => setFeedbackProduto(null), 350);
  };

  const selecionarProduto = (prod) => {
    adicionarItem(prod);
  };


  const alterarQtd = (idx, qtd) => {
    const quantidade = Number(qtd);
    if (!Number.isFinite(quantidade) || quantidade < 0.001) {
      setQuantidadesRascunho((atuais) => { const proximas = { ...atuais }; delete proximas[idx]; return proximas; });
      showToast('Informe uma quantidade válida', 'warning');
      return;
    }
    const novos = [...carrinho];
    if (!novos[idx]) return;
    const prod = produtos.find(p => p._id === novos[idx].produtoId);
    if (!permiteFracionar(prod) && !Number.isInteger(quantidade)) return showToast('Este produto é vendido por unidade', 'warning');
    const quantidadeOutrasLinhas = carrinho.reduce((total, item, itemIndex) => itemIndex !== idx && item.produtoId === novos[idx].produtoId ? total + item.quantidade : total, 0);
    const estoqueDisponivel = prod.aFazer ? Number(prod.cozDisponibilidade?.disponivel || 0) : Number(prod.estoque || 0);
    if (!prod.permitirVendaSemInsumo && quantidadeOutrasLinhas + quantidade > estoqueDisponivel) return showToast(`Máximo: ${estoqueDisponivel}`, 'warning');
    novos[idx].quantidade = quantidade;
    setCarrinho(recalcularPrecosCarrinho(novos));
    setQuantidadesRascunho((atuais) => { const proximas = { ...atuais }; delete proximas[idx]; return proximas; });
  };


  const removerItem = (idx) => {
    setCarrinho((atuais) => recalcularPrecosCarrinho(atuais.filter((_, i) => i !== idx)));
    setQuantidadesRascunho({});
  };


  const subtotal = carrinho.reduce((ac, i) => ac + i.precoUnitario * i.quantidade, 0);
  const total = subtotal + (entregaPDV ? Number(entregaPDV.taxaEntrega) || 0 : 0);
  const descontoQuantidadeTotal = carrinho.reduce((acumulado, item) => acumulado + Number(item.economiaQuantidade || 0), 0);
  const totalItens = carrinho.reduce((ac, i) => ac + i.quantidade, 0);
  const clienteSelecionado = clientes.find(c => c._id === clienteId);


  const finalizar = async () => {
    if (envioRef.current) return;
    if (!carrinho.length) return showToast('Carrinho vazio!', 'warning');
    if (entregaPDV && (!String(clienteSelecionado?.nome || clienteNome || '').trim() || !entregaPDV.telefone.trim() || !['rua', 'numero', 'bairro'].every(campo => entregaPDV.endereco[campo]?.trim()) || !Number.isFinite(Number(entregaPDV.taxaEntrega)) || Number(entregaPDV.taxaEntrega) < 0)) return showToast('Informe nome, telefone e endereco completo para entrega.', 'warning');
    envioRef.current = true;
    setEnviando(true);

    const payload = {
      clienteId: clienteId || undefined,
      clienteNome: clienteSelecionado?.nome || clienteNome.trim() || 'Cliente não identificado',
      clienteTelefone: clienteSelecionado?.telefone || '',
      itens: carrinho.map((item) => ({
        produtoId: item.produtoId,
        quantidade: Number(item.quantidade),
        modificadores: item.modificadores || [],
      })),
    };

    if (entregaPDV) payload.entrega = { ...entregaPDV, taxaEntrega: Number(entregaPDV.taxaEntrega) };

    const assinatura = JSON.stringify(payload);
    if (idempotenciaRef.current?.assinatura !== assinatura) {
      const chave = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      idempotenciaRef.current = { assinatura, chave };
    }
    const idTemporario = idempotenciaRef.current.chave;
    payload.idTemporario = idTemporario;

    const limparCarrinho = () => {
      idempotenciaRef.current = null;
      setCarrinho([]);
      setClienteId('');
      setClienteNome('');
      setEntregaPDV(null);
    };

    const imprimirVendaOffline = async (vendaLocal) => {
      try {
        const config = carregarConfiguracaoImpressao();
        if (!carregarPreferenciaImpressora()) return;
        const options = {
          ...config,
          empresa: config.empresa,
          categoriasPorProduto: Object.fromEntries(produtos.map((product) => [String(product._id), product.categoria])),
          onFallback: (message) => showToast(message, 'warning'),
        };
        if (config.imprimirCupomAutomaticamente) {
          try {
            await imprimirCupomVenda(vendaLocal, options);
          } catch (error) {
            showToast('Venda salva offline e concluída localmente; impressão pendente. Reimprima quando a impressora estiver disponível. ' + (error.message || ''), 'warning');
          }
        }
        if (config.imprimirCozinhaAutomaticamente) {
          try {
            await imprimirPedidoCozinha(vendaLocal, options);
          } catch (error) {
            showToast('Venda salva offline; pedido da cozinha pendente para reimpressão. ' + (error.message || ''), 'warning');
          }
        }
      } catch (error) {
        showToast(`Venda salva offline, mas a impressão não foi iniciada: ${error.message}`, 'warning');
      }
    };

    const salvarOffline = async () => {
      const resultado = await enfileirar('/comandas', payload, idTemporario);
      if (!resultado.ok) {
        if (resultado.motivo === 'sessao') showToast('Entre com seu operador antes de salvar a venda offline. O carrinho foi preservado.', 'warning');
        else if (resultado.motivo === 'limite') showToast('Limite de 50 vendas pendentes atingido. Conecte à internet para sincronizar.', 'warning');
        else showToast('Conecte à internet para sincronizar. A venda não foi removida do carrinho.', 'warning');
        return false;
      }
      const vendaLocal = {
        numero: idTemporario,
        createdAt: new Date().toISOString(),
        clienteNome: payload.clienteNome,
        tipoAtendimento: entregaPDV ? 'delivery' : 'balcao',
        entrega: entregaPDV,
        itens: carrinho.map((item) => ({
          produtoId: item.produtoId,
          nome: item.nome,
          categoria: item.categoria,
          codigo: item.codigo,
          quantidade: Number(item.quantidade),
          precoUnitario: Number(item.precoUnitario),
          modificadores: item.modificadores || [],
        })),
        subtotal,
        desconto: 0,
        taxaEntrega: Number(entregaPDV?.taxaEntrega || 0),
        total,
      };
      limparCarrinho();
      showToast('✅ Sem internet — venda salva! Envia automaticamente quando voltar.', 'success');
      void imprimirVendaOffline(vendaLocal);
      return true;
    };

    try {
      if (!navigator.onLine) {
        await salvarOffline();
        return;
      }

      const { data: comanda } = await api.post('/comandas', payload, {
        headers: { 'Idempotency-Key': idTemporario },
      });
      limparCarrinho();
      showToast(`Comanda #${comanda.numero} aberta`, 'success');
      navigate('/comandas');
    } catch (err) {
      if (!err.response || [0, 408].includes(err.response.status) || err.response.status >= 500 || !navigator.onLine) {
        await salvarOffline();
        return;
      }
      showToast(err.response?.data?.msg || 'Erro ao abrir comanda', 'error');
    } finally {
      envioRef.current = false;
      setEnviando(false);
    }
  };


  // ==========================================
  // 🖨️ IMPRIMIR CUPOM
  // ==========================================
  const imprimirCupom = async (pedido) => {
    if (!pedido) return;
    try {
      await imprimirCupomVenda(pedido, carregarConfiguracaoImpressao());
      showToast('Cupom enviado para impressão.', 'success');
    } catch (error) {
      showToast(error.message || 'Impressão pendente. Tente reimprimir pelo histórico.', 'warning');
    }
  };


  // ==========================================
  // 💬 ENVIAR VIA WHATSAPP
  // ==========================================
  const enviarWhatsApp = (pedido) => {
    if (!pedido) return;
    return compartilharNotaWhatsApp(pedido);
  };


  // ==========================================
  // NOVA VENDA
  // ==========================================
  const novaVenda = () => {
    setModalSucesso(null);
  };


  const termoBusca = normalizarTexto(busca);
  const idsMaisVendidos = new Set(maisVendidos.map((item) => String(item.produtoId)));
  const produtosMaisVendidos = maisVendidos
    .map((item) => produtos.find((produto) => produto._id === String(item.produtoId)))
    .filter(Boolean);
  const filtrados = produtos.filter((produto) => produto.tipo === 'venda').filter((produto) =>
    !termoBusca || [produto.nome, produto.codigo, produto.categoria].some((campo) => normalizarTexto(campo).includes(termoBusca))
  ).filter((produto) => {
    if (grupoAtivo === 'Todos') return true;
    if (grupoAtivo === 'Favoritos') return idsMaisVendidos.has(String(produto._id));
    return produto.categoria === grupoAtivo;
  });


  return (
    <div>
      {/* Cabeçalho PDV */}
      <div className="pdv-header-desktop page-heading">
        <div>
          <h1>☕ Atendimento</h1>
          <p>Monte o pedido e abra uma comanda.</p>
        </div>
      </div>
      <button type="button" className="pdv-mobile-cart-trigger" onClick={() => setMobileCartOpen((open) => !open)} aria-expanded={mobileCartOpen}>
        <span>{mobileCartOpen ? '− Minimizar carrinho' : '🛒 Carrinho'}</span>
        <strong>{totalItens} {totalItens === 1 ? 'item' : 'itens'} · R$ {total.toFixed(2).replace('.', ',')}</strong>
      </button>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }} className="pdv-grid">
        {/* COLUNA PRODUTOS */}
        <div className="pdv-products-column">
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            borderRadius: 16, padding: 16, marginBottom: 16
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }} className="busca-grid">
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Buscar produto</label>
                <input
                  placeholder="Código, nome ou categoria..." value={busca}
                  onChange={e => setBusca(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 14px', border: '1.5px solid var(--border-color)',
                    borderRadius: 10, fontSize: 16, boxSizing: 'border-box',
                    outline: 'none', background: 'var(--input-bg)', color: 'var(--input-text)', minHeight: 48
                  }}
                />
                {clienteSelecionado && <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 9, background: 'var(--accent-light)', color: 'var(--text-secondary)', fontSize: 11 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><strong style={{ color: 'var(--text-primary)' }}>Fidelidade</strong><span>{Math.min(5, clienteSelecionado.cafesFidelidade || 0)}/5 cafés</span></div><div style={{ height: 6, borderRadius: 99, background: 'var(--bg-tertiary)', overflow: 'hidden' }}><div style={{ width: `${Math.min(100, ((clienteSelecionado.cafesFidelidade || 0) / 5) * 100)}%`, height: '100%', background: 'var(--accent-secondary)', transition: 'width .3s ease' }} /></div><span style={{ display: 'block', marginTop: 4 }}>Faltam {Math.max(0, 5 - (clienteSelecionado.cafesFidelidade || 0))} para o próximo café</span></div>}
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Cliente</label>
                <select
                  ref={selectClienteRef}
                  value={clienteId}
                  onChange={e => setClienteId(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 14px', border: '1.5px solid var(--border-color)',
                    borderRadius: 10, fontSize: 16, boxSizing: 'border-box',
                    outline: 'none', background: 'var(--input-bg)', color: 'var(--input-text)', minHeight: 48
                  }}>
                  <option value="">Cliente não identificado</option>
                  {clientes.map(c => <option key={c._id} value={c._id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Nome no atendimento</label>
                <input placeholder="Digite o nome (opcional)" value={clienteNome} onChange={e => setClienteNome(e.target.value)} style={{ width: '100%', padding: '12px 14px', border: '1.5px solid var(--border-color)', borderRadius: 10, fontSize: 16, boxSizing: 'border-box', outline: 'none', background: 'var(--input-bg)', color: 'var(--input-text)', minHeight: 48 }} />
              </div>
            </div>
          </div>
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            borderRadius: 16, padding: 16
          }}>
            <DeliveryPDV value={entregaPDV} onChange={setEntregaPDV} />
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Mais pedidos</h3>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Mais vendidos no histórico</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--accent-primary)', fontWeight: 700 }}>ATENDIMENTO RÁPIDO</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                {produtosMaisVendidos.filter((produto) => produto.tipo === 'venda').slice(0, 6).map((produto) => (
                  <button key={produto._id} onClick={() => selecionarProduto(produto)} style={{ padding: '11px 10px', minHeight: 58, textAlign: 'left', border: '1px solid var(--accent-border)', borderRadius: 10, background: 'var(--accent-light)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <strong style={{ display: 'block', fontSize: 12 }}>{produto.nome}</strong>
                    <span style={{ fontSize: 11, color: 'var(--accent-primary)' }}>R$ {produto.preco.toFixed(2).replace('.', ',')}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12, marginBottom: 2 }}>
              {grupos.map((grupo) => (
                <button key={grupo} onClick={() => setGrupoAtivo(grupo)} style={{ flexShrink: 0, minHeight: 40, padding: '8px 13px', borderRadius: 20, border: grupoAtivo === grupo ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)', background: grupoAtivo === grupo ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: grupoAtivo === grupo ? '#fff' : 'var(--text-secondary)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                  {grupo}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Produtos</h3>
              <span style={{
                background: 'var(--accent-light)', color: 'var(--accent-primary)',
                padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600
              }}>{filtrados.length}</span>
            </div>
            {filtrados.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 20px', fontSize: 14 }}>Nenhum produto encontrado</p>
            ) : (
              <div style={{
                display: 'grid', gap: 10,
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                maxHeight: 420, overflowY: 'auto', padding: 2
              }}>
                {filtrados.map(p => {
                  const cat = corCategoria[p.categoria] || corCategoria.Outros;
                  const disponibilidade = p.aFazer ? Number(p.cozDisponibilidade?.disponivel || 0) : Number(p.estoque || 0);
                  const semEstoque = disponibilidade <= 0;
                  const estoqueBaixo = disponibilidade > 0 && disponibilidade <= 5;
                  return (
                    <div key={p._id} onClick={() => selecionarProduto(p)} style={{
                      background: 'var(--bg-secondary)', border: `1.5px solid ${semEstoque ? 'var(--border-light)' : cat.border}`,
                      borderRadius: 14, padding: 12, cursor: semEstoque ? 'not-allowed' : 'pointer',
                      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                      minHeight: 120, opacity: semEstoque ? 0.5 : 1, transition: 'all .15s',
                      position: 'relative', overflow: 'hidden'
                    }} className={`product-card ${feedbackProduto === p._id ? 'product-card-added' : ''}`}>
                      <div>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                          fontSize: 10, fontWeight: 700, marginBottom: 6,
                          background: cat.bg, color: cat.txt
                        }}>{p.categoria}</span>
                        <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.25, color: 'var(--text-primary)' }}>{p.nome}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3, fontFamily: 'monospace' }}>Cod: {p.codigo}</div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 6 }}>
                        <div style={{
                          fontSize: 10, fontWeight: estoqueBaixo ? 700 : 500,
                          color: estoqueBaixo ? 'var(--error-bg)' : 'var(--text-secondary)'
                        }}>{p.aFazer ? `Disponível: ${disponibilidade} porções` : `Est: ${disponibilidade}`}</div>
                        <div style={{
                          fontWeight: 700, fontSize: 16, color: semEstoque ? 'var(--text-tertiary)' : 'var(--accent-primary)',
                          fontVariantNumeric: 'tabular-nums'
                        }}>R$ {p.preco.toFixed(2).replace('.', ',')}</div>
                      </div>
                      {semEstoque && (
                        <div style={{
                          position: 'absolute', top: 6, right: 6, background: 'rgba(239, 68, 68, 0.1)',
                          color: 'var(--error-bg)', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 8
                        }}>SEM ESTOQUE</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        {/* COLUNA CARRINHO */}
        <div className={`pdv-cart-panel ${mobileCartOpen ? 'mobile-open' : ''}`}>
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            borderRadius: 16, padding: 16, position: 'sticky', top: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                📝 Carrinho
                {totalItens > 0 && (
                  <span style={{
                    background: 'var(--accent-primary)', color: '#fff',
                    padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700
                  }}>{totalItens}</span>
                )}
              </h3>
              <button type="button" className="pdv-mobile-cart-close" onClick={() => setMobileCartOpen(false)}>− Minimizar</button>
            </div>
            <label className="pdv-mobile-product-select">
              <span>Adicionar produto</span>
              <select
                value=""
                onChange={(event) => {
                  const produto = produtos.find((item) => item._id === event.target.value);
                  if (produto) selecionarProduto(produto);
                }}
              >
                <option value="">Selecione um produto...</option>
                {produtos.filter((produto) => produto.tipo === 'venda').map((produto) => (
                  <option key={produto._id} value={produto._id}>
                    {produto.nome} — {formatMoney(produto.preco)}
                  </option>
                ))}
              </select>
            </label>
            {carrinho.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)', fontSize: 14 }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🛒</div>
                Carrinho vazio<br />
                <span style={{ fontSize: 12 }}>Adicione produtos pelo seletor acima ou pelo catálogo</span>
              </div>
            ) : (
              <>
                <div className="pdv-cart-items" style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 14, paddingRight: 4 }}>
                  {carrinho.map((item, i) => {
                    const prod = produtos.find(p => p._id === item.produtoId);
                    const passoQuantidade = permiteFracionar(prod) ? 0.001 : 1;
                    const quantidadeExibida = quantidadesRascunho[i] ?? item.quantidade;
                    const quantidadeBase = Number(quantidadeExibida) > 0 ? Number(quantidadeExibida) : item.quantidade;
                    return (
                      <div key={i} style={{
                        padding: '10px 0', borderBottom: '1px solid var(--border-light)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div style={{ flex: 1, paddingRight: 8 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, color: 'var(--text-primary)' }}>{item.nome}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                              Cod: {item.codigo} | Disp: {prod?.estoque ?? '-'}
                            </div>
                            {item.modificadores?.length > 0 && <div style={{ fontSize: 11, color: 'var(--accent-primary)', marginTop: 4 }}>☕ {item.modificadores.join(' · ')}</div>}
                          </div>
                          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => removerItem(i)} style={{
                            background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error-bg)',
                            border: 'none', borderRadius: 8, padding: '6px 10px',
                            cursor: 'pointer', fontWeight: 700, fontSize: 12, minHeight: 32
                          }}>✕</button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden' }}>
                            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => alterarQtd(i, Math.max(passoQuantidade, quantidadeBase - passoQuantidade))} style={{
                              width: 40, height: 40, background: 'transparent', border: 'none',
                              cursor: 'pointer', fontSize: 18, fontWeight: 700, color: 'var(--text-secondary)'
                            }}>−</button>
                            <input type="number" min={passoQuantidade} step={passoQuantidade} value={quantidadeExibida}
                              onChange={(event) => setQuantidadesRascunho((atuais) => ({ ...atuais, [i]: event.target.value }))}
                              onBlur={(event) => alterarQtd(i, event.currentTarget.value)}
                              style={{
                                width: 48, textAlign: 'center', border: 'none',
                                borderLeft: '1px solid var(--border-color)',
                                borderRight: '1px solid var(--border-color)',
                                padding: '8px 4px', fontSize: 15, fontWeight: 700,
                                background: 'var(--input-bg)', color: 'var(--input-text)'
                              }} />
                            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => alterarQtd(i, quantidadeBase + passoQuantidade)} style={{
                              width: 40, height: 40, background: 'transparent', border: 'none',
                              cursor: 'pointer', fontSize: 18, fontWeight: 700, color: 'var(--text-secondary)'
                            }}>+</button>
                          </div>
                          <div style={{ flex: 1, textAlign: 'right' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Unitário</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: item.faixaDescontoQuantidade ? 'var(--success-bg)' : 'var(--accent-primary)', textAlign: 'right', padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: 8, minHeight: 38 }}>{formatMoney(item.precoUnitario)}</div>
                          </div>
                        </div>
                        {item.faixaDescontoQuantidade && <div style={{ marginTop: 6, color: 'var(--success-bg)', fontSize: 11, fontWeight: 700 }}>🏷️ PROMOÇÃO · Economia: {formatMoney(item.economiaQuantidade)}</div>}
                        {item.grupoDescontoAtivo && (
                          <div style={{ marginTop: 4, color: 'var(--accent-primary)', fontSize: 10, fontWeight: 700 }}>
                            🎯 DESCONTO POR GRUPO · {item.totalGrupo} itens · Economia: {formatMoney(item.economiaQuantidade)}
                          </div>
                        )}
                        {!item.grupoDescontoAtivo && item.faltamParaGrupo > 0 && item.grupoDescontoAtivo === false && item.totalGrupo > 0 && (
                          <div style={{ marginTop: 4, color: 'var(--warning-bg)', fontSize: 10, fontWeight: 600 }}>
                            ⏳ Faltam {item.faltamParaGrupo} item(ns) para o desconto por grupo
                          </div>
                        )}
                        <div style={{ textAlign: 'right', marginTop: 8, fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                          Subtotal: R$ {(item.precoUnitario * item.quantidade).toFixed(2).replace('.', ',')}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
                    <span>Subtotal</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                  </div>
                  {entregaPDV && Number(entregaPDV.taxaEntrega) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}><span>Taxa de entrega</span><span>{formatMoney(Number(entregaPDV.taxaEntrega))}</span></div>}
                  {descontoQuantidadeTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: 'var(--success-bg)', fontWeight: 700 }}><span>Desconto por quantidade</span><span>-{formatMoney(descontoQuantidadeTotal)}</span></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontWeight: 700, fontSize: 24, color: 'var(--accent-primary)' }}>
                    <span>Total</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>R$ {total.toFixed(2).replace('.', ',')}</span>
                  </div>
                  
                  <button onClick={finalizar} disabled={enviando} style={{
                    width: '100%', padding: '14px', background: 'var(--accent-primary)', color: '#fff',
                    border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
                    cursor: 'pointer', minHeight: 52
                  }}>☕ Abrir Comanda</button>
                  
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ==========================================
          ✅ MODAL DE SUCESSO
          ========================================== */}
      {modalSucesso && (
        <div onClick={() => setModalSucesso(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 99999, padding: 20
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-secondary)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 400,
            textAlign: 'center', boxShadow: 'var(--shadow-lg)',
            color: 'var(--text-primary)'
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', margin: '0 auto 16px',
              background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36
            }}>✅</div>
            <h3 style={{ margin: '0 0 4px', fontSize: 20, color: 'var(--text-primary)' }}>Venda Finalizada!</h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)' }}>
              Pedido <strong style={{ color: 'var(--text-primary)' }}>#{modalSucesso.numero}</strong>
              <br />
              Total: <strong style={{ color: 'var(--accent-primary)', fontSize: 16 }}>
                R$ {modalSucesso.total.toFixed(2).replace('.', ',')}
              </strong>
            </p>
            <div style={{ borderTop: '1px solid rgba(15,23,42,.08)', marginBottom: 20 }}></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => imprimirCupom(modalSucesso)} style={{
                width: '100%', padding: '14px', background: 'var(--brand-brown)', color: '#fff',
                border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
                cursor: 'pointer', minHeight: 52, display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: 10
              }}>🖨️ Imprimir Cupom</button>
              <button onClick={() => enviarWhatsApp(modalSucesso)} style={{
                width: '100%', padding: '14px', background: 'var(--success-bg)', color: '#fff',
                border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
                cursor: 'pointer', minHeight: 52, display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: 10
              }}>💬 Enviar pelo WhatsApp</button>
              <button onClick={novaVenda} style={{
                width: '100%', padding: '13px', background: 'var(--accent-light)', color: 'var(--accent-primary)',
                border: '1.5px solid var(--accent-border)', borderRadius: 12,
                fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 48
              }}>🛒 Iniciar Nova Venda</button>
              <button onClick={() => setModalSucesso(null)} style={{
                width: '100%', padding: '10px', background: 'transparent', color: 'var(--text-secondary)',
                border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500,
                cursor: 'pointer', minHeight: 36
              }}>Fechar</button>
            </div>
          </div>
        </div>
      )}


      <style>{`
        @media (min-width: 1024px) {
          .pdv-grid { grid-template-columns: 2fr 1fr !important; }
        }
        @media (min-width: 768px) {
          .busca-grid { grid-template-columns: 1.3fr 1fr 1.1fr 1fr !important; }
          .pdv-header-desktop { display: block !important; }
        }
        @media (max-width: 767px) {
          .pdv-header-desktop { display: none !important; }
          .pdv-mobile-cart-trigger { display: flex !important; }
          .pdv-grid { gap: 10px !important; min-width: 0; }
          .pdv-grid > div { min-width: 0; }
          .pdv-cart-panel { display: none; }
          .pdv-cart-panel.mobile-open { display: block; position: static; order: -1; overflow: visible; padding: 0; background: transparent; }
          .pdv-cart-panel.mobile-open > div { min-height: 0; border-radius: 14px !important; }
          .pdv-cart-panel.mobile-open .pdv-cart-items { max-height: none !important; overflow: visible !important; }
          .pdv-mobile-cart-close { display: inline-flex !important; width: auto; min-width: 44px; height: 38px; padding: 0 10px; font-size: 12px; font-weight: 700; }
          .pdv-cart-panel.mobile-open .pdv-mobile-product-select { display: grid; gap: 6px; margin: 0 0 14px; color: var(--text-secondary); font-size: 12px; font-weight: 700; }
          .pdv-mobile-product-select select { width: 100%; min-height: 48px; padding: 10px 12px; border: 1.5px solid var(--border-color); border-radius: 10px; background: var(--input-bg); color: var(--input-text); font-size: 16px; }
          .pdv-grid > div > div { padding: 12px !important; border-radius: 12px !important; margin-bottom: 10px !important; }
          .pdv-grid .product-card { min-height: 96px !important; padding: 10px !important; }
          .pdv-grid [style*="max-height: 420px"] { max-height: 280px !important; }
          .pdv-grid [style*="position: sticky"] { position: static !important; }
        }
        .product-card:active { transform: scale(0.97); }
        .product-card-added { animation: item-added .35s ease; border-color: var(--accent-primary) !important; }
        .pdv-mobile-cart-trigger, .pdv-mobile-cart-close { display: none; }
        .pdv-mobile-product-select { display: none; }
        .pdv-mobile-cart-trigger { width: 100%; min-height: 50px; margin-bottom: 10px; padding: 10px 14px; align-items: center; justify-content: space-between; gap: 12px; border: 0; border-radius: 12px; background: var(--accent-primary); color: #fff; font: inherit; font-size: 14px; cursor: pointer; box-shadow: var(--shadow-sm); }
        .pdv-mobile-cart-trigger strong { font-size: 13px; white-space: nowrap; }
        .pdv-mobile-cart-close { align-items: center; justify-content: center; width: 38px; height: 38px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-tertiary); color: var(--text-primary); font-size: 24px; cursor: pointer; }
        @keyframes item-added { 50% { transform: scale(1.035); box-shadow: 0 0 0 4px var(--accent-light); } }
      `}</style>
    </div>
  );
}
