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

  return <div className="production-page">
    <header className="production-heading page-heading"><div><span className="production-eyebrow">GESTÃO DE INSUMOS</span><h1>Produção</h1><p>Controle ingredientes, receitas e produtos produzidos na casa.</p></div><div className="production-kpi"><strong>{productionDashboard?.receitasPossiveis?.filter((recipe) => recipe.producoesPossiveis > 0).length || 0}</strong><span>receitas possíveis</span></div></header>
    <nav className="production-tabs" aria-label="Seções da produção">
      {[['estoque', 'Estoque de insumos'], ['receitas', 'Receitas'], ['produzir', 'Nova produção'], ['transferir', 'Transferências']].map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}
    </nav>

    {tab === 'estoque' && <section className="production-section"><div className="section-heading"><div><h2>Estoque de insumos</h2><p>Itens abaixo do mínimo aparecem destacados.</p></div><strong>{stock.length} itens</strong></div><div className="stock-grid">{stock.length ? stock.map((product) => <article className={product.saldo <= product.minimo ? 'stock-card low' : 'stock-card'} key={product._id}><div><span>{product.codigo}</span><h3>{product.nome}</h3></div><b>{number(product.saldo)} <small>{product.unidadeVenda}</small></b><p>Mínimo: {number(product.minimo)} {product.unidadeVenda}</p></article>) : <p className="empty">Nenhum insumo controlado. Cadastre um produto com “Controlar também como insumo”.</p>}</div></section>}

    {tab === 'receitas' && <section className="production-section"><div className="section-heading"><div><h2>Receitas</h2><p>Vincule cada receita ao produto que ela abastece.</p></div></div><form className="recipe-form" onSubmit={saveRecipe}><div className="form-grid"><label>Nome da receita<input required value={recipeForm.nome} onChange={(event) => setRecipeForm({ ...recipeForm, nome: event.target.value })} placeholder="Ex.: Bolo de cenoura" /></label><label>Produto produzido<select required value={recipeForm.produtoId} onChange={(event) => setRecipeForm({ ...recipeForm, produtoId: event.target.value })}><option value="">Selecione</option>{producibleProducts.map((product) => <option key={product._id} value={product._id}>{product.nome}</option>)}</select></label><label>Rendimento<input type="number" min="0.001" step="0.001" required value={recipeForm.rendimento} onChange={(event) => setRecipeForm({ ...recipeForm, rendimento: event.target.value })} /></label><label>Unidade<select value={recipeForm.unidadeRendimento} onChange={(event) => setRecipeForm({ ...recipeForm, unidadeRendimento: event.target.value })}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></label></div><div className="ingredients-heading"><h3>Ingredientes</h3><button type="button" className="secondary" onClick={() => setRecipeForm({ ...recipeForm, ingredientes: [...recipeForm.ingredientes, { produtoId: '', quantidade: '', unidade: 'un' }] })}>Adicionar ingrediente</button></div>{recipeForm.ingredientes.map((ingredient, index) => <div className="ingredient-row" key={`${index}-${ingredient.produtoId}`}><select required value={ingredient.produtoId} onChange={(event) => updateIngredient(index, 'produtoId', event.target.value)}><option value="">Ingrediente</option>{stockProducts.map((product) => <option key={product._id} value={product._id}>{product.nome} · {number(product.estoqueInsumos)} {product.unidadeVenda}</option>)}</select><input type="number" min="0.001" step="0.001" required placeholder="Quantidade" value={ingredient.quantidade} onChange={(event) => updateIngredient(index, 'quantidade', event.target.value)} /><select value={ingredient.unidade} onChange={(event) => updateIngredient(index, 'unidade', event.target.value)}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select>{recipeForm.ingredientes.length > 1 && <button type="button" className="icon-button" title="Remover ingrediente" onClick={() => setRecipeForm({ ...recipeForm, ingredientes: recipeForm.ingredientes.filter((_, itemIndex) => itemIndex !== index) })}>×</button>}</div>)}<button className="primary" disabled={saving}>{saving ? 'Salvando...' : 'Cadastrar receita'}</button></form><div className="recipe-list">{recipes.map((recipe) => <article className="recipe-card" key={recipe._id}><div><span>Rendimento: {number(recipe.rendimento)} {recipe.unidadeRendimento}</span><h3>{recipe.nome}</h3><p>Abastece: {recipe.produtoId?.nome || 'Produto removido'}</p><small>{recipe.ingredientes?.length || 0} ingrediente(s)</small></div><button className="danger" onClick={() => deleteRecipe(recipe._id)}>Excluir</button></article>)}</div></section>}

    {tab === 'produzir' && <section className="production-section"><div className="section-heading"><div><h2>Iniciar nova produção</h2><p>Os insumos serão baixados e o produto vinculado será abastecido automaticamente.</p></div></div><form className="action-form" onSubmit={produce}><label>Receita<select required value={selectedRecipe} onChange={(event) => setSelectedRecipe(event.target.value)}><option value="">Selecione uma receita</option>{recipes.filter((recipe) => recipe.ativa).map((recipe) => <option key={recipe._id} value={recipe._id}>{recipe.nome} · {recipe.produtoId?.nome}</option>)}</select></label><label>Quantidade de receitas<input type="number" min="0.001" step="0.001" required value={productionQuantity} onChange={(event) => setProductionQuantity(event.target.value)} /></label>{currentRecipe && <div className="recipe-preview"><strong>Consumo previsto</strong>{currentRecipe.ingredientes.map((item) => <span key={String(item.produtoId?._id || item.produtoId)}>{item.produtoId?.nome}: {number(Number(item.quantidade) * Number(productionQuantity || 0))} {item.unidade}</span>)}<b>Entrada: {number(Number(currentRecipe.rendimento) * Number(productionQuantity || 0))} {currentRecipe.unidadeRendimento} de {currentRecipe.produtoId?.nome}</b></div>}<button className="primary" disabled={saving || !currentRecipe}>{saving ? 'Produzindo...' : 'Confirmar produção'}</button></form><div className="possible-list"><h3>Podem ser produzidas agora</h3>{productionDashboard?.receitasPossiveis?.map((recipe) => <div key={String(recipe.receitaId)}><span>{recipe.receitaNome} · {recipe.produtoNome}</span><b>{number(recipe.producoesPossiveis)} produção(ões)</b></div>)}</div></section>}

    {tab === 'transferir' && <section className="production-section"><div className="section-heading"><div><h2>Transferir entre estoques</h2><p>O mesmo produto pode existir nos dois estoques. A origem precisa ter saldo disponível.</p></div></div><form className="action-form" onSubmit={transferStock}><label>Produto<select required value={transfer.produtoId} onChange={(event) => setTransfer({ ...transfer, produtoId: event.target.value })}><option value="">Selecione</option>{products.map((product) => <option key={product._id} value={product._id}>{product.nome} · venda {number(product.estoque)} · insumos {number(product.estoqueInsumos)}</option>)}</select></label><div className="form-grid"><label>Origem<select value={transfer.origem} onChange={(event) => setTransfer({ ...transfer, origem: event.target.value })}><option value="venda">Estoque de venda</option><option value="insumos">Estoque de insumos</option></select></label><label>Destino<select value={transfer.destino} onChange={(event) => setTransfer({ ...transfer, destino: event.target.value })}><option value="insumos">Estoque de insumos</option><option value="venda">Estoque de venda</option></select></label></div><label>Quantidade<input type="number" min="0.001" step="0.001" required value={transfer.quantidade} onChange={(event) => setTransfer({ ...transfer, quantidade: event.target.value })} /></label><label>Observação<input value={transfer.observacao} onChange={(event) => setTransfer({ ...transfer, observacao: event.target.value })} placeholder="Motivo da transferência" /></label><button className="primary" disabled={saving}>{saving ? 'Transferindo...' : 'Confirmar transferência'}</button></form></section>}

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
.empty { color:var(--text-secondary); font-size:13px; }
@media (max-width:640px) { .production-heading { align-items:flex-start; flex-direction:column; } .production-kpi { width:100%; box-sizing:border-box; text-align:left; } .form-grid, .ingredient-row { grid-template-columns:1fr; } .ingredient-row .icon-button { width:100%; } }
`;
