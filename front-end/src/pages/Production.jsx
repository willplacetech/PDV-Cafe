import FieldLabel from '../components/FieldLabel.jsx';
import SearchableSelect from '../components/SearchableSelect.jsx';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api.jsx';
import { requestAutorizado } from '../services/apiAutorizada.js';
import { useAutorizacaoGerente } from '../hooks/useAutorizacaoGerente.jsx';
import { useToast } from '../components/useToast.js';
import ConfirmarAcao from '../components/ConfirmarAcao.jsx';
import FichasTecnicas from './FichasTecnicas.jsx';
import Paginacao from '../components/Paginacao.jsx';
import usePagination from '../hooks/usePagination.js';
import useUrlPagination from '../hooks/useUrlPagination.js';
import EstadoLista from '../components/EstadoLista.jsx';

const units = ['kg', 'L', 'un'];
const emptyRecipe = { nome: '', produtoId: '', rendimento: '1', unidadeRendimento: 'un', ingredientes: [{ produtoId: '', quantidade: '', unidade: 'un' }] };
const emptyTransfer = { produtoId: '', origem: 'venda', destino: 'insumos', quantidade: '', observacao: '' };

const number = (value) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const unidadeDoInsumo = (produto = {}) => produto.tipo === 'venda' && produto.usavelEmReceita ? (produto.unidadeVenda || 'un') : (['un', 'kg', 'L'].includes(produto.unidadeCompra) ? produto.unidadeCompra : (produto.unidadeConteudo || 'kg'));
const fatoresBase = { kg: 1, L: 1, un: 1 };
const saidasDaReceita = (recipe) => Array.isArray(recipe?.produtosSaida) && recipe.produtosSaida.length
  ? recipe.produtosSaida
  : [{ produtoId: recipe?.produtoId, quantidade: recipe?.rendimento, unidade: recipe?.unidadeRendimento }];

