import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { requestAutorizado } from '../services/apiAutorizada.js';
import api from '../services/api.jsx';
import { useToast } from '../components/useToast.js';
import { useFormasPagamento } from '../context/FormasPagamentoDefinition.js';
import { useAutorizacaoGerente } from '../hooks/useAutorizacaoGerente.jsx';
import SkeletonCard from "../components/Skeleton.jsx";
import Paginacao from '../components/Paginacao.jsx';

const vazio = {
  tipo: '',
  tipoProduto: '',
  categoria: '',
  codigo: '',
  nome: '',
  marcaReferencia: '',
  preco: 0,
  estoque: 0,
  estoqueMinimo: 0,
  unidadeCompra: '',
  unidadeVenda: '',
  unidade: '',
  conteudoPorEmbalagem: 0,
  estoqueEmbalagens: 0,
  estoqueMinimoEmbalagens: 0,
  precoCompra: 0,
  rendimentoPorReceita: 1,
  usavelEmReceita: false,
  vendidoFracionado: false,
  aFazer: false,
  producaoPropria: false,
  ativo: true,
  descontosPorQuantidade: [],
  grupoDesconto: { nome: '', quantidadeMinima: '', precoPromocional: '', ativo: false },
  estoqueInsumos: 0,
  estoqueInsumosTotal: 0,
};

const decimalStep = (unidade) => {
  if (['kg', 'litro'].includes(unidade)) return 0.001;
  return 1;
};

const decimalMinimum = (unidade) => {
  if (['kg', 'litro'].includes(unidade)) return 0.001;
  return 0;
};

const formatMoney = (value) => {
  return Number(value)
    .toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace('.', ',');
};

const dinheiro = (value) => formatMoney(value);

