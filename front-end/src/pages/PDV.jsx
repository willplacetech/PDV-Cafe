import FieldLabel from '../components/FieldLabel.jsx';
import SearchableSelect from '../components/SearchableSelect.jsx';
import { useFormasPagamento } from '../context/FormasPagamentoDefinition.js';
import { useCallback, useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api.jsx';
import { permiteFracionar } from '../utils/quantidadeVenda.js';
import { estoqueDisponivelComanda } from '../utils/estoqueComanda.js';
import { useToast } from '../components/useToast.js';
import { compartilharNotaWhatsApp } from '../utils/notaVenda.js';
import useFilaOffline from '../hooks/useFilaOffline.js';
import DeliveryPDV from '../components/DeliveryPDV.jsx';
import MesasDrawer from '../components/atendimento/MesasDrawer.jsx';
import { useComanda } from '../context/ComandaContext.jsx';
import { totalPago } from '../utils/formasPagamento.jsx';
import { calcularMultiplicadorFidelidade, COMANDAS_POR_MULTIPLICADOR_FIDELIDADE } from '../utils/fidelidade.js';
import {
  carregarConfiguracaoImpressao,
  carregarPreferenciaImpressora,
  imprimirCupomVenda,
  imprimirPedidoCozinha,
} from '../services/impressaoService.js';

const ENDERECO_VAZIO = { rua: '', numero: '', bairro: '', complemento: '', referencia: '' };

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
  const { formasPagamento: FORMAS_PAGAMENTO } = useFormasPagamento();
  const { comandaAtual, setComandaAtual, setTipo, setMesa, salvarComandaAberta, fecharComanda, carregarComanda, limparComanda } = useComanda();
  const carrinho = comandaAtual.itens;
  const [produtos, setProdutos] = useState([]);
  const [maisVendidos, setMaisVendidos] = useState([]);
  const [quantidadesRascunho, setQuantidadesRascunho] = useState({});
  const [precosRascunho, setPrecosRascunho] = useState({});
  const [transferindoMesa, setTransferindoMesa] = useState(false);
  const [busca, setBusca] = useState('');
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState(() => String(comandaAtual.clienteId || ''));
  const [clienteNome, setClienteNome] = useState(() => comandaAtual.clienteNome || '');
  const [grupoAtivo, setGrupoAtivo] = useState('Todos');
  const [feedbackProduto, setFeedbackProduto] = useState(null);
  const [modalSucesso, setModalSucesso] = useState(null);
  const [nfceLoading, setNfceLoading] = useState(false);
  const [comprovanteEnviando, setComprovanteEnviando] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const { showToast } = useToast();
  const { enfileirar } = useFilaOffline();
  const [entregaPDV, atualizarEntregaPDV] = useState(() => comandaAtual.entrega ? {
    ...comandaAtual.entrega,
    enderecoAlternativo: comandaAtual.entrega.endereco || { ...ENDERECO_VAZIO },
    usarEnderecoCadastrado: false,
    taxaEntrega: Number(comandaAtual.taxaEntrega || comandaAtual.entrega.taxaEntrega || 0),
  } : comandaAtual.tipo === 'delivery' ? { telefone: '', endereco: { ...ENDERECO_VAZIO }, enderecoAlternativo: { ...ENDERECO_VAZIO }, usarEnderecoCadastrado: false, taxaEntrega: 0 } : null);
  const setEntregaPDV = (value) => {
    const entrega = typeof value === 'function' ? value(entregaPDV) : value;
    atualizarEntregaPDV(entrega);
    setComandaAtual(atual => ({ ...atual, entrega, taxaEntrega: Number(entrega?.taxaEntrega || 0), status: 'rascunho' }));
  };

  const navigate = useNavigate();
  const selectClienteRef = useRef(null);
  const envioRef = useRef(false);
  const idempotenciaRef = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const [mesasDrawerOpen, setMesasDrawerOpen] = useState(false);
  const [comandasAbertasCount, setComandasAbertasCount] = useState(0);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [metodoPagamento, setMetodoPagamento] = useState('');
  const [descontoFechamento, setDescontoFechamento] = useState(comandaAtual.pagamentoPendente?.desconto ?? '0');
  const [nomeFechamento, setNomeFechamento] = useState(comandaAtual.pagamentoPendente?.nome || '');
  const [telefoneFechamento, setTelefoneFechamento] = useState(comandaAtual.pagamentoPendente?.telefone || '');
  const [comandaPagamento, setComandaPagamento] = useState(() => comandaAtual.pagamentoPendente ? { ...comandaAtual, valorTotal: comandaAtual.registroOriginal?.valorTotal, ...comandaAtual.pagamentoPendente } : null);
  const pagamentoPreparadoRef = useRef(comandaAtual.pagamentoPendente ? { ...comandaAtual, ...comandaAtual.pagamentoPendente } : null);
  const consumoPreparadoRef = useRef(comandaAtual.consumoInternoPendente ? comandaAtual : null);
  const fechamentoPendente = Boolean(comandaPagamento?.metodoPagamento || comandaAtual.consumoInternoPendente);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('mesas') !== 'abrir') return;
    const timer = window.setTimeout(() => {
      setMesasDrawerOpen(true);
      const parametros = new URLSearchParams(searchParams);
      parametros.delete('mesas');
      setSearchParams(parametros, { replace: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let ativo = true;
    const carregarContagem = async () => {
      try {
        const { data } = await api.get('/comandas?status=aberta', { pdvSilenciosa: true });
        if (ativo) setComandasAbertasCount(Array.isArray(data) ? data.length : 0);
      } catch (error) {
        console.warn('[Comandas] Não foi possível atualizar o total de comandas abertas.', error.response?.status || error.code || error.message);
      }
    };
    void carregarContagem();
    const intervalo = window.setInterval(() => { void carregarContagem(); }, 30000);
    return () => { ativo = false; window.clearInterval(intervalo); };
  }, []);


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
      if (item.precoUnitarioManual !== undefined) return {
        ...item, precoUnitario: item.precoUnitarioManual, economiaQuantidade: 0,
        faixaDescontoQuantidade: null, grupoDescontoAtivo: false, faltamParaGrupo: 0,
      };
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

  const setCarrinho = (atualizar) => setComandaAtual(atual => ({
    ...atual,
    itens: recalcularPrecosCarrinho(typeof atualizar === 'function' ? atualizar(atual.itens) : atualizar),
    status: 'rascunho',
  }));

  const adicionarItem = (prod, opcoes = {}) => {
    if (prod.tipo !== 'venda') return showToast('Este item não pode entrar no PDV', 'warning');
    const estoqueDisponivel = estoqueDisponivelComanda(prod, comandaAtual);
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
    setMobileCartOpen(true);
    setFeedbackProduto(prod._id);
    tocarFeedback();
    window.setTimeout(() => setFeedbackProduto(null), 350);
  };

  const selecionarProduto = (prod) => {
    if (fechamentoPendente) return showToast('Retome o fechamento pendente antes de adicionar produtos.', 'warning');
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
    const estoqueDisponivel = estoqueDisponivelComanda(prod, comandaAtual);
    if (!prod.permitirVendaSemInsumo && quantidadeOutrasLinhas + quantidade > estoqueDisponivel) return showToast(`Máximo: ${estoqueDisponivel}`, 'warning');
    novos[idx].quantidade = quantidade;
    setCarrinho(recalcularPrecosCarrinho(novos));
    setQuantidadesRascunho((atuais) => { const proximas = { ...atuais }; delete proximas[idx]; return proximas; });
  };


  const alterarPreco = (idx, valor) => {
    if (precosRascunho[idx] === undefined) return;
    const preco = Number(String(valor).replace(',', '.'));
    setPrecosRascunho({});
    if (String(valor).trim() === '' || !Number.isFinite(preco) || preco < 0) {
      showToast('Informe um preço unitário válido.', 'warning');
      return;
    }
    setCarrinho(itens => itens.map((item, index) => index === idx ? {
      ...item, precoUnitario: Math.round(preco * 100) / 100, precoUnitarioManual: Math.round(preco * 100) / 100,
    } : item));
  };

  const removerItem = (idx) => {
    setCarrinho((atuais) => recalcularPrecosCarrinho(atuais.filter((_, i) => i !== idx)));
    setQuantidadesRascunho({});
    setPrecosRascunho({});
  };


  const clienteSelecionado = clientes.find(c => c._id === clienteId);
  const consumoInterno = Boolean(clienteSelecionado?.clienteInterno);
  const subtotal = carrinho.reduce((ac, i) => ac + i.precoUnitario * i.quantidade, 0);
  const total = consumoInterno ? 0 : subtotal + (entregaPDV ? Number(entregaPDV.taxaEntrega) || 0 : 0);
  const comandasFidelidade = Number(clienteSelecionado?.cafesFidelidade || 0);
  const multiplicadorFidelidade = calcularMultiplicadorFidelidade(comandasFidelidade);
  const progressoFidelidade = Math.max(0, comandasFidelidade) % COMANDAS_POR_MULTIPLICADOR_FIDELIDADE;
  const jaRecebido = totalPago(comandaAtual.registroOriginal?.historicoPagamentos);
  const totalFechamento = Math.max(0, subtotal + Number(comandaPagamento?.taxaEntrega || 0) - (Number(descontoFechamento) || 0));
  const saldoFechamento = Math.max(0, totalFechamento - jaRecebido);
  const descontoQuantidadeTotal = carrinho.reduce((acumulado, item) => acumulado + Number(item.economiaQuantidade || 0), 0);
  const totalItens = carrinho.reduce((ac, i) => ac + i.quantidade, 0);
  const clienteTemEnderecoCadastrado = ['rua', 'numero', 'bairro'].every(campo => clienteSelecionado?.enderecoEntrega?.[campo]?.trim());
  const selecionarCliente = (id) => {
    if (fechamentoPendente) return;
    const cliente = clientes.find(c => c._id === id);
    setClienteId(id);
    setComandaAtual(atual => ({ ...atual, clienteId: id || undefined, clienteNome: cliente?.nome || atual.clienteNome, status: 'rascunho' }));
    if (!entregaPDV) return;
    const enderecoCadastrado = cliente?.enderecoEntrega || {};
    const temEnderecoCadastrado = ['rua', 'numero', 'bairro'].every(campo => enderecoCadastrado[campo]?.trim());
    setEntregaPDV(atual => atual ? {
      ...atual,
      telefone: cliente?.telefone || '',
      endereco: temEnderecoCadastrado ? { ...enderecoCadastrado } : { ...ENDERECO_VAZIO },
      enderecoAlternativo: { ...ENDERECO_VAZIO },
      usarEnderecoCadastrado: temEnderecoCadastrado,
    } : atual);
  };


  const finalizar = async () => {
    if (envioRef.current) return;
    if (!carrinho.length) return showToast('Carrinho vazio!', 'warning');
    const enderecoEntrega = entregaPDV?.usarEnderecoCadastrado ? clienteSelecionado?.enderecoEntrega : entregaPDV?.endereco;
    if (entregaPDV && (!String(clienteSelecionado?.nome || clienteNome || '').trim() || !entregaPDV.telefone.trim() || !['rua', 'numero', 'bairro'].every(campo => enderecoEntrega?.[campo]?.trim()) || !Number.isFinite(Number(entregaPDV.taxaEntrega)) || Number(entregaPDV.taxaEntrega) < 0)) return showToast('Informe nome, telefone e endereco completo para entrega.', 'warning');
    envioRef.current = true;
    setEnviando(true);

    const payload = {
      clienteId: clienteId || undefined,
      clienteNome: clienteSelecionado?.nome || clienteNome.trim() || 'Cliente não identificado',
      clienteTelefone: entregaPDV?.telefone || clienteSelecionado?.telefone || '',
      itens: carrinho.map((item) => ({
        precoUnitarioManual: item.precoUnitarioManual,
        produtoId: item.produtoId,
        quantidade: Number(item.quantidade),
        modificadores: item.modificadores || [],
      })),
    };

    if (entregaPDV) payload.entrega = {
      ...entregaPDV,
      endereco: enderecoEntrega,
      preservarEnderecoCadastrado: Boolean(clienteTemEnderecoCadastrado && entregaPDV.usarEnderecoCadastrado === false),
      taxaEntrega: Number(entregaPDV.taxaEntrega),
    };

    const assinatura = JSON.stringify(payload);
    if (idempotenciaRef.current?.assinatura !== assinatura) {
      const chave = globalThis.crypto.randomUUID();
      idempotenciaRef.current = { assinatura, chave };
    }
    const idTemporario = idempotenciaRef.current.chave;
    payload.idTemporario = idTemporario;

    const limparCarrinho = () => {
      idempotenciaRef.current = null;
      limparComanda();
      setQuantidadesRascunho({});
      setPrecosRascunho({});
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

  const dadosComandaParaSalvar = () => {
    const enderecoEntrega = entregaPDV?.usarEnderecoCadastrado ? clienteSelecionado?.enderecoEntrega : entregaPDV?.endereco;
    if (!comandaAtual._id && !idempotenciaRef.current?.chave) {
      idempotenciaRef.current = { assinatura: '', chave: globalThis.crypto.randomUUID() };
    }
    return {
      ...comandaAtual,
      idTemporario: comandaAtual.idTemporario || idempotenciaRef.current?.chave,
      clienteId: clienteId || undefined,
      clienteNome: clienteSelecionado?.nome || clienteNome.trim() || comandaAtual.clienteNome || 'Cliente não identificado',
      clienteTelefone: entregaPDV?.telefone || clienteSelecionado?.telefone || comandaAtual.clienteTelefone || '',
      entrega: entregaPDV ? {
        ...entregaPDV,
        endereco: enderecoEntrega || ENDERECO_VAZIO,
        preservarEnderecoCadastrado: Boolean(clienteTemEnderecoCadastrado && entregaPDV.usarEnderecoCadastrado === false),
        taxaEntrega: Number(entregaPDV.taxaEntrega || 0),
      } : undefined,
    };
  };

  const salvarComandaAtual = async () => {
    if (envioRef.current) return null;
    envioRef.current = true;
    try {
      if (!validarDadosEntrega()) return null;
      setEnviando(true);
      const comanda = await salvarComandaAberta(dadosComandaParaSalvar());
      await carregarDados();
      showToast(`Comanda #${comanda.numero} salva em aberto`, 'success');
      return comanda;
    } catch (error) {
      showToast(error.response?.data?.msg || error.message || 'Não foi possível salvar a comanda.', 'error');
      return null;
    } finally {
      envioRef.current = false;
      setEnviando(false);
    }
  };

  const validarDadosEntrega = () => {
    if (!entregaPDV) return true;
    const enderecoEntrega = entregaPDV.usarEnderecoCadastrado ? clienteSelecionado?.enderecoEntrega : entregaPDV.endereco;
    const dadosValidos = Boolean(
      String(clienteSelecionado?.nome || clienteNome || '').trim()
      && entregaPDV.telefone.trim()
      && ['rua', 'numero', 'bairro'].every(campo => enderecoEntrega?.[campo]?.trim())
      && Number.isFinite(Number(entregaPDV.taxaEntrega))
      && Number(entregaPDV.taxaEntrega) >= 0
    );
    if (!dadosValidos) showToast('Informe nome, telefone e endereço completo para entrega.', 'warning');
    return dadosValidos;
  };

  const cancelarComandaAtual = async () => {
    if (envioRef.current || fechamentoPendente) return;
    const confirmacao = comandaAtual._id
      ? `Cancelar a comanda #${comandaAtual.numero}?`
      : 'Cancelar esta comanda e descartar os itens?';
    if (!window.confirm(confirmacao)) return;
    envioRef.current = true;
    setEnviando(true);
    try {
      if (comandaAtual._id) await api.patch(`/comandas/${comandaAtual._id}/cancelar`);
      limparComanda();
      idempotenciaRef.current = null;
      pagamentoPreparadoRef.current = null;
      consumoPreparadoRef.current = null;
      setComandaPagamento(null);
      setPaymentOpen(false);
      setMobileCartOpen(false);
      setQuantidadesRascunho({});
      setPrecosRascunho({});
      setClienteId('');
      setClienteNome('');
      setEntregaPDV(null);
      setTransferindoMesa(false);
      void carregarDados();
      showToast('Comanda cancelada.', 'success');
    } catch (error) {
      showToast(error.response?.data?.msg || error.message || 'Não foi possível cancelar a comanda.', 'error');
    } finally {
      envioRef.current = false;
      setEnviando(false);
    }
  };

  const abrirPagamento = () => {
    if (!carrinho.length) return showToast('Adicione itens à comanda antes de fechar a venda.', 'warning');
    if (!validarDadosEntrega()) return;
    if (consumoInterno) {
      void registrarConsumoInterno();
      return;
    }
    if (pagamentoPreparadoRef.current) {
      setPaymentOpen(true);
      return;
    }
    const dados = dadosComandaParaSalvar();
    setComandaPagamento({ ...dados, valorTotal: total });
    setDescontoFechamento('0');
    setNomeFechamento(dados.clienteNome || '');
    setTelefoneFechamento(dados.clienteTelefone || '');
    setMetodoPagamento('');
    setPaymentOpen(true);
  };

  const registrarConsumoInterno = async () => {
    if (envioRef.current) return;
    envioRef.current = true;
    setEnviando(true);
    try {
      const comanda = consumoPreparadoRef.current || await salvarComandaAberta(dadosComandaParaSalvar());
      consumoPreparadoRef.current = comanda;
      setComandaAtual(atual => ({ ...atual, consumoInternoPendente: true }));
      const resultado = await fecharComanda({ utilizacaoInterna: true }, comanda);
      consumoPreparadoRef.current = null;
      setModalSucesso(resultado.pedido);
      idempotenciaRef.current = null;
      setQuantidadesRascunho({});
      setClienteId('');
      setClienteNome('');
      setEntregaPDV(null);
      void carregarDados();
      showToast('Consumo interno registrado com baixa de estoque e custo, sem pagamento.', 'success');
    } catch (error) {
      const status = error.response?.status;
      if (status && status < 500 && status !== 408) {
        consumoPreparadoRef.current = null;
        setComandaAtual(atual => ({ ...atual, consumoInternoPendente: false }));
      }
      showToast(error.response?.data?.msg || error.message || 'Não foi possível registrar o consumo interno.', 'error');
    } finally {
      envioRef.current = false;
      setEnviando(false);
    }
  };

  const confirmarPagamento = async () => {
    if (envioRef.current) return;
    if (!metodoPagamento && !pagamentoPreparadoRef.current) {
      showToast('Escolha a forma de pagamento.', 'warning');
      return;
    }
    const desconto = Number(String(descontoFechamento).replace(',', '.'));
    if (!Number.isFinite(desconto) || desconto < 0 || desconto > subtotal) {
      showToast('Informe um desconto entre zero e o subtotal dos itens.', 'warning');
      return;
    }
    if (totalFechamento < jaRecebido) {
      showToast('O desconto não pode reduzir o total abaixo do valor já recebido. Regularize o estorno primeiro.', 'warning');
      return;
    }
    envioRef.current = true;
    try {
      setEnviando(true);
      const dados = comandaPagamento || dadosComandaParaSalvar();
      const comandaParaFechar = pagamentoPreparadoRef.current || await salvarComandaAberta({ ...dados, clienteNome: nomeFechamento.trim() || dados.clienteNome });
      pagamentoPreparadoRef.current = pagamentoPreparadoRef.current || {
        ...comandaParaFechar,
        metodoPagamento,
        desconto,
        nome: nomeFechamento.trim(),
        telefone: telefoneFechamento.trim(),
        enderecoEntrega: comandaParaFechar.entrega?.endereco,
      };
      const preparado = pagamentoPreparadoRef.current;
      const pagamento = { metodoPagamento: preparado.metodoPagamento, desconto: preparado.desconto, nome: preparado.nome, telefone: preparado.telefone, enderecoEntrega: preparado.enderecoEntrega };
      setComandaPagamento(atual => ({ ...atual, ...pagamento }));
      setComandaAtual(atual => ({ ...atual, pagamentoPendente: pagamento }));
      const resultado = await fecharComanda(pagamento, comandaParaFechar);
      setModalSucesso({ ...resultado.pedido, comandaNumero: comandaParaFechar.numero, comandaEncerrada: comandaParaFechar, comprovanteNome: preparado.nome, comprovanteTelefone: preparado.telefone });
      idempotenciaRef.current = null;
      setQuantidadesRascunho({});
      setPaymentOpen(false);
      pagamentoPreparadoRef.current = null;
      setComandaPagamento(null);
      setClienteId('');
      setClienteNome('');
      setEntregaPDV(null);
      void carregarDados();
      showToast('Comanda fechada e pagamento registrado.', 'success');
    } catch (error) {
      const status = error.response?.status;
      if (status && status < 500 && status !== 408) {
        pagamentoPreparadoRef.current = null;
        setComandaPagamento(atual => ({ ...atual, metodoPagamento: undefined }));
        setComandaAtual(atual => ({ ...atual, pagamentoPendente: undefined }));
      }
      showToast(error.response?.data?.msg || error.message || 'Não foi possível fechar a comanda.', 'error');
    } finally {
      envioRef.current = false;
      setEnviando(false);
    }
  };

  const selecionarComandaPainel = async selecao => {
    if (fechamentoPendente) {
      setMesasDrawerOpen(false);
      setPaymentOpen(Boolean(comandaPagamento?.metodoPagamento));
      showToast('Retome o fechamento pendente antes de trocar de comanda.', 'warning');
      return;
    }
    setMesasDrawerOpen(false);
    try {
      if (transferindoMesa) {
        if (!selecao.mesa) { showToast('Selecione uma mesa livre.', 'warning'); return; }
        if (selecao.comanda && selecao.comanda._id !== comandaAtual._id) {
          showToast('Esta mesa já está ocupada. Escolha uma mesa livre.', 'warning');
          return;
        }
        const dados = { ...dadosComandaParaSalvar(), tipo: 'mesa', mesaId: selecao.mesa.id, mesaNumero: selecao.mesa.numero };
        const salva = await salvarComandaAberta(dados);
        setMesa(selecao.mesa.id, selecao.mesa.numero);
        setTransferindoMesa(false);
        showToast(`Comanda #${salva.numero} transferida para Mesa ${selecao.mesa.numero}.`, 'success');
        return;
      }
      setMobileCartOpen(true);
      setQuantidadesRascunho({});
      setPrecosRascunho({});
      if (selecao.comanda) {
        if (comandaAtual._id !== selecao.comanda._id && carrinho.length) {
          const salva = await salvarComandaAtual();
          if (!salva) return;
        } else if (comandaAtual._id === selecao.comanda._id && comandaAtual.status === 'rascunho') {
          const salva = await salvarComandaAtual();
          if (!salva) return;
          return;
        }
        const carregada = await carregarComanda(selecao.comanda._id);
        setClienteId(String(carregada.clienteId || ''));
        setClienteNome(carregada.clienteNome || '');
        const entrega = carregada.registroOriginal?.entrega;
        setEntregaPDV(carregada.tipo === 'delivery' ? {
          telefone: entrega?.telefone || carregada.clienteTelefone || '',
          endereco: entrega?.endereco || { ...ENDERECO_VAZIO },
          enderecoAlternativo: entrega?.endereco || { ...ENDERECO_VAZIO },
          usarEnderecoCadastrado: false,
          taxaEntrega: Number(carregada.taxaEntrega || 0),
        } : null);
        return;
      }

      if (selecao.mesa) {
        const mesaAtual = String(comandaAtual.mesaNumero || '') === String(selecao.mesa.numero);
        if (comandaAtual._id && !mesaAtual) {
          const salva = carrinho.length ? await salvarComandaAtual() : true;
          if (!salva) return;
          limparComanda();
          setClienteId('');
          setClienteNome('');
          setEntregaPDV(null);
        } else if (carrinho.length && !mesaAtual && !window.confirm(`Adicionar os itens atuais à Mesa ${selecao.mesa.numero}?`)) {
          return;
        }
        setMesa(selecao.mesa.id, selecao.mesa.numero);
        return;
      }

      if (selecao.tipoAtendimento) {
        if (selecao.tipoAtendimento === comandaAtual.tipo) return;
        if (comandaAtual._id) {
          const salva = carrinho.length ? await salvarComandaAtual() : true;
          if (!salva) return;
          limparComanda();
          setClienteId('');
          setClienteNome('');
          setEntregaPDV(null);
        } else if (carrinho.length && !window.confirm('Manter os itens no novo tipo de atendimento?')) {
          return;
        }
        setTipo(selecao.tipoAtendimento);
        setEntregaPDV(selecao.tipoAtendimento === 'delivery' ? {
          telefone: clienteSelecionado?.telefone || '',
          endereco: clienteSelecionado?.enderecoEntrega || { ...ENDERECO_VAZIO },
          enderecoAlternativo: { ...ENDERECO_VAZIO },
          usarEnderecoCadastrado: Boolean(clienteTemEnderecoCadastrado),
          taxaEntrega: 0,
        } : null);
      }
    } catch (error) {
      showToast(error.response?.data?.msg || error.message || 'Não foi possível trocar de comanda.', 'error');
    }
  };


  // ==========================================
  // 🖨️ IMPRIMIR CUPOM
  // ==========================================
  const iniciarNovaComanda = async () => {
    if (envioRef.current) return;
    if (carrinho.length && !await salvarComandaAtual()) return;
    pagamentoPreparadoRef.current = null;
    setComandaPagamento(null);
    limparComanda();
    idempotenciaRef.current = null;
    setClienteId('');
    setClienteNome('');
    setEntregaPDV(null);
    setQuantidadesRascunho({});
    setPrecosRascunho({});
    setMobileCartOpen(false);
  };

  const imprimirComandaAtual = async () => {
    const salva = await salvarComandaAtual();
    if (salva) await imprimirCupom({ ...salva.registroOriginal, comandaNumero: salva.numero, total: salva.registroOriginal.valorTotal });
  };

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
  const enviarWhatsApp = async (pedido) => {
    if (!pedido || comprovanteEnviando) return;
    setComprovanteEnviando(true);
    const nome = pedido.comprovanteNome ?? pedido.clienteNome;
    const telefone = pedido.comprovanteTelefone ?? pedido.clienteTelefone ?? '';
    const comprovante = { ...pedido, clienteNome: nome, clienteTelefone: telefone };
    try {
      if (telefone.trim() && pedido.comandaEncerrada?._id && !pedido.utilizacaoInterna) {
        try {
          await api.patch(`/comandas/${pedido.comandaEncerrada._id}/cliente`, {
            nome, telefone, enderecoEntrega: pedido.comandaEncerrada.entrega?.endereco,
          });
          setModalSucesso(atual => atual?._id === pedido._id ? { ...atual, clienteNome: nome, clienteTelefone: telefone } : atual);
        } catch (error) {
          showToast(error.response?.data?.msg || 'Não foi possível atualizar o cadastro do cliente.', 'warning');
        }
      }
      compartilharNotaWhatsApp(comprovante, { comandaNumero: pedido.comandaEncerrada?.numero }, telefone);
    } finally {
      setComprovanteEnviando(false);
    }
  };

  const emitirNfce = async () => {
    if (!modalSucesso?._id || modalSucesso.utilizacaoInterna || nfceLoading || modalSucesso.nfce?.status === 'autorizada') return;
    const pedidoId = modalSucesso._id;
    setNfceLoading(true);
    try {
      const { data } = await api.post(`/fiscal/orders/${pedidoId}/emitir`);
      setModalSucesso(atual => atual?._id === pedidoId ? { ...atual, ...data.order } : atual);
      showToast(data.avisos?.length ? `NFC-e autorizada com avisos: ${data.avisos.join('; ')}` : 'NFC-e autorizada', data.avisos?.length ? 'warning' : 'success');
    } catch (error) {
      const nfce = error.response?.data?.nfce;
      if (nfce) setModalSucesso(atual => atual?._id === pedidoId ? { ...atual, nfce } : atual);
      const faltantes = error.response?.data?.faltantes || [];
      const mensagem = error.response?.data?.msg || 'Não foi possível emitir a NFC-e';
      showToast(faltantes.length ? `${mensagem}: ${faltantes.join(', ')}` : mensagem, error.response?.status === 409 ? 'warning' : 'error');
    } finally {
      setNfceLoading(false);
    }
  };

  const abrirDanfe = () => {
    const pdf = modalSucesso?.nfce?.danfePdf;
    if (pdf) window.open(`data:application/pdf;base64,${pdf}`, '_blank', 'noopener,noreferrer');
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
    return normalizarTexto(produto.categoria) === normalizarTexto(grupoAtivo);
  });
  const rotuloComandaAtual = comandaAtual.tipo === 'mesa'
    ? `Mesa ${comandaAtual.mesaNumero || '—'}`
    : comandaAtual.tipo === 'delivery'
      ? `Delivery ${clienteSelecionado?.nome || clienteNome || comandaAtual.clienteNome || ''}`.trim()
      : comandaAtual.tipo === 'retirada' ? 'Retirada' : 'Balcão';


  return (
    <div>
      {/* Cabeçalho PDV */}
      <div className="pdv-header-desktop page-heading">
        <div>
          <h1>☕ Atendimento</h1>
          <p>Monte o pedido diretamente na comanda selecionada.</p>
        </div>
        <button type="button" className="pdv-mesas-trigger" onClick={() => setMesasDrawerOpen(true)}>🪑 Mesas · {comandasAbertasCount} abertas</button>
      </div>
      {!mobileCartOpen && (carrinho.length > 0 || comandaAtual._id) && <button type="button" className="pdv-mobile-cart-trigger" onClick={() => setMobileCartOpen(true)} aria-expanded={false}>
        <span>📝 Comanda</span>
        <strong>{totalItens} {totalItens === 1 ? 'item' : 'itens'} · R$ {total.toFixed(2).replace('.', ',')}</strong>
      </button>}
      {!mobileCartOpen && <button type="button" className="pdv-mobile-mesas-trigger" onClick={() => setMesasDrawerOpen(true)}>🪑 Mesas · {comandasAbertasCount}</button>}
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
                {clienteSelecionado && <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 9, background: 'var(--accent-light)', color: 'var(--text-secondary)', fontSize: 11 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Fidelidade</strong>
                    <span>{comandasFidelidade} comandas · x{multiplicadorFidelidade}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                    <div style={{ width: `${(progressoFidelidade / COMANDAS_POR_MULTIPLICADOR_FIDELIDADE) * 100}%`, height: '100%', background: 'var(--accent-secondary)', transition: 'width .3s ease' }} />
                  </div>
                  <span style={{ display: 'block', marginTop: 4 }}>
                    Faltam {COMANDAS_POR_MULTIPLICADOR_FIDELIDADE - progressoFidelidade} para x{multiplicadorFidelidade + 1}
                  </span>
                </div>}
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Cliente</label>
                <SearchableSelect
                  ref={selectClienteRef}
                  value={clienteId}
                  onChange={e => selecionarCliente(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 14px', border: '1.5px solid var(--border-color)',
                    borderRadius: 10, fontSize: 16, boxSizing: 'border-box',
                    outline: 'none', background: 'var(--input-bg)', color: 'var(--input-text)', minHeight: 48
                  }}>
                  <option value="">Cliente não identificado</option>
                  {clientes.map(c => <option key={c._id} value={c._id}>{c.nome}</option>)}
                </SearchableSelect>
                {consumoInterno && <small role="status">Consumo da equipe: sem pagamento, com baixa de estoque e registro de custo.</small>}
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Nome no atendimento</label>
                <input disabled={fechamentoPendente} placeholder={comandaAtual.tipo === 'delivery' ? 'Digite o nome' : 'Digite o nome (opcional)'} required={comandaAtual.tipo === 'delivery'} value={clienteNome} onChange={e => { setClienteNome(e.target.value); setComandaAtual(atual => ({ ...atual, clienteNome: e.target.value, status: 'rascunho' })); }} style={{ width: '100%', padding: '12px 14px', border: '1.5px solid var(--border-color)', borderRadius: 10, fontSize: 16, boxSizing: 'border-box', outline: 'none', background: 'var(--input-bg)', color: 'var(--input-text)', minHeight: 48 }} />
              </div>
            </div>
          </div>
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            borderRadius: 16, padding: 16
          }}>
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
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 20px', fontSize: 14 }}>
                {grupoAtivo === 'Todos'
                  ? (termoBusca ? 'Nenhum produto encontrado para esta busca.' : 'Nenhum produto cadastrado.')
                  : `Nenhum produto em ${grupoAtivo}${termoBusca ? ' para esta busca' : ''}.`}
              </p>
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
        {mobileCartOpen && <div className="pdv-mobile-cart-backdrop" onClick={() => setMobileCartOpen(false)} aria-hidden="true" />}
        <div className={`pdv-cart-panel ${mobileCartOpen ? 'mobile-open' : ''}`}>
          {comandaPagamento?.metodoPagamento && !paymentOpen && <p role="status">Pagamento aguardando confirmação. <button type="button" onClick={abrirPagamento}>Retomar pagamento</button></p>}
          {comandaAtual.consumoInternoPendente && <p role="status">Consumo interno aguardando confirmação. <button type="button" onClick={registrarConsumoInterno} disabled={enviando}>Retomar consumo interno</button></p>}
          <div inert={fechamentoPendente} style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            borderRadius: 16, padding: 16, position: 'sticky', top: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                📝 Comanda atual
                {totalItens > 0 && (
                  <span style={{
                    background: 'var(--accent-primary)', color: '#fff',
                    padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700
                  }}>{totalItens}</span>
                )}
              </h3>
            </div>
            <div className="pdv-command-type-tabs" aria-label="Tipo da comanda">
              <button type="button" className={comandaAtual.tipo === 'balcao' ? 'active' : ''} onClick={() => selecionarComandaPainel({ tipoAtendimento: 'balcao' })}>Balcão</button>
              <button type="button" className={comandaAtual.tipo === 'mesa' ? 'active' : ''} onClick={() => { setTransferindoMesa(false); setMesasDrawerOpen(true); }}>🪑 Mesa</button>
              <button type="button" className={comandaAtual.tipo === 'delivery' ? 'active' : ''} onClick={() => selecionarComandaPainel({ tipoAtendimento: 'delivery' })}>🛵 Delivery</button>
            </div>
            <div className="pdv-command-current"><span>{comandaAtual._id ? `Adicionando à ${rotuloComandaAtual} · #${comandaAtual.numero}` : rotuloComandaAtual}</span><button type="button" onClick={iniciarNovaComanda} disabled={enviando}>+ Novo pedido</button></div>
            <label className="pdv-command-name"><FieldLabel hint={<> {!(comandaAtual.tipo === 'delivery') && "(opcional)"} </>}> {comandaAtual.tipo === 'delivery' ? 'Nome' : 'Nome'} </FieldLabel><input value={clienteNome} onChange={event => { setClienteNome(event.target.value); setComandaAtual(atual => ({ ...atual, clienteNome: event.target.value, status: 'rascunho' })); }} maxLength={160} required={comandaAtual.tipo === 'delivery'} /></label>
            {comandaAtual.tipo === 'delivery' && <DeliveryPDV value={entregaPDV} onChange={setEntregaPDV} customer={clienteSelecionado} showToggle={false} />}
            <label className="pdv-command-name">Observação<textarea value={comandaAtual.observacao || ''} maxLength={500} onChange={event => setComandaAtual(atual => ({ ...atual, observacao: event.target.value, status: 'rascunho' }))} /></label>
            <label className="pdv-mobile-product-select">
              <span>Adicionar produto</span>
              <SearchableSelect
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
              </SearchableSelect>
            </label>
            {carrinho.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)', fontSize: 14 }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🛒</div>
                Comanda sem itens<br />
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
                            <input type="number" min="0" step="0.01" aria-label={`Preço unitário de ${item.nome}`} value={precosRascunho[i] ?? item.precoUnitario} onChange={event => setPrecosRascunho(atuais => ({ ...atuais, [i]: event.target.value }))} onBlur={event => alterarPreco(i, event.target.value)} style={{ width: '100%', maxWidth: 110, fontSize: 15, fontWeight: 700, background: 'var(--input-bg)', color: 'var(--input-text)', textAlign: 'right', padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: 8, minHeight: 38 }} />
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
                  
                  <div className="pdv-command-actions">
                  <button type="button" onClick={salvarComandaAtual} disabled={enviando} style={{
                    width: '100%', padding: '13px', background: 'var(--bg-tertiary)', color: 'var(--accent-primary)',
                    border: '1px solid var(--accent-border)', borderRadius: 12, fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', minHeight: 48
                  }}>Salvar em aberto</button>
                  <button type="button" onClick={abrirPagamento} disabled={enviando} style={{
                    width: '100%', padding: '14px', background: 'var(--accent-primary)', color: '#fff',
                    border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
                    cursor: 'pointer', minHeight: 52
                  }}>{consumoInterno ? 'Registrar consumo interno' : 'Fechar venda → pagamento'}</button>
                  <button type="button" onClick={imprimirComandaAtual} disabled={enviando}>🖨️ Imprimir comanda</button>
                  {comandaAtual.tipo === 'mesa' && <button type="button" onClick={() => { setTransferindoMesa(true); setMesasDrawerOpen(true); }} disabled={enviando}>Transferir mesa</button>}
                  {!navigator.onLine && <button type="button" onClick={finalizar} disabled={enviando} className="pdv-offline-save">Salvar fila offline</button>}
                  </div>
                  
                </div>
              </>
            )}
            {(comandaAtual._id || carrinho.length > 0) && <div className="pdv-command-actions" style={{ marginTop: 8 }}>
              <button type="button" onClick={cancelarComandaAtual} disabled={enviando || fechamentoPendente} style={{ color: 'var(--error-bg)', borderColor: 'var(--error-bg)' }}>Cancelar comanda</button>
            </div>}
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
          <div className="pdv-success-dialog" onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-secondary)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 400,
            maxHeight: 'calc(100dvh - 40px)', overflowY: 'auto', textAlign: 'center', boxShadow: 'var(--shadow-lg)',
            color: 'var(--text-primary)'
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', margin: '0 auto 16px',
              background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36
            }}>✅</div>
            <h3 style={{ margin: '0 0 4px', fontSize: 20, color: 'var(--text-primary)' }}>{modalSucesso.utilizacaoInterna ? 'Consumo interno registrado!' : modalSucesso.comandaEncerrada ? 'Comanda Fechada!' : 'Venda Finalizada!'}</h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)' }}>
              {modalSucesso.comandaEncerrada && <>Comanda <strong>#{modalSucesso.comandaEncerrada.numero}</strong> → </>}
              Pedido <strong style={{ color: 'var(--text-primary)' }}>#{modalSucesso.numero}</strong>
              <br />
              Total: <strong style={{ color: 'var(--accent-primary)', fontSize: 16 }}>
                R$ {modalSucesso.total.toFixed(2).replace('.', ',')}
              </strong>
            </p>
            {!modalSucesso.utilizacaoInterna && <>
              <div className="pdv-fiscal-status">
                <strong>NFC-e: {modalSucesso.nfce?.status === 'autorizada' ? 'Autorizada' : modalSucesso.nfce?.status === 'rejeitada' ? 'Rejeitada' : 'Não emitida'}</strong>
                {modalSucesso.nfce?.mensagemSeErro && <small>{modalSucesso.nfce.mensagemSeErro}</small>}
                {modalSucesso.nfce?.chaveAcesso && <small>Chave: {modalSucesso.nfce.chaveAcesso}</small>}
              </div>
              <div className="pdv-receipt-contact">
                <label><FieldLabel hint={<> (opcional) </>}> Nome do cliente </FieldLabel><input type="text" value={modalSucesso.comprovanteNome ?? modalSucesso.clienteNome ?? ''} disabled={comprovanteEnviando || nfceLoading} onChange={event => setModalSucesso(atual => ({ ...atual, comprovanteNome: event.target.value }))} />
                </label>
                <label>WhatsApp para enviar comprovante
                  <input type="tel" placeholder="(00) 00000-0000" value={modalSucesso.comprovanteTelefone ?? modalSucesso.clienteTelefone ?? ''} disabled={comprovanteEnviando || nfceLoading} onChange={event => setModalSucesso(atual => ({ ...atual, comprovanteTelefone: event.target.value }))} />
                </label>
              </div>
            </>}
            <div style={{ borderTop: '1px solid rgba(15,23,42,.08)', marginBottom: 20 }}></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {!modalSucesso.utilizacaoInterna && <>
                <button className="pdv-fiscal-button" type="button" onClick={emitirNfce} disabled={!modalSucesso._id || nfceLoading || comprovanteEnviando || modalSucesso.nfce?.status === 'autorizada'}>{nfceLoading ? 'Emitindo NFC-e...' : modalSucesso.nfce?.status === 'autorizada' ? 'NFC-e autorizada' : 'Emitir NFC-e'}</button>
                {modalSucesso.nfce?.danfePdf && <button className="pdv-fiscal-button" type="button" onClick={abrirDanfe}>Abrir DANFE PDF</button>}
              </>}
              <button onClick={() => imprimirCupom(modalSucesso)} style={{
                width: '100%', padding: '14px', background: 'var(--brand-brown)', color: '#fff',
                border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
                cursor: 'pointer', minHeight: 52, display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: 10
              }}>🖨️ Imprimir Cupom</button>
              <button onClick={() => void enviarWhatsApp(modalSucesso)} disabled={comprovanteEnviando || nfceLoading} style={{
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

      <MesasDrawer open={mesasDrawerOpen} onClose={() => { setMesasDrawerOpen(false); setTransferindoMesa(false); }} onSelect={selecionarComandaPainel} />
      {paymentOpen && <div className="pdv-payment-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setPaymentOpen(false); }}>
        <section className="pdv-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="pdv-payment-title">
          <div className="pdv-payment-heading">
            <div><span>FECHAR COMANDA</span><h2 id="pdv-payment-title">{comandaAtual.numero ? `#${comandaAtual.numero}` : 'Comanda atual'} — {comandaPagamento?.clienteNome || 'Cliente não identificado'}</h2></div>
            <button type="button" aria-label="Voltar ao atendimento" disabled={enviando} onClick={() => setPaymentOpen(false)}>×</button>
          </div>
          <div className="pdv-payment-items">
            {carrinho.map((item, index) => <div key={item._id || index}><span>{item.quantidade}× {item.nome}{item.modificadores?.length > 0 && <small> ({item.modificadores.join(', ')})</small>}</span><strong>{formatMoney(item.quantidade * item.precoUnitario)}</strong></div>)}
          </div>
          <p>Subtotal: <strong>{formatMoney(subtotal)}</strong></p>
          {Number(comandaPagamento?.taxaEntrega) > 0 && <p>Taxa de entrega: <strong>{formatMoney(comandaPagamento.taxaEntrega)}</strong></p>}
          <div className="pdv-payment-summary">
            <label>Desconto (R$)
              <input type="number" min="0" max={subtotal} step="0.01" disabled={enviando || Boolean(comandaPagamento?.metodoPagamento)} value={descontoFechamento} onChange={event => setDescontoFechamento(event.target.value)} />
            </label>
            <div><span>{jaRecebido > 0 ? 'Saldo em aberto' : 'Total a cobrar'}</span><strong>{formatMoney(saldoFechamento)}</strong>{jaRecebido > 0 && <small>Total {formatMoney(totalFechamento)} · já recebido {formatMoney(jaRecebido)}</small>}</div>
          </div>
          <label>Forma de pagamento
            <SearchableSelect disabled={enviando || Boolean(comandaPagamento?.metodoPagamento)} value={comandaPagamento?.metodoPagamento || metodoPagamento} onChange={event => setMetodoPagamento(event.target.value)}>
              <option value="">Selecione…</option>
              {FORMAS_PAGAMENTO.map(forma => <option value={forma.value} key={forma.value}>{forma.label}</option>)}
            </SearchableSelect>
          </label>
          <label><FieldLabel hint={<> (opcional) </>}> Nome do cliente </FieldLabel><input type="text" placeholder="Nome do cliente" disabled={enviando || Boolean(comandaPagamento?.metodoPagamento)} value={nomeFechamento} onChange={event => setNomeFechamento(event.target.value)} />
          </label>
          <label><FieldLabel hint={<> (opcional) </>}> Telefone para WhatsApp </FieldLabel><input type="tel" placeholder="DDD + número" disabled={enviando || Boolean(comandaPagamento?.metodoPagamento)} value={telefoneFechamento} onChange={event => setTelefoneFechamento(event.target.value)} />
          </label>
          <div className="pdv-payment-actions">
            <button type="button" onClick={() => setPaymentOpen(false)} disabled={enviando}>Voltar</button>
            <button type="button" onClick={confirmarPagamento} disabled={enviando}>{enviando ? 'Registrando...' : 'Confirmar Fechamento'}</button>
          </div>
        </section>
      </div>}

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
          .pdv-mobile-cart-trigger { position:fixed;z-index:20;left:12px;right:12px;bottom:12px;width:calc(100% - 24px);display:flex !important;box-sizing:border-box; }
          .pdv-mobile-cart-backdrop { display:block;position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.35); }
          .pdv-mobile-mesas-trigger{position:fixed;z-index:20;right:12px;bottom:72px;display:block;padding:9px 13px;border:1px solid var(--accent-border);border-radius:999px;background:var(--bg-secondary);color:var(--accent-primary);font:inherit;font-size:12px;font-weight:800;box-shadow:var(--shadow-sm)}
          .pdv-grid{padding-bottom:70px}
          .pdv-grid { gap: 10px !important; min-width: 0; }
          .pdv-grid > div { min-width: 0; }
          .pdv-cart-panel { display: none; }
          .pdv-cart-panel.mobile-open { display: block; position:fixed;z-index:1000;left:0;right:0;bottom:0;max-height:88vh;overflow:auto;order:initial;padding:10px 10px 24px;background:var(--bg-primary);border-radius:18px 18px 0 0;box-shadow:0 -12px 36px rgba(0,0,0,.22);animation:pdv-sheet-in .2s ease-out; }
          .pdv-cart-panel.mobile-open > div { min-height: 0; border-radius: 14px !important; }
          .pdv-cart-panel.mobile-open .pdv-cart-items { max-height: none !important; overflow: visible !important; }
          .pdv-cart-panel.mobile-open .pdv-mobile-product-select { display: grid; gap: 6px; margin: 0 0 14px; color: var(--text-secondary); font-size: 12px; font-weight: 700; }
          .pdv-mobile-product-select :is(select, .searchable-select-input) { width: 100%; min-height: 48px; padding: 10px 12px; border: 1.5px solid var(--border-color); border-radius: 10px; background: var(--input-bg); color: var(--input-text); font-size: 16px; }
          .pdv-grid > div > div { padding: 12px !important; border-radius: 12px !important; margin-bottom: 10px !important; }
          .pdv-grid .product-card { min-height: 96px !important; padding: 10px !important; }
          .pdv-grid [style*="max-height: 420px"] { max-height: 280px !important; }
          .pdv-grid [style*="position: sticky"] { position: static !important; }
        }
        .pdv-command-type-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px}.pdv-command-type-tabs button,.pdv-command-current button,.pdv-command-actions button{min-height:44px;border:1px solid var(--accent-border);border-radius:10px;padding:8px;background:var(--bg-tertiary);color:var(--accent-primary);font:inherit;font-weight:700;cursor:pointer}.pdv-command-type-tabs button.active{background:var(--accent-primary);color:#fff}.pdv-command-current{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:12px;font-size:12px;color:var(--text-secondary)}.pdv-command-name{display:grid;gap:6px;margin-bottom:12px;font-size:12px;font-weight:700;color:var(--text-secondary)}.pdv-command-name input,.pdv-command-name textarea{width:100%;box-sizing:border-box;min-height:40px;padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--input-bg);color:var(--input-text);font:inherit}.pdv-command-name textarea{resize:vertical}
        .product-card:active { transform: scale(0.97); }
        .product-card-added { animation: item-added .35s ease; border-color: var(--accent-primary) !important; }
        @media (min-width: 768px) {
          .pdv-mobile-cart-trigger, .pdv-mobile-mesas-trigger, .pdv-mobile-cart-backdrop { display: none; }
        }
        .pdv-mobile-product-select { display: none; }
        .pdv-mobile-cart-trigger { width: 100%; min-height: 50px; margin-bottom: 10px; padding: 10px 14px; align-items: center; justify-content: space-between; gap: 12px; border: 0; border-radius: 12px; background: var(--accent-primary); color: #fff; font: inherit; font-size: 14px; cursor: pointer; box-shadow: var(--shadow-sm); }
        .pdv-mobile-cart-trigger strong { font-size: 13px; white-space: nowrap; }
        .pdv-mesas-trigger,.pdv-command-pill{min-height:42px;padding:9px 14px;border:1px solid var(--accent-border);border-radius:999px;background:var(--accent-light);color:var(--accent-primary);font:inherit;font-weight:700;cursor:pointer}
        .pdv-command-selector{position:relative;margin-left:auto}
        .pdv-command-popover{position:absolute;top:calc(100% + 8px);right:0;z-index:20;width:220px;padding:7px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-secondary);box-shadow:var(--shadow-lg)}
        .pdv-command-popover button{display:block;width:100%;padding:10px;border:0;border-radius:8px;background:transparent;color:var(--text-primary);text-align:left;font:inherit;cursor:pointer}
        .pdv-command-popover button:hover{background:var(--bg-tertiary)}
        .pdv-command-actions{display:grid;grid-template-columns:1fr;gap:8px}
        .pdv-offline-save{min-height:42px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-tertiary);color:var(--text-primary);font:inherit;cursor:pointer}
        .pdv-payment-overlay{position:fixed;inset:0;z-index:10001;display:grid;place-items:center;padding:18px;background:rgba(22,15,10,.5)}
        .pdv-payment-dialog{width:min(480px,100%);max-height:calc(100dvh - 36px);overflow:auto;padding:22px;border:1px solid var(--border-color);border-radius:16px;background:var(--bg-secondary);color:var(--text-primary);box-shadow:var(--shadow-lg)}
        .pdv-payment-dialog h2{margin:0 0 12px}.pdv-payment-dialog p{color:var(--text-secondary)}
        .pdv-payment-dialog label{display:grid;gap:7px;margin-top:12px;font-size:13px;font-weight:700}
        .pdv-payment-dialog :is(select, .searchable-select-input),.pdv-payment-dialog input{width:100%;box-sizing:border-box;min-height:46px;padding:10px;border:1px solid var(--border-color);border-radius:9px;background:var(--input-bg);color:var(--input-text);font:inherit}
        .pdv-payment-items{max-height:200px;overflow:auto;background:var(--bg-tertiary);padding:10px 14px;border-radius:10px}.pdv-payment-items>div{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--border-color);font-size:13px}
        .pdv-payment-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}.pdv-payment-heading span{font-size:11px;font-weight:800;letter-spacing:.08em;color:var(--accent-primary)}.pdv-payment-heading h2{font-size:20px;margin:4px 0 0}.pdv-payment-heading button{border:0;background:transparent;font-size:22px;color:var(--text-secondary);cursor:pointer}
        .pdv-payment-summary{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}.pdv-payment-summary>div{display:flex;flex-direction:column;justify-content:flex-end;gap:4px;font-size:12px;color:var(--text-secondary)}.pdv-payment-summary strong{font-size:22px;color:var(--accent-primary)}
        .pdv-fiscal-status{padding:12px;margin-bottom:16px;border-radius:10px;background:var(--bg-tertiary);text-align:left}.pdv-fiscal-status small{display:block;margin-top:5px;overflow-wrap:anywhere;color:var(--text-secondary)}
        .pdv-receipt-contact{text-align:left;margin-bottom:18px}.pdv-receipt-contact label{display:grid;gap:6px;margin-top:12px;font-size:12px;font-weight:700}.pdv-receipt-contact input{width:100%;box-sizing:border-box;min-height:46px;padding:10px;border:1px solid var(--border-color);border-radius:9px;background:var(--input-bg);color:var(--input-text);font:inherit}.pdv-fiscal-button{min-height:50px;padding:13px;border:0;border-radius:12px;background:var(--accent-primary);color:#fff;font:inherit;font-weight:700;cursor:pointer}
        .pdv-payment-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:18px}
        .pdv-payment-actions button{min-height:46px;padding:8px;border:1px solid var(--border-color);border-radius:9px;background:var(--bg-tertiary);color:var(--text-primary);font:inherit;font-weight:700;cursor:pointer}
        .pdv-payment-actions button:last-child{border-color:var(--accent-primary);background:var(--accent-primary);color:#fff}
        @keyframes item-added { 50% { transform: scale(1.035); box-shadow: 0 0 0 4px var(--accent-light); } }
        @keyframes pdv-sheet-in{from{transform:translateY(100%)}to{transform:translateY(0)}}
      `}</style>
    </div>
  );
}
