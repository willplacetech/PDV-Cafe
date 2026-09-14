import { useEffect, useState } from 'react';
import api from '../services/api.jsx';
import { useToast } from '../components/Toast.jsx';

const units = ['un', 'kg', 'g', 'l', 'ml'];
const emptyRecipe = { nome: '', produtoId: '', rendimento: '1', unidadeRendimento: 'un', ingredientes: [{ produtoId: '', quantidade: '', unidade: 'un' }] };
const emptyTransfer = { produtoId: '', origem: 'venda', destino: 'insumos', quantidade: '', observacao: '' };

const number = (value) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export default function Production() {
  const [tab, setTab] = useState('estoque');
  const [products, setProducts] = useState([]);
  const [stock, setStock] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [productionDashboard, setProductionDashboard] = useState(null);
  const [productionQuantity, setProductionQuantity] = useState('1');
  const [selectedRecipe, setSelectedRecipe] = useState('');
  const [recipeForm, setRecipeForm] = useState(emptyRecipe);
  const [transfer, setTransfer] = useState(emptyTransfer);
  const [saving, setSaving] = useState(false);
  const [costForm, setCostForm] = useState({ receitaId: '', custoEmbalagem: '0', custoIndireto: '0', maoDeObra: '0', precoVenda: '' });
  const [costResult, setCostResult] = useState(null);
  const [costHistory, setCostHistory] = useState([]);
  const [ingredientPrices, setIngredientPrices] = useState({});
  const [ingredientUnits, setIngredientUnits] = useState({});
  const [cascadeResult, setCascadeResult] = useState(null);
  const { showToast } = useToast();

  const load = async () => {
    try {
      const [productsResponse, stockResponse, recipesResponse, dashboardResponse] = await Promise.all([
        api.get('/products'),
        api.get('/production/stock?location=insumos'),
        api.get('/production/recipes'),
        api.get('/production/dashboard'),
      ]);
      setProducts(productsResponse.data);
      setStock(stockResponse.data);
      setRecipes(recipesResponse.data);
      setProductionDashboard(dashboardResponse.data);
    } catch (error) { showToast(error.response?.data?.msg || 'Não foi possível carregar a produção', 'error'); }
  };

  useEffect(() => { load(); }, []);

  const producibleProducts = products.filter((product) => product.producaoPropria);
  const stockProducts = products.filter((product) => product.controladoComoInsumo || Number(product.estoqueInsumos) > 0);
  const currentRecipe = recipes.find((recipe) => recipe._id === selectedRecipe);
  const costRecipe = recipes.find((recipe) => recipe._id === costForm.receitaId);
  const produtosSemCusto = products.filter((product) => Number(product.custoUnitario || product.custo || 0) <= 0);
  const produtosReajuste = products.filter((product) => product.reajusteRecomendado);

  const updateIngredient = (index, field, value) => {
    setRecipeForm((form) => ({ ...form, ingredientes: form.ingredientes.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  };

  const saveRecipe = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post('/production/recipes', { ...recipeForm, rendimento: Number(recipeForm.rendimento), ingredientes: recipeForm.ingredientes.map((item) => ({ ...item, quantidade: Number(item.quantidade) })) });
      showToast('Receita cadastrada com sucesso', 'success');
      setRecipeForm(emptyRecipe);
      await load();
    } catch (error) { showToast(error.response?.data?.msg || 'Não foi possível salvar a receita', 'error'); }
    finally { setSaving(false); }
  };

  const produce = async (event) => {
    event.preventDefault();
    if (!selectedRecipe) return showToast('Selecione uma receita', 'warning');
    setSaving(true);
    try {
      await api.post('/production/produce', { receitaId: selectedRecipe, quantidade: Number(productionQuantity) });
      showToast('Produção concluída e estoque abastecido', 'success');
      setProductionQuantity('1');
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
    if (!window.confirm('Excluir esta receita?')) return;
    try { await api.delete(`/production/recipes/${id}`); showToast('Receita removida', 'warning'); await load(); }
    catch (error) { showToast(error.response?.data?.msg || 'Não foi possível excluir a receita', 'error'); }
  };

  const saveIngredientPrice = async (product) => {
    const value = ingredientPrices[product._id] ?? product.precoCompra ?? '';
    try {
      const unidadeCompra = ingredientUnits[product._id] || product.unidadeCompra || 'kg';
      const response = await api.put(`/insumos/${product._id}/preco-compra`, { precoCompra: Number(value), unidadeCompra });
      setCascadeResult(response.data);
      showToast('Preço de compra atualizado e receitas recalculadas', 'success');
      await load();
    } catch (error) { showToast(error.response?.data?.msg || 'Não foi possível atualizar o preço do insumo', 'error'); }
  };

  const calculateCost = async (event) => {
    event.preventDefault();
    if (!costForm.receitaId) return showToast('Selecione uma receita', 'warning');
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
      await api.put(`/produtos/${costResult.produto._id}/aplicar-preco`, { preco: Number(costForm.precoVenda) });
      showToast('Preço de venda aplicado ao produto', 'success');
      await load();
    } catch (error) { showToast(error.response?.data?.msg || 'Não foi possível aplicar o preço', 'error'); }
  };

  return <div className="production-page">
    <header className="production-heading page-heading"><div><span className="production-eyebrow">GESTÃO DE INSUMOS</span><h1>Produção</h1><p>Controle ingredientes, receitas e produtos produzidos na casa.</p></div><div className="production-header-actions"><button type="button" className="production-alert" onClick={() => setTab('custos')}><strong>{produtosSemCusto.length}</strong><span>produtos sem custo</span></button><button type="button" className="production-alert" onClick={() => setTab('custos')}><strong>{produtosReajuste.length}</strong><span>reajustes recomendados</span></button><div className="production-kpi"><strong>{productionDashboard?.receitasPossiveis?.filter((recipe) => recipe.producoesPossiveis > 0).length || 0}</strong><span>receitas possíveis</span></div></div></header>
    <nav className="production-tabs" aria-label="Seções da produção">
      {[['estoque', 'Estoque de insumos'], ['receitas', 'Receitas'], ['produzir', 'Nova produção'], ['transferir', 'Transferências'], ['custos', 'Calculadora de custo']].map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}
    </nav>

    {tab === 'estoque' && <section className="production-section"><div className="section-heading"><div><h2>Estoque de insumos</h2><p>Itens abaixo do mínimo aparecem destacados.</p></div><strong>{stock.length} itens</strong></div><div className="stock-grid">{stock.length ? stock.map((product) => <article className={product.saldo <= product.minimo ? 'stock-card low' : 'stock-card'} key={product._id}><div><span>{product.codigo}</span><h3>{product.nome}</h3></div><b>{number(product.saldo)} <small>{product.unidadeVenda}</small></b><p>Mínimo: {number(product.minimo)} {product.unidadeVenda}</p></article>) : <p className="empty">Nenhum insumo controlado. Cadastre um produto com “Controlar também como insumo”.</p>}</div></section>}

    {tab === 'receitas' && <section className="production-section"><div className="section-heading"><div><h2>Receitas</h2><p>Vincule cada receita ao produto que ela abastece.</p></div></div><form className="recipe-form" onSubmit={saveRecipe}><div className="form-grid"><label>Nome da receita<input required value={recipeForm.nome} onChange={(event) => setRecipeForm({ ...recipeForm, nome: event.target.value })} placeholder="Ex.: Bolo de cenoura" /></label><label>Produto produzido<select required value={recipeForm.produtoId} onChange={(event) => setRecipeForm({ ...recipeForm, produtoId: event.target.value })}><option value="">Selecione</option>{producibleProducts.map((product) => <option key={product._id} value={product._id}>{product.nome}</option>)}</select></label><label>Rendimento<input type="number" min="0.001" step="0.001" required value={recipeForm.rendimento} onChange={(event) => setRecipeForm({ ...recipeForm, rendimento: event.target.value })} /></label><label>Unidade<select value={recipeForm.unidadeRendimento} onChange={(event) => setRecipeForm({ ...recipeForm, unidadeRendimento: event.target.value })}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></label></div><div className="ingredients-heading"><h3>Ingredientes</h3><button type="button" className="secondary" onClick={() => setRecipeForm({ ...recipeForm, ingredientes: [...recipeForm.ingredientes, { produtoId: '', quantidade: '', unidade: 'un' }] })}>Adicionar ingrediente</button></div>{recipeForm.ingredientes.map((ingredient, index) => <div className="ingredient-row" key={`${index}-${ingredient.produtoId}`}><select required value={ingredient.produtoId} onChange={(event) => updateIngredient(index, 'produtoId', event.target.value)}><option value="">Ingrediente</option>{stockProducts.map((product) => <option key={product._id} value={product._id}>{product.nome} · {number(product.estoqueInsumos)} {product.unidadeVenda}</option>)}</select><input type="number" min="0.001" step="0.001" required placeholder="Quantidade" value={ingredient.quantidade} onChange={(event) => updateIngredient(index, 'quantidade', event.target.value)} /><select value={ingredient.unidade} onChange={(event) => updateIngredient(index, 'unidade', event.target.value)}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select>{recipeForm.ingredientes.length > 1 && <button type="button" className="icon-button" title="Remover ingrediente" onClick={() => setRecipeForm({ ...recipeForm, ingredientes: recipeForm.ingredientes.filter((_, itemIndex) => itemIndex !== index) })}>×</button>}</div>)}<button className="primary" disabled={saving}>{saving ? 'Salvando...' : 'Cadastrar receita'}</button></form><div className="recipe-list">{recipes.map((recipe) => <article className="recipe-card" key={recipe._id}><div><span>Rendimento: {number(recipe.rendimento)} {recipe.unidadeRendimento}</span><h3>{recipe.nome}</h3><p>Abastece: {recipe.produtoId?.nome || 'Produto removido'}</p><small>{recipe.ingredientes?.length || 0} ingrediente(s)</small></div><button className="danger" onClick={() => deleteRecipe(recipe._id)}>Excluir</button></article>)}</div></section>}

    {tab === 'produzir' && <section className="production-section"><div className="section-heading"><div><h2>Iniciar nova produção</h2><p>Os insumos serão baixados e o produto vinculado será abastecido automaticamente.</p></div></div><form className="action-form" onSubmit={produce}><label>Receita<select required value={selectedRecipe} onChange={(event) => setSelectedRecipe(event.target.value)}><option value="">Selecione uma receita</option>{recipes.filter((recipe) => recipe.ativa).map((recipe) => <option key={recipe._id} value={recipe._id}>{recipe.nome} · {recipe.produtoId?.nome}</option>)}</select></label><label>Quantidade de receitas<input type="number" min="0.001" step="0.001" required value={productionQuantity} onChange={(event) => setProductionQuantity(event.target.value)} /></label>{currentRecipe && <div className="recipe-preview"><strong>Consumo previsto</strong>{currentRecipe.ingredientes.map((item) => <span key={String(item.produtoId?._id || item.produtoId)}>{item.produtoId?.nome}: {number(Number(item.quantidade) * Number(productionQuantity || 0))} {item.unidade}</span>)}<b>Entrada: {number(Number(currentRecipe.rendimento) * Number(productionQuantity || 0))} {currentRecipe.unidadeRendimento} de {currentRecipe.produtoId?.nome}</b></div>}<button className="primary" disabled={saving || !currentRecipe}>{saving ? 'Produzindo...' : 'Confirmar produção'}</button></form><div className="possible-list"><h3>Podem ser produzidas agora</h3>{productionDashboard?.receitasPossiveis?.map((recipe) => <div key={String(recipe.receitaId)}><span>{recipe.receitaNome} · {recipe.produtoNome}</span><b>{number(recipe.producoesPossiveis)} produção(ões)</b></div>)}</div></section>}

    {tab === 'transferir' && <section className="production-section"><div className="section-heading"><div><h2>Transferir entre estoques</h2><p>O mesmo produto pode existir nos dois estoques. A origem precisa ter saldo disponível.</p></div></div><form className="action-form" onSubmit={transferStock}><label>Produto<select required value={transfer.produtoId} onChange={(event) => setTransfer({ ...transfer, produtoId: event.target.value })}><option value="">Selecione</option>{products.map((product) => <option key={product._id} value={product._id}>{product.nome} · venda {number(product.estoque)} · insumos {number(product.estoqueInsumos)}</option>)}</select></label><div className="form-grid"><label>Origem<select value={transfer.origem} onChange={(event) => setTransfer({ ...transfer, origem: event.target.value })}><option value="venda">Estoque de venda</option><option value="insumos">Estoque de insumos</option></select></label><label>Destino<select value={transfer.destino} onChange={(event) => setTransfer({ ...transfer, destino: event.target.value })}><option value="insumos">Estoque de insumos</option><option value="venda">Estoque de venda</option></select></label></div><label>Quantidade<input type="number" min="0.001" step="0.001" required value={transfer.quantidade} onChange={(event) => setTransfer({ ...transfer, quantidade: event.target.value })} /></label><label>Observação<input value={transfer.observacao} onChange={(event) => setTransfer({ ...transfer, observacao: event.target.value })} placeholder="Motivo da transferência" /></label><button className="primary" disabled={saving}>{saving ? 'Transferindo...' : 'Confirmar transferência'}</button></form></section>}

    {tab === 'custos' && <section className="production-section cost-calculator"><div className="section-heading"><div><h2>Calculadora de custo e precificação</h2><p>Atualize insumos e calcule o custo real das receitas.</p></div></div>{produtosReajuste.length > 0 && <div className="cost-alert"><strong>Reajuste recomendado</strong>{produtosReajuste.map((product) => <div key={product._id}>{product.nome} · custo R$ {number(product.custoUnitario || product.custo)} · preço R$ {number(product.preco)}</div>)}</div>}<div className="cost-step"><h3>Passo 1 · Preço de compra dos insumos</h3><div className="cost-ingredient-list">{stockProducts.map((product) => <div className="cost-ingredient-row" key={product._id}><span><strong>{product.nome}</strong><small>Custo base: R$ {Number(product.custoUnitarioBase || 0).toFixed(6)}</small></span><input type="number" min="0" step="0.01" placeholder="Preço de compra" value={ingredientPrices[product._id] ?? product.precoCompra ?? ''} onChange={(event) => setIngredientPrices({ ...ingredientPrices, [product._id]: event.target.value })} /><select value={ingredientUnits[product._id] || product.unidadeCompra || 'kg'} onChange={(event) => setIngredientUnits({ ...ingredientUnits, [product._id]: event.target.value })}>{['kg', 'g', 'l', 'ml', 'un', 'dz'].map((unit) => <option key={unit}>{unit}</option>)}</select><button type="button" className="secondary" onClick={() => saveIngredientPrice(product)}>Salvar</button></div>)}</div>{cascadeResult?.afetados?.length > 0 && <div className="cost-alert">A alteração afetou {cascadeResult.afetados.length} receitas. Veja quais produtos precisam de reajuste: {cascadeResult.afetados.map((item) => <div key={item.produtoId}>{item.nome}: R$ {number(item.custoAntigo)} → R$ {number(item.custoNovo)} ({item.variacaoPercentual}%)</div>)}</div>}</div><div className="cost-step"><h3>Passo 2 e 3 · Receita e custos adicionais</h3><form className="form-grid" onSubmit={calculateCost}><label>Receita<select required value={costForm.receitaId} onChange={(event) => { setCostForm({ ...costForm, receitaId: event.target.value }); setCostResult(null); }}><option value="">Selecione</option>{recipes.map((recipe) => <option key={recipe._id} value={recipe._id}>{recipe.nome} · {recipe.produtoId?.nome}</option>)}</select></label><label>Embalagem por unidade<input type="number" min="0" step="0.01" value={costForm.custoEmbalagem} onChange={(event) => setCostForm({ ...costForm, custoEmbalagem: event.target.value })} /></label><label>Gás / energia<input type="number" min="0" step="0.01" value={costForm.custoIndireto} onChange={(event) => setCostForm({ ...costForm, custoIndireto: event.target.value })} /></label><label>Mão de obra<input type="number" min="0" step="0.01" value={costForm.maoDeObra} onChange={(event) => setCostForm({ ...costForm, maoDeObra: event.target.value })} /></label><button className="primary" disabled={saving}>{saving ? 'Calculando...' : 'Calcular custo'}</button></form>{costRecipe && <div className="recipe-preview"><strong>Ingredientes</strong>{costRecipe.ingredientes.map((item) => <span key={String(item.produtoId?._id || item.produtoId)}>{item.produtoId?.nome}: {number(item.quantidade)} {item.unidade} · custo base R$ {Number(item.produtoId?.custoUnitarioBase || 0).toFixed(6)}</span>)}</div>}</div>{costResult && <div className="cost-result"><h3>Passo 4 · Resultado</h3><div className="cost-result-grid"><div><small>Custo total</small><strong>R$ {number(costResult.custoTotal)}</strong></div><div className="cost-highlight"><small>Custo por unidade</small><strong>R$ {number(costResult.custoUnitario)}</strong></div><div><small>Markup 2x / 2,5x / 3x</small><strong>R$ {number(costResult.sugeridos.markup2x)} · R$ {number(costResult.sugeridos.markup2_5x)} · R$ {number(costResult.sugeridos.markup3x)}</strong></div><div><small>Margem 50% / 60% / 70%</small><strong>R$ {number(costResult.sugeridos.margem50)} · R$ {number(costResult.sugeridos.margem60)} · R$ {number(costResult.sugeridos.margem70)}</strong></div></div><div className="apply-price"><input type="number" min="0" step="0.01" placeholder="Preço de venda definido" value={costForm.precoVenda} onChange={(event) => setCostForm({ ...costForm, precoVenda: event.target.value })} /><button type="button" className="primary" onClick={applyCostPrice}>Aplicar preço no produto</button></div><h4>Histórico de custo</h4>{costHistory.map((item) => <div className="history-row" key={item._id}>{new Date(item.data).toLocaleDateString('pt-BR')} · R$ {number(item.custoUnitario)} · {item.motivo}</div>)}</div>}</section>}

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
.recipe-form input, .recipe-form select, .action-form input, .action-form select { box-sizing:border-box; width:100%; min-height:44px; padding:9px 11px; border:1px solid var(--border-color); border-radius:8px; background:var(--input-bg); color:var(--input-text); font:inherit; }
.ingredient-row { display:grid; grid-template-columns:minmax(0,2fr) minmax(100px,1fr) 80px 36px; gap:8px; }
.secondary, .primary, .danger, .icon-button { min-height:38px; padding:8px 12px; border-radius:8px; font-weight:700; cursor:pointer; }
.secondary { border:1px solid var(--accent-border); background:var(--accent-light); color:var(--accent-primary); }
.primary { border:0; background:var(--accent-primary); color:#fff; }
.danger { border:1px solid rgba(220,38,38,.2); background:rgba(220,38,38,.08); color:var(--error-bg); }
.icon-button { border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--error-bg); font-size:18px; }
.recipe-card { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
.recipe-preview { display:grid; gap:6px; padding:14px; border:1px solid var(--accent-border); border-radius:10px; background:var(--accent-light); color:var(--text-secondary); font-size:12px; }
.recipe-preview strong, .recipe-preview b { color:var(--accent-primary); }
.possible-list { display:grid; gap:8px; }
.possible-list h3 { margin-bottom:4px; }
.possible-list div { display:flex; justify-content:space-between; gap:10px; padding:8px 0; border-bottom:1px solid var(--border-light); font-size:12px; }
.possible-list b { color:var(--accent-primary); white-space:nowrap; }
.cost-calculator { display:grid; gap:0; padding:20px; }
.cost-calculator > .section-heading { margin-bottom:0; padding-bottom:18px; border-bottom:1px solid var(--border-light); }
.cost-calculator > .section-heading h2 { font-size:20px; }
.cost-step, .cost-result { padding:20px 0; border:0; border-bottom:1px solid var(--border-light); border-radius:0; background:transparent; }
.cost-step h3, .cost-result h3 { margin:0 0 14px; color:var(--text-primary); font-size:14px; }
.cost-step h3::first-letter { color:var(--accent-primary); }
.cost-ingredient-list { display:grid; gap:0; border:1px solid var(--border-color); border-radius:10px; overflow:hidden; background:var(--bg-secondary); }
.cost-ingredient-row { display:grid; grid-template-columns:minmax(0,1fr) 150px 92px 86px; align-items:center; gap:10px; padding:10px 12px; border-bottom:1px solid var(--border-light); }
.cost-ingredient-row:last-child { border-bottom:0; }
.cost-ingredient-row:hover { background:var(--bg-tertiary); }
.cost-ingredient-row span { display:grid; gap:3px; color:var(--text-primary); font-size:13px; }
.cost-ingredient-row small { color:var(--text-secondary); font-size:11px; }
.cost-ingredient-row input, .cost-ingredient-row select, .apply-price input { min-height:40px; box-sizing:border-box; width:100%; padding:8px 10px; border:1px solid var(--border-color); border-radius:8px; background:var(--input-bg); color:var(--input-text); font:inherit; }
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