const normalizarTexto = (texto) => {
  return texto
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

const ENDERECO_VAZIO = {
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
  cep: '',
  pontoReferencia: '',
};

export default function Products() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const { formasPagamento, recarregar, atualizarFormas, carregando: carregandoFormas, erro: erroFormas } = useFormasPagamento();
  const [produtos, setProdutos] = useState([]);
  const [totalProdutos, setTotalProdutos] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(0);
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [limiteAtual, setLimiteAtual] = useState(25);
  const [carregandoProdutos, setCarregandoProdutos] = useState(true);
  const [erroProdutos, setErroProdutos] = useState(null);
  const [editandoProdutoId, setEditandoProdutoId] = useState(null);
  const [form, setForm] = useState(vazio);
  const [filtroTipo, setFiltroTipo] = useState(searchParams.get('tipo') || 'Todos');
  const [filtroCategoria, setFiltroCategoria] = useState(searchParams.get('categoria') || 'Todos');
  const [filtroTexto, setFiltroTexto] = useState(searchParams.get('busca') || '');
  const [filtroFicha, setFiltroFicha] = useState(searchParams.get('ficha') || 'Todos');
  const [produtoSelecionado, setProdutoSelecionado] = useState(null);
  const [imagemSelecionada, setImagemSelecionada] = useState(null);
  const [fichas, setFichas] = useState([]);
  const [categoriasVenda, setCategoriasVenda] = useState([]);
  const [units, setUnits] = useState([]);
  const [maisVendidos, setMaisVendidos] = useState([]);
  const [comandasFidelidade, setComandasFidelidade] = useState(0);
  const [multiplicadorFidelidade, setMultiplicadorFidelidade] = useState(0);
  const [progressoFidelidade, setProgressoFidelidade] = useState(0);
  const [carregandoMaisVendidos, setCarregandoMaisVendidos] = useState(false);
  const [carregandoFidelidade, setCarregandoFidelidade] = useState(false);
  const [mesasAbertasCount, setMesasAbertasCount] = useState(0);
  const [transferindoMesa, setTransferindoMesa] = useState(false);
  const [mesasDrawerOpen, setMesasDrawerOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [comandaPagamento, setComandaPagamento] = useState(null);
  const [metodoPagamento, setMetodoPagamento] = useState('');
  const [descontoFechamento, setDescontoFechamento] = useState(0);
  const [nomeFechamento, setNomeFechamento] = useState('');
  const [telefoneFechamento, setTelefoneFechamento] = useState('');
  const [jaRecebido, setJaRecebido] = useState(0);
  const [totalFechamento, setTotalFechamento] = useState(0);
  const [saldoFechamento, setSaldoFechamento] = useState(0);
  const [comprovanteEnviando, setComprovanteEnviando] = useState(false);
  const [nfceLoading, setNfceLoading] = useState(false);
  const [modalSucesso, setModalSucesso] = useState(null);
  const [mesas, setMesas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [comandas, setComandas] = useState([]);
  const [refecaoRef, setRefecaoRef] = useState(null);
  const [selectClienteRef, setSelectClienteRef] = useState(null);
  const [comandaAtual, setComandaAtual] = useState(null);
  const [carrinho, setCarrinho] = useState([]);
  [quantidadesRascunho, setQuantidadesRascunho] = useState({});
  [precosRascunho, setPrecosRascunho] = useState({});
  [envioRef, setEnvioRef] = useState(null);
  [pagamentoPreparadoRef, setPagamentoPreparadoRef] = useState(null);
  [comandaPagamentoRef, setComandaPagamentoRef] = useState(null);
  [selecao, setSelecao] = useState({});
  [clienteId, setClienteId] = useState('');
  [clienteNome, setClienteNome] = useState('');
  [entregaPDV, setEntregaPDV] = useState(null);
  [tipo, setTipo] = useState('balcao');
  [mobileCartOpen, setMobileCartOpen] = useState(false);
  [produtosMaisVendidos, setProdutosMaisVendidos] = useState([]);
  [grupos, setGrupos] = useState([]);
  [corCategoria, setCorCategoria] = useState({});
  [feedbackProduto, setFeedbackProduto] = useState(null);
  [carregandoProdutosLista, setCarregandoProdutosLista] = useState(false);
  [filtrarEstoqueBaixo, setFiltrarEstoqueBaixo] = useState(false);
  [abaixoDoMinimo, setAbaixoDoMinimo] = useState(() => () => false);
  [fichaProduto, setFichaProduto] = useState(null);
  [custoDisponivel, setCustoDisponivel] = useState(false);
  [custoExibido, setCustoExibido] = useState(0);
  [precoVendaDisponivel, setPrecoVendaDisponivel] = useState(false);
  [lucroDisponivel, setLucroDisponivel] = useState(false);
  [lucro, setLucro] = useState(0);
  [margem, setMargem] = useState(0);
  [custoAtualizadoEm, setCustoAtualizadoEm] = useState(null);
  [calculoDireto, setCalculoDireto] = useState(false);
  [conteudoAtual, setConteudoAtual] = useState(0);
  [fichaProdutoLoading, setFichaProdutoLoading] = useState(false);
  [fichaProdutoErro, setFichaProdutoErro] = useState(null);
  [refecaoLoading, setRefecaoLoading] = useState(false);
  [refecaoErro, setRefecaoErro] = useState(null);
  [mesasLoading, setMesasLoading] = useState(false);
  [mesasErro, setMesasErro] = useState(null);
  [clientesLoading, setClientesLoading] = useState(false);
  [clientesErro, setClientesErro] = useState(null);
  [comandasLoading, setComandasLoading] = useState(false);
  [comandasErro, setComandasErro] = useState(null);
  [produtosLoading, setProdutosLoading] = useState(false);
  [produtosErro, setProdutosErro] = useState(null);
  [maisVendidosLoading, setMaisVendidosLoading] = useState(false);
  [maisVendidosErro, setMaisVendidosErro] = useState(null);
  [fidelidadeLoading, setFidelidadeLoading] = useState(false);
  [fidelidadeErro, setFidelidadeErro] = useState(null);
  [unitsLoading, setUnitsLoading] = useState(false);
  [unitsErro, setUnitsErro] = useState(null);
  [categoriasVendaLoading, setCategoriasVendaLoading] = useState(false);
  [categoriasVendaErro, setCategoriasVendaErro] = useState(null);
  [fichasLoading, setFichasLoading] = useState(false);
  [fichasErro, setFichasErro] = useState(null);
  [solicitarExcluir, renderizarAutorizacaoExcluir] = useAutorizacaoGerente('excluir_produto');

  // Load initial data from URL
  useEffect(() => {
    const pagina = parseInt(searchParams.get('pagina')) || 1;
    const limite = parseInt(searchParams.get('limite')) || 25;
    setPaginaAtual(pagina);
    setLimiteAtual(limite);
    // We'll load the data in the carregar function which is called by the effect below
  }, [searchParams]);

  // Load data when pagina, limite, or filters change
  useEffect(() => {
    carregar();
  }, [paginaAtual, limiteAtual, filtroTipo, filtroCategoria, filtroTexto, filtroFicha]);

  const carregar = useCallback(async () => {
    setCarregandoProdutos(true);
    setErroProdutos(null);
    try {
      const query = new URLSearchParams({
        pagina: paginaAtual.toString(),
        limite: limiteAtual.toString(),
        busca: filtroTexto,
        tipo: filtroTipo === 'Todos' ? '' : filtroTipo,
        categoria: filtroCategoria === 'Todos' ? '' : filtroCategoria,
        ficha: filtroFicha === 'Todos' ? '' : filtroFicha,
      });
      const { data } = await api.get(`/products?${query.toString()}`);
      setProdutos(data.dados);
      setTotalProdutos(data.total);
      setTotalPaginas(data.totalPaginas);
      setPaginaAtual(data.pagina);
      setLimiteAtual(data.limite);
    } catch (error) {
      setErroProdutos(error.response?.data?.msg || 'Erro ao carregar produtos');
    } finally {
      setCarregandoProdutos(false);
    }
  }, [paginaAtual, limiteAtual, filtroTipo, filtroCategoria, filtroTexto, filtroFicha]);

  const limpar = useCallback(() => {
    setFiltroTipo('Todos');
    setFiltroCategoria('Todos');
    setFiltroTexto('');
    setFiltroFicha('Todos');
    // Reset to page 1 when clearing filters
    setSearchParams({
      tipo: 'Todos',
      categoria: 'Todos',
      busca: '',
      ficha: 'Todos',
      pagina: '1',
      limite: limiteAtual.toString(),
    }, { replace: true });
  }, [limiteAtual, setSearchParams]);

  const buscar = useCallback((event) => {
    setFiltroTexto(event.target.value);
    // Reset to page 1 when changing search
    setSearchParams(prev => {
      prev.set('busca', event.target.value);
      prev.set('pagina', '1');
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  const changePage = (novaPagina) => {
    if (novaPagina < 1 || novaPagina > totalPaginas || novaPagina === paginaAtual) return;
    setPaginaAtual(novaPagina);
    setSearchParams(prev => {
      prev.set('pagina', novaPagina.toString());
      return prev;
    }, { replace: true });
    // Scroll to top
    window.scrollTo(0, 0);
  };

  const changeLimite = (novoLimite) => {
    if (novoLimite === limiteAtual) return;
    setLimiteAtual(novoLimite);
    // Reset to page 1 when changing limit
    setSearchParams(prev => {
      prev.set('limite', novoLimite.toString());
      prev.set('pagina', '1');
      return prev;
    }, { replace: true });
    // Scroll to top
    window.scrollTo(0, 0);
  };

  // ... rest of the existing code (we'll keep the same but adjust the rendering)

  // We'll now render based on loading, error, and data
  return (
<div className="products-page">
      {renderizarAutorizacaoExcluir()}
      <div className="page-heading">
        <div>
          <h1>📦 Cadastro de Produtos</h1>
          <p>Produtos à venda e insumos ficam em grupos diferentes.</p>
        </div>
      </div>

      {/* Form section remains the same */}

      <section className="product-form-card">
        {/* ... existing form code ... */}
      </section>

      {/* Product list section */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 16 }}>
        {/* Controls for filters remain the same */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10 }}>
          {/* ... existing filter controls ... */}
        </div>

        <div className="product-list-controls">
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{filtrarEstoqueBaixo ? 'Produtos abaixo do mínimo' : 'Produtos'}</h3>
          <div className="product-list-filters">
            {/* ... existing filter controls ... */}
          </div>
        </div>

        {/* Conditional rendering based on state */}
        {carregandoProdutos && (
          <div className="product-admin-grid">
            {/* Show skeleton loading - we'll show 6 skeleton items by default */}
            {[...Array(6)].map((_, i) => (<SkeletonCard key={i} />))}
          </div>
        )}
        {!carregandoProdutos && erroProdutos && (
          <div style={{ textAlign: 'center', padding: 36, color: 'var(--text-secondary)', fontSize: 13 }}>
            {erroProdutos}
            <button type="button" onClick={carregar}>Tentar novamente</button>
          </div>
        )}
        {!carregandoProdutos && !erroProdutos && (
          <>
            {totalProdutos === 0 && (
              <div style={{ textAlign: 'center', padding: 36, color: 'var(--text-secondary)', fontSize: 13 }}>
                Nenhum produto nesta visão
              </div>
            )}
            {totalProdutos > 0 && (
              <div className="product-admin-grid">
                {/* ... existing product mapping ... */}
                {produtos.map((produto) => (
                  <article key={produto._id} className="product-admin-card">
                    {/* ... existing product card content ... */}
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        {/* Pagination controls - only show if we have data and not loading/error */}
        {!carregandoProdutos && !erroProdutos && totalProdutos > 0 && (
          <Paginacao
            total={totalProdutos}
            paginaAtual={paginaAtual}
            limiteAtual={limiteAtual}
            onChangePagina={changePage}
            onChangeLimite={changeLimite}
          />
        )}
      </div>

      {/* ... rest of the existing code (modals, styles, etc.) ... */}
    </div>
  );
}