export default function Production() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') === 'fichas' ? 'fichas-atual' : 'estoque');
  const [products, setProducts] = useState([]);
  const [stock, setStock] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [productionDashboard, setProductionDashboard] = useState(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [selectedRecipeQty, setSelectedRecipeQty] = useState('1');
  const [editingRecipeId, setEditingRecipeId] = useState(null);
  const [recipeForm, setRecipeForm] = useState(emptyRecipe);
  const [transfer, setTransfer] = useState(emptyTransfer);
  const [saving, setSaving] = useState(false);
  const [costForm, setCostForm] = useState({ receitaId: '', custoEmbalagem: '0', custoIndireto: '0', maoDeObra: '0', precoVenda: '' });
  const [costResult, setCostResult] = useState(null);
  const [costHistory, setCostHistory] = useState([]);
  const [ingredientPrices, setIngredientPrices] = useState({});
  const [ingredientUnits, setIngredientUnits] = useState({});
  const [cascadeResult] = useState(null);
  const [movForm, setMovForm] = useState({ produtoId: '', quantidadeEmbalagens: '', motivo: '' });
  const [movPreview, setMovPreview] = useState(null);
  const [movimentos, setMovimentos] = useState([]);
  const [totalStock, setTotalStock] = useState(0);
  const [totalMovimentos, setTotalMovimentos] = useState(0);
  const [loadingProduction, setLoadingProduction] = useState(true);
  const [productionLoadError, setProductionLoadError] = useState('');
  const { showToast } = useToast();
  const { solicitar: solicitarPreco, renderizarModal: renderizarAutorizacaoPreco } = useAutorizacaoGerente('alterar_preco');
  const paginacaoEstoque = useUrlPagination('estoque-producao');
  const paginacaoMovimentos = useUrlPagination('movimentos-producao');
  const { paginaAtual: paginaEstoque, limiteAtual: limiteEstoque } = paginacaoEstoque;
  const { paginaAtual: paginaMovimentos, limiteAtual: limiteMovimentos } = paginacaoMovimentos;

  const load = useCallback(async () => {
    setLoadingProduction(true);
    setProductionLoadError('');
    try {
      const [productsResponse, stockResponse, recipesResponse, dashboardResponse, movimentosResponse] = await Promise.all([
        api.get('/products'),
        api.get('/production/stock', { params: { location: 'insumos', pagina: paginaEstoque, limite: limiteEstoque } }),
        api.get('/production/recipes'),
        api.get('/production/dashboard'),
        api.get('/production/movements', { params: { pagina: paginaMovimentos, limite: limiteMovimentos } }),
      ]);
      setProducts(productsResponse.data);
      const stockData = stockResponse.data;
      setStock(Array.isArray(stockData) ? stockData : stockData.dados);
      setTotalStock(Array.isArray(stockData) ? stockData.length : stockData.total);
      setRecipes(recipesResponse.data);
      setProductionDashboard(dashboardResponse.data);
      const movementData = movimentosResponse.data;
      setMovimentos(Array.isArray(movementData) ? movementData : movementData.dados);
      setTotalMovimentos(Array.isArray(movementData) ? movementData.length : movementData.total);
    } catch (error) {
      const message = error.response?.data?.msg || 'Não foi possível carregar a produção.';
      setProductionLoadError(message);
      showToast(message, 'error');
    } finally {
      setLoadingProduction(false);
    }
  }, [showToast, paginaEstoque, limiteEstoque, paginaMovimentos, limiteMovimentos]);

  useEffect(() => {
    const loadInitialData = async () => { await load(); };
    loadInitialData();
  }, [load]);

  const producibleProducts = products.filter((product) => product.tipo === 'venda' && (product.tipoProduto === 'producao' || (!product.tipoProduto && product.producaoPropria)));
  const alterarTab = (novaTab) => {
    setTab(novaTab === 'fichas' ? 'fichas-atual' : novaTab);
    setSearchParams(novaTab === 'fichas' ? { tab: 'fichas' } : {});
  };
  const stockProducts = products.filter((product) => product.tipo === 'insumo' || product.usavelEmReceita);
  const stockOrdenado = [...stock].sort((a, b) => {
    const prioridade = (product) => {
      const saldo = Number(product.saldo || 0);
      const minimo = Number(product.minimo || 0);
      if (saldo <= 0) return 0;
      if (saldo <= minimo) return 1;
      return 2;
    };
    return prioridade(a) - prioridade(b);
  });
  const paginacaoReceitas = usePagination(recipes);
  const receitasPossiveis = productionDashboard?.receitasPossiveis || [];
  const paginacaoCapacidade = usePagination(receitasPossiveis);
  const costRecipe = recipes.find((recipe) => recipe._id === costForm.receitaId);
  const produtosSemCusto = products.filter((product) => Number(product.custoUnitario || product.custo || 0) <= 0);
  const produtosReajuste = products.filter((product) => product.reajusteRecomendado);

  const getIngredientStock = (ingredientProductId) => {
    const ingredient = stockProducts.find((product) => String(product._id) === String(ingredientProductId));
    return Number(ingredient?.resumoInsumo?.totalBase || ingredient?.estoqueInsumos || 0);
  };

  const getIngredientProduct = (ingredientProductId) => stockProducts.find((product) => String(product._id) === String(ingredientProductId));

  const getIngredientWarning = (ingredient) => {
    if (!ingredient?.produtoId || !ingredient.quantidade) return '';
    const produto = getIngredientProduct(ingredient.produtoId);
    const estoque = getIngredientStock(ingredient.produtoId);
    const quantidade = Number(ingredient.quantidade || 0);
    const unidadeUso = ingredient.unidade || unidadeDoInsumo(produto);
    const unidadeControle = unidadeDoInsumo(produto);
    const quantidadeBase = quantidade * (fatoresBase[unidadeUso] || 1);
    if (quantidadeBase > estoque) {
      return `Atenção: ${number(quantidade)} ${unidadeUso} equivalem a ${number(quantidadeBase / (fatoresBase[unidadeControle] || 1))} ${unidadeControle}; o estoque disponível é insuficiente.`;
    }
    return '';
  };

  const updateIngredient = (index, field, value) => {
    setRecipeForm((form) => ({ ...form, ingredientes: form.ingredientes.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value, ...(field === 'produtoId' ? { unidade: unidadeDoInsumo(getIngredientProduct(value)) } : {}) } : item) }));
  };

  const saveRecipe = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { ...recipeForm, rendimento: Number(recipeForm.rendimento), ingredientes: recipeForm.ingredientes.map((item) => ({ produtoId: item.produtoId, quantidade: Number(item.quantidade), unidade: item.unidade || unidadeDoInsumo(getIngredientProduct(item.produtoId)) })) };
      if (editingRecipeId) {
        await api.put(`/production/recipes/${editingRecipeId}`, payload);
        showToast('Ficha técnica atualizada com sucesso', 'success');
      } else {
        await api.post('/production/recipes', payload);
        showToast('Ficha técnica cadastrada com sucesso', 'success');
      }
      setRecipeForm(emptyRecipe);
      setEditingRecipeId(null);
      await load();
    } catch (error) { showToast(error.response?.data?.msg || 'Não foi possível salvar a ficha técnica', 'error'); }
    finally { setSaving(false); }
  };

  const startEditRecipe = (recipe) => {
    setEditingRecipeId(recipe._id);
    setRecipeForm({
      nome: recipe.nome || '',
      produtoId: recipe.produtoId?._id || recipe.produtoId || '',
      rendimento: String(recipe.rendimento ?? '1'),
      unidadeRendimento: recipe.unidadeRendimento || 'un',
      ingredientes: (recipe.ingredientes || []).map((item) => ({
        produtoId: item.produtoId?._id || item.produtoId || '',
        quantidade: String(item.quantidade ?? ''),
        unidade: item.unidade || 'un',
      })),
    });
    alterarTab('fichas');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditRecipe = () => {
    setEditingRecipeId(null);
    setRecipeForm(emptyRecipe);
  };


  const produce = async (event) => {
    event.preventDefault();
    if (!selectedRecipeId) return showToast('Selecione uma ficha técnica', 'warning');
    const quantidade = Number(selectedRecipeQty);
    if (!Number.isFinite(quantidade) || quantidade < 0.001) return showToast('Informe a quantidade de produções', 'warning');
    setSaving(true);
    try {
      const response = await api.post('/production/produce', { receitas: [{ receitaId: selectedRecipeId, quantidade }] });
      const conversoes = response.data?.conversoes?.filter(Boolean) || [];
      showToast(conversoes.length ? `${conversoes.join(' | ')}` : 'Produção concluída e estoque abastecido', 'success');
      setSelectedRecipeId('');
      setSelectedRecipeQty('1');
      await load();
    } catch (error) { showToast(error.response?.data?.msg || 'Não foi possível concluir a produção', 'error'); }
    finally { setSaving(false); }
  };

  const transferStock = async (event) => {
    event.preventDefault();
    if (transfer.origem === transfer.destino) return showToast('Escolha estoques diferentes', 'warning');
    setSaving(true);
    try {
      await api.post('/production/transfer', { ...transfer, quantidade: Number(transfer.quantidade) });
      showToast('Transferência realizada', 'success');
      setTransfer(emptyTransfer);
      await load();
    } catch (error) { showToast(error.response?.data?.msg || 'Não foi possível transferir o produto', 'error'); }
    finally { setSaving(false); }
  };

  const deleteRecipe = async (id) => {
    try { await api.delete(`/production/recipes/${id}`); showToast('Ficha técnica removida', 'success'); await load(); }
    catch (error) { showToast(error.response?.data?.msg || 'Não foi possível excluir a ficha técnica', 'error'); }
  };

  const saveIngredientPrice = () => {};

  const movimentarEstoque = async (event) => {
    event.preventDefault();
    if (!movForm.produtoId) return showToast('Selecione um insumo', 'warning');
    const delta = Number(movForm.quantidadeEmbalagens);
    if (!Number.isFinite(delta) || delta === 0) return showToast('Informe uma quantidade (use + para entrada, - para saída)', 'warning');
    setSaving(true);
    try {
      const response = await api.post(`/insumos/${movForm.produtoId}/movimentar`, { quantidadeEmbalagens: delta, motivo: movForm.motivo });
      showToast(`Estoque atualizado: ${response.data.embalagensAntes} → ${response.data.embalagensDepois} ${response.data.unidadeEmbalagem}`, 'success');
      setMovForm({ produtoId: '', quantidadeEmbalagens: '', motivo: '' });
      setMovPreview(null);
      await load();
    } catch (error) { showToast(error.response?.data?.msg || 'Não foi possível movimentar o estoque', 'error'); }
    finally { setSaving(false); }
  };

  const atualizarPreview = () => {
    if (!movForm.produtoId || !movForm.quantidadeEmbalagens) { setMovPreview(null); return; }
    const produto = stockProducts.find((product) => String(product._id) === String(movForm.produtoId));
    if (!produto) { setMovPreview(null); return; }
    const delta = Number(movForm.quantidadeEmbalagens);
    const atual = Number(produto.estoqueEmbalagens ?? produto.estoqueInsumos ?? 0);
    const novoTotal = atual + delta;
    if (novoTotal < 0) {
      setMovPreview({ erro: `Não é possível reduzir ${Math.abs(delta)} embalagem(s): o estoque atual é ${atual}` });
      return;
    }
    const resumo = produto.resumoInsumo || {};
    const fator = { mg: 0.001, g: 1, kg: 1000, ml: 1, l: 1000, un: 1 }[resumo.unidadeConteudo || produto.unidadeCompra] || 1;
    const conteudoBase = Number(resumo.conteudoPorEmbalagem || 0) * fator;
    setMovPreview({
      produto: produto.nome,
      unidadeCompra: produto.unidadeCompra,
      embalagensAntes: atual,
      embalagensDepois: novoTotal,
      delta,
      unidadeConteudo: resumo.unidadeConteudo || produto.unidadeConteudo || 'kg',
      totalAntes: (atual * conteudoBase) / fator,
      totalDepois: (novoTotal * conteudoBase) / fator,
    });
  };

  const calculateCost = async (event) => {
    event.preventDefault();
    if (!costForm.receitaId) return showToast('Selecione uma ficha técnica', 'warning');
    setSaving(true);
    try {
      const response = await api.post(`/receitas/${costForm.receitaId}/calcular-custo`, {
        custoEmbalagem: Number(costForm.custoEmbalagem), custoIndireto: Number(costForm.custoIndireto), maoDeObra: Number(costForm.maoDeObra),
      });
      setCostResult(response.data);
      const productId = response.data.produto?._id || costRecipe?.produtoId?._id || costRecipe?.produtoId;
      if (productId) setCostHistory((await api.get(`/produtos/${productId}/historico-custo`)).data);
      showToast('Custo calculado e salvo', 'success');
      await load();
    } catch (error) { showToast(error.response?.data?.msg || 'Não foi possível calcular o custo', 'error'); }
    finally { setSaving(false); }
  };

  const applyCostPrice = async () => {
    if (!costResult?.produto?._id || Number(costForm.precoVenda) < 0) return;
    try {
      await requestAutorizado('put', `/produtos/${costResult.produto._id}/aplicar-preco`, { preco: Number(costForm.precoVenda) }, 'alterar_preco', solicitarPreco);
      showToast('Preço de venda aplicado ao produto', 'success');
      await load();
    } catch (error) { showToast(error.response?.data?.msg || 'Não foi possível aplicar o preço', 'error'); }
  };

  return <div className="production-page">
    {renderizarAutorizacaoPreco()}
    <header className="production-heading page-heading"><div><span className="production-eyebrow">GESTÃO DE INSUMOS</span><h1>Produção</h1><p>Controle ingredientes, fichas técnicas e produtos produzidos na casa.</p></div><div className="production-header-actions"><button type="button" className="production-alert" onClick={() => setTab('custos')}><strong>{produtosSemCusto.length}</strong><span>produtos sem custo</span></button><button type="button" className="production-alert" onClick={() => setTab('custos')}><strong>{produtosReajuste.length}</strong><span>reajustes recomendados</span></button><div className="production-kpi"><strong>{productionDashboard?.receitasPossiveis?.filter((recipe) => recipe.producoesPossiveis > 0).length || 0}</strong><span>fichas possíveis</span></div></div></header>
    <nav className="production-tabs" aria-label="Seções da produção">
      {[['estoque', '📦 Estoque de insumos'], ['fichas', '📋 Ficha técnica'], ['produzir', '🔄 Nova produção'], ['transferir', '⚖️ Ajuste de inventário'], ['historico', '📜 Histórico de movimentos'], ['custos', 'Custo da ficha técnica']].map(([key, label]) => <button key={key} className={tab === key || (key === 'fichas' && tab === 'fichas-atual') ? 'active' : ''} onClick={() => alterarTab(key)}>{label}</button>)}
    </nav>
    {tab === 'fichas-atual' && <FichasTecnicas embedded />}

    {tab === 'estoque' && <section className="production-section">
      <div className="section-heading"><div><h2>Estoque de insumos</h2><p>Itens zerados ou abaixo do mínimo aparecem primeiro.</p></div><strong>{totalStock} itens</strong></div>
      <div className="stock-grid"><EstadoLista carregando={loadingProduction} erro={productionLoadError} vazio={stock.length === 0} tituloVazio="Nenhum insumo em estoque" mensagemVazia="Cadastre um produto do tipo insumo." onRetry={load}>{stock.length ? stockOrdenado.map((product) => <article className={product.saldo <= product.minimo ? 'stock-card low' : 'stock-card'} key={product._id}><div><span>{product.codigo}</span><h3>{product.nome}</h3></div><b>{number(product.totalDisponivel || 0)} <small>{product.totalKgDisponivel ? 'kg' : (product.unidadeDisponivel || product.unidadeConteudo || product.unidadeCompra || 'un')}</small></b><p className="stock-packaging-info">📦 {number(product.saldo)} embalagem(ns) × {number(product.resumoInsumo?.conteudoPorEmbalagem || product.conteudoPorEmbalagem || 1)} {product.unidadeDisponivel || product.unidadeConteudo || product.unidadeCompra || 'un'}</p>{product.totalDisponivel > 0 && <p>Total disponível{product.conteudoAberto > 0 ? ` · aberto: ${number(product.conteudoAberto)} ${product.unidadeDisponivel}` : ''}</p>}<p>Mínimo: {number(product.minimo)} {product.unidadeCompra || 'embalagens'}</p></article>) : null}</EstadoLista></div>
      <Paginacao prefixo="estoque-producao" total={totalStock} paginaAtual={paginaEstoque} limiteAtual={limiteEstoque} onChangePagina={paginacaoEstoque.alterarPagina} onChangeLimite={paginacaoEstoque.alterarLimite} />
    </section>}

{tab === 'fichas' && <section className="production-section"><div className="section-heading"><div><h2>Fichas técnicas</h2><p>Vincule cada ficha técnica ao produto que ela abastece.</p></div></div><form className="recipe-form" onSubmit={saveRecipe}><div className="form-grid"><label>Nome da ficha técnica<input required value={recipeForm.nome} onChange={(event) => setRecipeForm({ ...recipeForm, nome: event.target.value })} placeholder="Ex.: Bolo de cenoura" /></label><label>Produto produzido<SearchableSelect required value={recipeForm.produtoId} onChange={(event) => setRecipeForm({ ...recipeForm, produtoId: event.target.value })}><option value="">Selecione</option>{producibleProducts.map((product) => <option key={product._id} value={product._id}>{product.nome}</option>)}</SearchableSelect></label><label><FieldLabel hint={<> Quantas unidades do produto pronto esta ficha técnica produz. Ex: 1kg rende 20 palitos = digite 20. </>}> Rendimento </FieldLabel><input type="number" min="0.001" step="0.001" required value={recipeForm.rendimento} onChange={(event) => setRecipeForm({ ...recipeForm, rendimento: event.target.value })} /></label><label>Unidade<SearchableSelect value={recipeForm.unidadeRendimento} onChange={(event) => setRecipeForm({ ...recipeForm, unidadeRendimento: event.target.value })}>{units.map((unit) => <option key={unit}>{unit}</option>)}</SearchableSelect></label></div><div className="ingredients-heading"><h3>Ingredientes</h3><button type="button" className="secondary btn btn-ghost" onClick={() => setRecipeForm({ ...recipeForm, ingredientes: [...recipeForm.ingredientes, { produtoId: '', quantidade: '', unidade: 'un' }] })}>Adicionar ingrediente</button></div>{recipeForm.ingredientes.map((ingredient, index) => <div className="ingredient-row" key={`${index}-${ingredient.produtoId}`}><SearchableSelect required value={ingredient.produtoId} onChange={(event) => updateIngredient(index, 'produtoId', event.target.value)}><option value="">Ingrediente</option>{stockProducts.map((product) => <option key={product._id} value={product._id}>{product.nome} · {number(product.estoqueInsumos)} {product.unidadeVenda}</option>)}</SearchableSelect><label className="ingredient-quantity"><FieldLabel hint={<> Quanto deste insumo é CONSUMIDO por receita. Ex: 1 pacote de 1kg = digite 1. NÃO digite o rendimento aqui. {getIngredientWarning(ingredient) && <><br />{getIngredientWarning(ingredient)}</>} </>}>Quantidade</FieldLabel><input type="number" min="0.001" step="0.001" required placeholder="Quantidade" value={ingredient.quantidade} onChange={(event) => updateIngredient(index, 'quantidade', event.target.value)} /></label><SearchableSelect value={ingredient.unidade} onChange={(event) => setRecipeForm({ ...recipeForm, ingredientes: recipeForm.ingredientes.map((current, currentIndex) => currentIndex === index ? { ...current, unidade: event.target.value } : current) })}>{units.map((unit) => <option key={unit}>{unit}</option>)}</SearchableSelect>{recipeForm.ingredientes.length > 1 && <button type="button" className="icon-button" title="Remover ingrediente" onClick={() => setRecipeForm({ ...recipeForm, ingredientes: recipeForm.ingredientes.filter((_, itemIndex) => itemIndex !== index) })}>×</button>}</div>)}<div style={{ display: 'flex', gap: 8 }}><button className="primary btn btn-primary" disabled={saving}>{saving ? (editingRecipeId ? 'Atualizando...' : 'Salvando...') : (editingRecipeId ? 'Atualizar receita' : 'Cadastrar receita')}</button>{editingRecipeId && <button type="button" className="secondary btn btn-ghost" onClick={cancelEditRecipe}>Cancelar</button>}</div></form><div className="recipe-list"><EstadoLista carregando={loadingProduction} erro={productionLoadError} vazio={recipes.length === 0} tituloVazio="Nenhuma ficha técnica cadastrada" onRetry={load}>{paginacaoReceitas.itensPagina.map((recipe) => <article className="recipe-card" key={recipe._id}><div><span>Rendimento: {number(recipe.rendimento)} {recipe.unidadeRendimento}</span><h3>{recipe.nome}</h3><p>Abastece: {recipe.produtoId?.nome || 'Produto removido'}</p><small>{recipe.ingredientes?.length || 0} ingrediente(s)</small></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="secondary btn btn-ghost" onClick={() => startEditRecipe(recipe)}>Alterar</button><ConfirmarAcao titulo="Excluir ficha técnica" mensagem="Excluir esta ficha técnica?" acaoTexto="Excluir ficha" onConfirmar={() => deleteRecipe(recipe._id)}>{({ onClick }) => <button className="danger" onClick={onClick}>Excluir</button>}</ConfirmarAcao></div></article>)}</EstadoLista></div><Paginacao prefixo="receitas-producao" total={paginacaoReceitas.total} paginaAtual={paginacaoReceitas.paginaAtual} limiteAtual={paginacaoReceitas.limiteAtual} onChangePagina={paginacaoReceitas.alterarPagina} onChangeLimite={paginacaoReceitas.alterarLimite} /></section>}

    {tab === 'produzir' && <section className="production-section"><div className="section-heading"><div><h2>Iniciar nova produção</h2><p>Os insumos serão baixados e todos os produtos finais da ficha serão abastecidos.</p></div></div><form className="action-form" onSubmit={produce}><div style={{ display: 'grid', gap: 12, marginBottom: 16 }}><label>Ficha técnica<SearchableSelect required value={selectedRecipeId} onChange={(event) => setSelectedRecipeId(event.target.value)}><option value="">Selecione uma ficha</option>{recipes.filter((recipe) => recipe.ativa && recipe.tipoFicha === 'producao').map((recipe) => <option key={recipe._id} value={recipe._id}>{recipe.nome} · {saidasDaReceita(recipe).map((output) => output.produtoId?.nome || 'Produto').join(' + ')}</option>)}</SearchableSelect></label>{selectedRecipeId && <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 12, border: '1px solid var(--border-light)', borderRadius: 8, background: 'var(--bg-tertiary)' }}><label style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>Quantidade de produções: <input type="number" min="1" step="1" required value={selectedRecipeQty} onChange={(event) => setSelectedRecipeQty(event.target.value)} /></label>{(() => { const recipe = recipes.find((item) => item._id === selectedRecipeId); return recipe && <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{saidasDaReceita(recipe).map((output) => `${number(Number(output.quantidade) * Number(selectedRecipeQty || 0))} ${output.unidade} de ${output.produtoId?.nome || 'produto'}`).join(' · ')}</span>; })()}</div>}</div><button className="primary btn btn-primary" disabled={saving || !selectedRecipeId}>{saving ? 'Produzindo...' : 'Confirmar produção'}</button></form><div className="possible-list"><h3>Estoque e capacidade atual</h3><EstadoLista carregando={loadingProduction} erro={productionLoadError} vazio={receitasPossiveis.length === 0} tituloVazio="Nenhuma capacidade de produção disponível" onRetry={load}>{paginacaoCapacidade.itensPagina.map((recipe) => <div key={String(recipe.receitaId)}><span>{recipe.receitaNome} · {recipe.produtoNome}</span><div className="possible-meta"><b>{recipe.tipoProduto === 'producao' ? (recipe.produtosSaida || []).map((output) => `${number(output.estoque)} ${output.unidade} de ${output.nome}`).join(' · ') : (recipe.producoesPossiveis > 0 ? `${number(recipe.producoesPossiveis)} produção(ões) · ${number(recipe.unidadesProntas)} ${recipe.unidade} prontos` : 'Insumos insuficientes')}</b>{recipe.calculo && <small>{recipe.calculo}</small>}</div></div>)}</EstadoLista><Paginacao prefixo="capacidade-producao" total={paginacaoCapacidade.total} paginaAtual={paginacaoCapacidade.paginaAtual} limiteAtual={paginacaoCapacidade.limiteAtual} onChangePagina={paginacaoCapacidade.alterarPagina} onChangeLimite={paginacaoCapacidade.alterarLimite} /></div></section>}

    {tab === 'transferir' && <section className="production-section"><div className="section-heading"><div><h2>Transferir entre estoques</h2><p>O mesmo produto pode existir nos dois estoques. A origem precisa ter saldo disponível.</p></div></div><form className="action-form" onSubmit={transferStock}><label>Produto<SearchableSelect required value={transfer.produtoId} onChange={(event) => setTransfer({ ...transfer, produtoId: event.target.value })}><option value="">Selecione</option>{products.map((product) => <option key={product._id} value={product._id}>{product.nome} · venda {number(product.estoque)} · insumos {number(product.estoqueInsumos)}</option>)}</SearchableSelect></label><div className="form-grid"><label>Origem<SearchableSelect value={transfer.origem} onChange={(event) => setTransfer({ ...transfer, origem: event.target.value })}><option value="venda">Estoque de venda</option><option value="insumos">Estoque de insumos</option></SearchableSelect></label><label>Destino<SearchableSelect value={transfer.destino} onChange={(event) => setTransfer({ ...transfer, destino: event.target.value })}><option value="insumos">Estoque de insumos</option><option value="venda">Estoque de venda</option></SearchableSelect></label></div><label>Quantidade<input type="number" min="0.001" step="0.001" required value={transfer.quantidade} onChange={(event) => setTransfer({ ...transfer, quantidade: event.target.value })} /></label><label>Observação<input value={transfer.observacao} onChange={(event) => setTransfer({ ...transfer, observacao: event.target.value })} placeholder="Motivo da transferência" /></label><button className="primary btn btn-primary" disabled={saving}>{saving ? 'Transferindo...' : 'Confirmar transferência'}</button></form></section>}

    {tab === 'movimentar' && <section className="production-section"><div className="section-heading"><div><h2>Movimentar estoque de insumo</h2><p>Adicionar ou remover embalagens do estoque. Use números positivos para entrada e negativos para saída.</p></div></div><form className="action-form" onSubmit={movimentarEstoque}><label>Insumo<SearchableSelect required value={movForm.produtoId} onChange={(event) => { setMovForm({ ...movForm, produtoId: event.target.value }); }}><option value="">Selecione um insumo</option>{stockProducts.filter((product) => product.tipo === 'insumo').map((product) => <option key={product._id} value={product._id}>{product.nome} · {number(product.resumoInsumo?.total || product.estoqueEmbalagens || 0)} {product.resumoInsumo?.unidadeConteudo || product.unidadeCompra || 'und'}</option>)}</SearchableSelect></label><label>Quantidade de embalagens (+ ou -)<input type="number" step="0.001" min={-999999} value={movForm.quantidadeEmbalagens} onChange={(event) => { setMovForm({ ...movForm, quantidadeEmbalagens: event.target.value }); atualizarPreview(); }} placeholder="Ex.: +5 ou -3" required /></label><label><FieldLabel hint={<> Opcional </>}> Motivo </FieldLabel><SearchableSelect value={movForm.motivo} onChange={(event) => setMovForm({ ...movForm, motivo: event.target.value })}><option value="">Selecione...</option><option value="compra">Compra</option><option value="devolucao">Devolução</option><option value="ajuste">Ajuste</option><option value="perda">Perda</option><option value="uso">Uso interno</option></SearchableSelect></label>{movPreview && <div className="mov-preview">{movPreview.erro ? <span style={{ color: 'var(--error-bg)', fontWeight: 700 }}>{movPreview.erro}</span> : <><div><span>Antes:</span> <strong>{movPreview.embalagensAntes} embalagens ({number(movPreview.totalAntes)} {movPreview.unidadeConteudo})</strong></div><div><span>Após:</span> <strong>{movPreview.embalagensDepois} embalagens ({number(movPreview.totalDepois)} {movPreview.unidadeConteudo})</strong></div></>}</div>}{!movPreview && <div className="mov-preview"><span style={{ color: 'var(--text-secondary)' }}>Selecione um insumo e informe a quantidade para visualizar o impacto.</span></div>}<button className="primary btn btn-primary" disabled={saving || !movForm.produtoId || !movForm.quantidadeEmbalagens || (movPreview && !!movPreview.erro)}>{saving ? 'Salvando...' : 'Confirmar movimentação'}</button></form></section>}

    {tab === 'historico' && <section className="production-section"><div className="section-heading"><div><h2>Histórico de movimentos de estoque</h2><p>Histórico completo de entradas, saídas e ajustes.</p></div><strong>{totalMovimentos} movimentos</strong></div><EstadoLista carregando={loadingProduction} erro={productionLoadError} vazio={movimentos.length === 0} tituloVazio="Nenhum movimento registrado" onRetry={load}>{movimentos.length ? <><div className="movimentos-list">{movimentos.map((mov) => <div className="movimento-row" key={mov._id}><div className="movimento-info"><span className={'movimento-tipo ' + (mov.tipo === 'entrada' ? 'mov-entrada' : mov.tipo === 'saida' ? 'mov-saida' : mov.tipo === 'producao' ? 'mov-producao' : mov.tipo === 'transferencia' ? 'mov-transferencia' : 'mov-ajuste')}>{mov.tipo}</span><strong>{mov.produtoNome || 'Produto'}</strong><small>{mov.observacao || (mov.tipo === 'saida' ? 'Consumo' : mov.tipo === 'entrada' ? 'Entrada' : 'Ajuste')}</small></div><div className="movimento-valores"><span className="movimento-quantidade">{mov.quantidadePecas > 0 ? mov.quantidadePecas + ' ' + (mov.unidade || 'und') : mov.quantidade + ' ' + (mov.unidade || mov.tipoVenda || 'und')}</span><small>{new Date(mov.createdAt).toLocaleString('pt-BR')} · {mov.createdBy?.username || 'sistema'}</small></div></div>)}</div><Paginacao prefixo="movimentos-producao" total={totalMovimentos} paginaAtual={paginaMovimentos} limiteAtual={limiteMovimentos} onChangePagina={paginacaoMovimentos.alterarPagina} onChangeLimite={paginacaoMovimentos.alterarLimite} /></> : null}</EstadoLista></section>}

    {tab === 'custos' && <section className="production-section cost-calculator"><div className="section-heading"><div><h2>Calculadora de custo e precificação</h2><p>Atualize insumos e calcule o custo real das fichas técnicas.</p></div></div>{produtosReajuste.length > 0 && <div className="cost-alert"><strong>Reajuste recomendado</strong>{produtosReajuste.map((product) => <div key={product._id}>{product.nome} · custo R$ {number(product.custoUnitario || product.custo)} · preço R$ {number(product.preco)}</div>)}</div>}<div className="cost-step"><h3>Passo 1 · Preço de compra dos insumos</h3><div className="cost-ingredient-list">{stockProducts.map((product) => <div className="cost-ingredient-row" key={product._id}><span><strong>{product.nome}</strong><small>Custo base: R$ {Number(product.custoUnitarioBase || 0).toFixed(6)}</small></span><input type="number" min="0" step="0.01" placeholder="Preço de compra" value={ingredientPrices[product._id] ?? product.precoCompra ?? ''} onChange={(event) => setIngredientPrices({ ...ingredientPrices, [product._id]: event.target.value })} /><SearchableSelect value={ingredientUnits[product._id] || product.unidadeCompra || 'kg'} onChange={(event) => setIngredientUnits({ ...ingredientUnits, [product._id]: event.target.value })}>{['kg', 'g', 'l', 'ml', 'un', 'dz'].map((unit) => <option key={unit}>{unit}</option>)}</SearchableSelect><button type="button" className="secondary btn btn-ghost" onClick={() => saveIngredientPrice(product)}>Salvar</button></div>)}</div>{cascadeResult?.afetados?.length > 0 && <div className="cost-alert">A alteração afetou {cascadeResult.afetados.length} fichas técnicas. Veja quais produtos precisam de reajuste: {cascadeResult.afetados.map((item) => <div key={item.produtoId}>{item.nome}: R$ {number(item.custoAntigo)} → R$ {number(item.custoNovo)} ({item.variacaoPercentual}%)</div>)}</div>}</div><div className="cost-step"><h3>Passo 2 e 3 · Receita e custos adicionais</h3><form className="form-grid" onSubmit={calculateCost}><label><span>Ficha técnica</span><SearchableSelect required value={costForm.receitaId} onChange={(event) => { setCostForm({ ...costForm, receitaId: event.target.value }); setCostResult(null); }}><option value="">Selecione</option>{recipes.map((recipe) => <option key={recipe._id} value={recipe._id}>{recipe.nome} · {recipe.produtoId?.nome}</option>)}</SearchableSelect></label><label><span>Embalagem por unidade</span><input type="number" min="0" step="0.01" value={costForm.custoEmbalagem} onChange={(event) => setCostForm({ ...costForm, custoEmbalagem: event.target.value })} /></label><label><span>Gás / energia</span><input type="number" min="0" step="0.01" value={costForm.custoIndireto} onChange={(event) => setCostForm({ ...costForm, custoIndireto: event.target.value })} /></label><label><span>Mão de obra</span><input type="number" min="0" step="0.01" value={costForm.maoDeObra} onChange={(event) => setCostForm({ ...costForm, maoDeObra: event.target.value })} /></label><button className="primary btn btn-primary" disabled={saving}>{saving ? 'Calculando...' : 'Calcular custo'}</button></form>{costRecipe && <div className="recipe-preview"><strong>Ingredientes</strong>{costRecipe.ingredientes.map((item) => <span key={String(item.produtoId?._id || item.produtoId)}>{item.produtoId?.nome}: {number(item.quantidade)} {item.unidade} · custo base R$ {Number(item.produtoId?.custoUnitarioBase || 0).toFixed(6)}</span>)}</div>}</div>{costResult && <div className="cost-result"><h3>Passo 4 · Resultado</h3><div className="cost-result-grid"><div><small>Custo total</small><strong>R$ {number(costResult.custoTotal)}</strong></div><div className="cost-highlight"><small>Custo por unidade</small><strong>R$ {number(costResult.custoUnitario)}</strong></div><div><small>Markup 2x / 2,5x / 3x</small><strong>R$ {number(costResult.sugeridos.markup2x)} · R$ {number(costResult.sugeridos.markup2_5x)} · R$ {number(costResult.sugeridos.markup3x)}</strong></div><div><small>Margem 50% / 60% / 70%</small><strong>R$ {number(costResult.sugeridos.margem50)} · R$ {number(costResult.sugeridos.margem60)} · R$ {number(costResult.sugeridos.markup3x)}</strong></div></div><div className="apply-price"><input type="number" min="0" step="0.01" placeholder="Preço de venda definido" value={costForm.precoVenda} onChange={(event) => setCostForm({ ...costForm, precoVenda: event.target.value })} /><button type="button" className="primary btn btn-primary" onClick={applyCostPrice}>Aplicar preço no produto</button></div><h4>Histórico de custo</h4>{costHistory.map((item) => <div className="history-row" key={item._id}>{new Date(item.data).toLocaleDateString('pt-BR')} · R$ {number(item.custoUnitario)} · {item.motivo}</div>)}</div>}</section>}

    <style>{styles}</style>
  </div>;
}

const styles = `
.production-page { color:var(--text-primary); }
.production-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:20px; }
.production-eyebrow { color:var(--accent-primary); font-size:10px; font-weight:800; letter-spacing:.1em; }
.production-heading p, .section-heading p { margin:0; color:var(--text-secondary); font-size:13px; }
.production-kpi { display:grid; gap:2px; padding:12px 16px; border:1px solid var(--accent-border); border-radius:10px; background:var(--accent-light); text-align:right; }
.production-kpi strong { color:var(--accent-primary); font-size:22px; }
.production-kpi span { color:var(--text-secondary); font-size:11px; }
.production-header-actions { display:flex; align-items:stretch; gap:8px; }
.production-alert { display:grid; gap:2px; padding:9px 11px; border:1px solid var(--accent-border); border-radius:10px; background:var(--accent-light); color:var(--text-primary); text-align:left; cursor:pointer; }
.production-alert strong { color:var(--accent-primary); font-size:18px; }
.production-alert span { color:var(--text-secondary); font-size:10px; white-space:nowrap; }
.production-tabs { display:flex; gap:6px; overflow-x:auto; margin-bottom:16px; border-bottom:1px solid var(--border-color); }
.production-tabs button { flex-shrink:0; min-height:42px; padding:8px 13px; border:0; border-bottom:2px solid transparent; background:transparent; color:var(--text-secondary); font-weight:700; cursor:pointer; }
.production-tabs button.active { border-color:var(--accent-primary); color:var(--accent-primary); }
.production-section { padding:18px; border:1px solid var(--border-color); border-radius:16px; background:var(--bg-secondary); box-shadow:var(--shadow-sm); }
.mov-preview { display:grid; gap:8px; padding:14px; border:1px solid var(--border-light); border-radius:10px; background:var(--bg-tertiary); margin-top:12px; }
.mov-preview div { display:grid; gap:2px; }
.mov-preview span { color:var(--text-secondary); font-size:11px; }
.mov-preview strong { color:var(--text-primary); font-size:14px; }
.movimentos-list { display:grid; gap:8px; }
.movimento-row { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 12px; border:1px solid var(--border-light); border-radius:8px; background:var(--bg-tertiary); }
.movimento-info { display:grid; gap:3px; }
.movimento-info strong { color:var(--text-primary); font-size:13px; }
.movimento-info small { color:var(--text-secondary); font-size:11px; }
.movimento-tipo { display:inline-block; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:700; }
.mov-entrada { background:rgba(34,197,94,.1); color:var(--success-bg, #22c55e); }
.mov-saida { background:rgba(239,68,68,.1); color:var(--error-bg); }
.mov-producao { background:rgba(59,130,246,.1); color:var(--accent-primary); }
.mov-transferencia { background:rgba(168,85,212,.1); color:#a855f7; }
.mov-ajuste { background:rgba(140,140,140,.1); color:var(--text-secondary); }
.movimento-valores { display:grid; justify-items:end; gap:3px; }
.movimento-quantidade { color:var(--accent-primary); font-size:13px; font-weight:700; }
.section-heading, .ingredients-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; }
.section-heading h2, .ingredients-heading h3, .possible-list h3 { margin:0 0 4px; font-size:17px; }
.section-heading > strong { color:var(--accent-primary); }
.stock-grid, .recipe-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px; }
.stock-card, .recipe-card, .possible-list { padding:14px; border:1px solid var(--border-light); border-radius:10px; background:var(--bg-tertiary); }
.stock-card.low { border-color:var(--error-bg); background:rgba(220,38,38,.06); }
.stock-card span, .recipe-card span, .recipe-card small { color:var(--text-secondary); font-size:11px; }
.stock-card h3, .recipe-card h3 { margin:5px 0; font-size:14px; }
.stock-card b { display:block; margin-top:12px; color:var(--accent-primary); font-size:20px; }
.stock-card b small { font-size:11px; }
.stock-card p, .recipe-card p { margin:5px 0 0; color:var(--text-secondary); font-size:11px; }
.form-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.recipe-form, .action-form { display:grid; gap:12px; margin-bottom:20px; }
.recipe-form label, .action-form label { display:grid; gap:5px; color:var(--text-secondary); font-size:12px; font-weight:700; }
.recipe-form input, .recipe-form :is(select, .searchable-select-input), .action-form input, .action-form :is(select, .searchable-select-input) { width:100%; }
.field-help { display:block; margin-top:4px; font-size:11px; line-height:1.45; color:var(--text-secondary); font-weight:500; }
.field-warning { display:block; margin-top:4px; font-size:11px; line-height:1.45; color:var(--warning-bg); font-weight:700; }
.ingredient-quantity { display:grid; gap:4px; }
.cost-step .form-grid label { display:grid; grid-template-columns:1fr; gap:5px; align-content:start; color:var(--text-secondary); font-size:12px; font-weight:700; }
.cost-step .form-grid label > span { display:block; }
.cost-step .form-grid input, .cost-step .form-grid :is(select, .searchable-select-input) { display:block; width:100%; }
.ingredient-row { display:grid; grid-template-columns:minmax(0,2fr) minmax(100px,1fr) 36px; gap:8px; }
.ingredient-row > .searchable-select-input:nth-of-type(2) { display:none; }
.secondary, .primary, .danger, .icon-button { min-height:48px; padding:12px 16px; border-radius:10px; font-weight:700; cursor:pointer; }
.secondary { border:1px solid var(--accent-border); background:var(--accent-light); color:var(--accent-primary); }
.primary { border:0; background:var(--accent-primary); color:var(--accent-text); }
.danger { border:1px solid rgba(220,38,38,.2); background:rgba(220,38,38,.08); color:var(--error-bg); }
.icon-button { min-height:40px; padding:0; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-secondary); color:var(--error-bg); font-size:18px; }
.recipe-card { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
.recipe-preview { display:grid; gap:6px; padding:14px; border:1px solid var(--accent-border); border-radius:10px; background:var(--accent-light); color:var(--text-secondary); font-size:12px; }
.recipe-preview strong, .recipe-preview b { color:var(--accent-primary); }
.possible-list { display:grid; gap:8px; }
.possible-list h3 { margin-bottom:4px; }
.possible-list div { display:flex; justify-content:space-between; gap:10px; padding:8px 0; border-bottom:1px solid var(--border-light); font-size:12px; }
.possible-list b { color:var(--accent-primary); white-space:nowrap; }
.possible-meta { display:grid; justify-items:end; gap:4px; text-align:right; }
.possible-meta small { color:var(--text-secondary); font-size:11px; line-height:1.45; }
.cost-calculator { display:grid; gap:0; padding:20px; }
.cost-calculator > .section-heading { margin-bottom:0; padding-bottom:18px; border-bottom:1px solid var(--border-light); }
.cost-calculator > .section-heading h2 { font-size:20px; }
.cost-step, .cost-result { padding:20px 0; border:0; border-bottom:1px solid var(--border-light); border-radius:0; background:transparent; }
.cost-step h3, .cost-result h3 { margin:0 0 14px; color:var(--text-primary); font-size:14px; }
.cost-step h3::first-letter { color:var(--accent-primary); }
.cost-ingredient-list { display:none; }
.cost-calculator .cost-step:has(.cost-ingredient-list) { display:none; }
.cost-calculator .cost-step:not(:has(.cost-ingredient-list)) > h3 { font-size:0; }
.cost-calculator .cost-step:not(:has(.cost-ingredient-list)) > h3::after { content:'Custos adicionais da produção'; font-size:16px; }
.cost-calculator > .section-heading h2 { font-size:0; }
.cost-calculator > .section-heading h2::after { content:'Custos fora da receita'; font-size:17px; }
.cost-calculator > .section-heading p { font-size:0; }
.cost-calculator > .section-heading p::after { content:'O custo dos insumos vem do cadastro e é calculado ao salvar a receita.'; font-size:13px; }
.cost-ingredient-row { display:grid; grid-template-columns:minmax(0,1fr) 150px 92px 86px; align-items:center; gap:10px; padding:10px 12px; border-bottom:1px solid var(--border-light); }
.cost-ingredient-row:last-child { border-bottom:0; }
.cost-ingredient-row:hover { background:var(--bg-tertiary); }
.cost-ingredient-row span { display:grid; gap:3px; color:var(--text-primary); font-size:13px; }
.cost-ingredient-row small { color:var(--text-secondary); font-size:11px; }
.cost-ingredient-row input, .cost-ingredient-row :is(select, .searchable-select-input), .apply-price input { width:100%; }
.cost-ingredient-row .secondary { min-height:40px; padding:8px 10px; }
.cost-alert { margin-top:12px; padding:12px 14px; border:1px solid var(--warning-bg); border-left:4px solid var(--warning-bg); border-radius:8px; background:rgba(217,119,6,.08); color:var(--text-primary); font-size:12px; }
.cost-alert strong { display:block; margin-bottom:5px; color:var(--warning-bg); }
.cost-alert div { margin-top:5px; }
.cost-result { border-bottom:0; padding-bottom:0; }
.cost-result-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
.cost-result-grid > div { display:grid; align-content:center; gap:6px; min-height:78px; padding:12px 14px; border:1px solid var(--border-color); border-radius:10px; background:var(--bg-secondary); }
.cost-result-grid small { color:var(--text-secondary); font-size:11px; }
.cost-result-grid strong { color:var(--text-primary); font-size:15px; line-height:1.35; }
.cost-result-grid .cost-highlight { border-color:var(--accent-primary); background:var(--accent-light); }
.cost-result-grid .cost-highlight small, .cost-result-grid .cost-highlight strong { color:var(--accent-primary); }
.cost-result-grid .cost-highlight strong { font-size:24px; }
.apply-price { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:center; margin-top:16px; padding-top:16px; border-top:1px solid var(--border-light); }
.apply-price .primary { min-height:40px; white-space:nowrap; }
.cost-result h4 { margin:20px 0 8px; color:var(--text-secondary); font-size:11px; text-transform:uppercase; letter-spacing:.06em; }
.history-row { padding:9px 0; border-bottom:1px solid var(--border-light); color:var(--text-secondary); font-size:11px; }
.empty { color:var(--text-secondary); font-size:13px; }
@media (max-width:640px) { .production-heading { align-items:flex-start; flex-direction:column; } .production-header-actions { width:100%; flex-wrap:wrap; } .production-alert, .production-kpi { flex:1; } .production-kpi { box-sizing:border-box; text-align:left; } .form-grid, .ingredient-row { grid-template-columns:1fr; } .ingredient-row .icon-button { width:100%; } }
@media (max-width:900px) { .cost-result-grid { grid-template-columns:repeat(2,1fr); } }
@media (max-width:640px) { .cost-calculator { padding:16px; } .cost-ingredient-row, .apply-price { grid-template-columns:1fr; } .cost-result-grid { grid-template-columns:1fr; } .apply-price .primary { width:100%; } }
`;
