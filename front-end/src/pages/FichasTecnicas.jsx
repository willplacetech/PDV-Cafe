import { useCallback, useContext, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api.jsx';
import { useToast } from '../components/useToast.js';
import { AuthContext } from '../context/AuthContextDefinition.jsx';

const units = ['kg', 'L', 'un'];
const factors = { g: 0.001, kg: 1, ml: 0.001, l: 1, L: 1, un: 1 };
const emptyRecipe = { nome: '', produtoId: '', rendimento: '1', unidadeRendimento: 'un', ingredientes: [{ produtoId: '', quantidade: '', unidade: 'un' }] };
const money = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const tipoDoProduto = (product) => {
  const safeProduct = product || {};
  return safeProduct.aFazer ? 'coz' : safeProduct.producaoPropria ? 'producao' : safeProduct.tipoProduto || 'revenda';
};

export default function FichasTecnicas({ embedded = false }) {
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [recipeForm, setRecipeForm] = useState(emptyRecipe);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const { user } = useContext(AuthContext);
  const canEdit = user?.role === 'admin';

  const load = useCallback(async () => {
    try {
      const [productsResponse, recipesResponse] = await Promise.all([api.get('/products'), api.get('/production/recipes')]);
      setProducts(Array.isArray(productsResponse.data) ? productsResponse.data.filter(Boolean) : []);
      setRecipes(Array.isArray(recipesResponse.data) ? recipesResponse.data.filter(Boolean) : []);
    } catch (error) {
      showToast(error.response?.data?.msg || 'Não foi possível carregar as fichas técnicas', 'error');
    } finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => {
    const inicializar = async () => { await load(); };
    inicializar();
  }, [load]);

  const recipeProducts = products.filter((product) => product && ['coz', 'producao'].includes(tipoDoProduto(product)));
  const ingredients = products.filter((product) => product && (product.tipo === 'insumo' || product.usavelEmReceita));
  const ingredientById = (id) => ingredients.find((product) => String(product._id) === String(id));

  const availability = (recipe) => {
    if (recipe?._id && recipe.disponibilidade) {
      return {
        quantity: Number(recipe.disponibilidade.quantidade || 0),
        limiting: recipe.disponibilidade.limitante || 'Nenhum ingrediente',
      };
    }
    const tipo = tipoDoProduto(recipe.produtoId);
    if (tipo === 'producao') return { quantity: Number(recipe.produtoId?.estoque || 0), limiting: 'Estoque do produto' };
    const values = (recipe.ingredientes || []).filter(Boolean).map((item) => {
      const product = ingredientById(item.produtoId?._id || item.produtoId);
      const stock = Number(product?.resumoInsumo?.totalBase ?? product?.estoqueInsumos ?? product?.estoque ?? 0);
      const consumption = Number(item.quantidade || 0) * (factors[item.unidade] || 1);
      return { product, value: consumption > 0 ? Math.floor(stock / consumption) : 0 };
    });
    const limit = values.length ? Math.min(...values.map((item) => item.value)) : 0;
    return { quantity: limit * Number(recipe.rendimento || 1), limiting: values.find((item) => item.value === limit)?.product?.nome || 'Nenhum ingrediente' };
  };

  const cost = (recipe) => (recipe.ingredientes || []).filter(Boolean).reduce((total, item) => {
    const product = ingredientById(item.produtoId?._id || item.produtoId);
    return total + Number(item.quantidade || 0) * (factors[item.unidade] || 1) * Number(product?.resumoInsumo?.custoUnitarioBase || product?.custoUnitarioBase || product?.custoUnitario || 0);
  }, 0);

  const filteredRecipes = recipes.filter((recipe) => {
    if (!recipe || !Array.isArray(recipe.ingredientes)) return false;
    const product = recipe.produtoId || {};
    const tipo = tipoDoProduto(product);
    const typeOk = filter === 'todos' || (filter === 'coz' ? tipo === 'coz' : tipo === 'producao');
    return typeOk && String(product.nome || recipe.nome).toLowerCase().includes(search.toLowerCase()) && recipe.ingredientes.every(Boolean);
  });

  const startEdit = useCallback((recipe) => {
    setEditingId(recipe._id);
    setRecipeForm({ nome: recipe.nome, produtoId: recipe.produtoId?._id || recipe.produtoId, rendimento: String(recipe.rendimento), unidadeRendimento: recipe.unidadeRendimento, ingredientes: (recipe.ingredientes || []).filter(Boolean).map((item) => ({ produtoId: item.produtoId?._id || item.produtoId, quantidade: String(item.quantidade), unidade: item.unidade })) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const productId = searchParams.get('produto');
    if (productId && recipes.length) {
      const recipe = recipes.find((item) => String(item.produtoId?._id || item.produtoId) === productId);
      if (recipe) {
        const selecionar = async () => { startEdit(recipe); };
        selecionar();
      }
    }
  }, [recipes, searchParams, startEdit]);

  const duplicate = (recipe) => {
    setEditingId(null);
    setRecipeForm({ nome: `${recipe.nome} (cópia)`, produtoId: '', rendimento: String(recipe.rendimento), unidadeRendimento: recipe.unidadeRendimento, ingredientes: (recipe.ingredientes || []).filter(Boolean).map((item) => ({ produtoId: item.produtoId?._id || item.produtoId, quantidade: String(item.quantidade), unidade: item.unidade })) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const produto = recipeProducts.find((item) => String(item._id) === String(recipeForm.produtoId));
      const tipoProduto = tipoDoProduto(produto);
      const payload = { ...recipeForm, rendimento: tipoProduto === 'coz' ? 1 : Number(recipeForm.rendimento), ingredientes: recipeForm.ingredientes.map((item) => ({ produtoId: item.produtoId, quantidade: Number(item.quantidade), unidade: item.unidade })) };
      const salvar = (dados) => editingId ? api.put(`/production/recipes/${editingId}`, dados) : api.post('/production/recipes', dados);
      try {
        await salvar(payload);
      } catch (error) {
        const divergencia = error.response?.data?.divergencia;
        if (!editingId || !error.response?.data?.requireConfirmation || !divergencia || !window.confirm(`${error.response.data.msg}\n\n${divergencia.mensagem}\n\nDeseja salvar mesmo assim?`)) throw error;
        await salvar({ ...payload, confirmarDivergenciaCusto: true });
      }
      showToast(editingId ? 'Ficha atualizada' : 'Ficha criada', 'success');
      setEditingId(null); setRecipeForm(emptyRecipe); await load();
    } catch (error) { showToast(error.response?.data?.msg || 'Não foi possível salvar a ficha', 'error'); }
    finally { setSaving(false); }
  };

  const remove = async (recipe) => {
    if (!window.confirm(`Excluir a ficha de ${recipe.produtoId?.nome || recipe.nome}? O produto não será excluído.`)) return;
    try { await api.delete(`/production/recipes/${recipe._id}`); showToast('Ficha excluída; produto mantido', 'success'); await load(); }
    catch (error) { showToast(error.response?.data?.msg || 'Não foi possível excluir a ficha', 'error'); }
  };

  return <div className={`technical-sheets-page ${embedded ? 'embedded' : ''} ${canEdit ? '' : 'read-only'}`}>
    {!embedded && <header className="page-heading"><div><span className="production-eyebrow">PRODUÇÃO</span><h1>📋 Ficha técnica</h1><p>Ficha técnica, ingredientes, custo e disponibilidade em um único lugar.</p></div><strong className="technical-sheets-count">{recipes.length} ficha(s)</strong></header>}
    {canEdit && <form className="technical-sheet-form" onSubmit={save}><div className="section-heading"><div><h2>{editingId ? 'Editar ficha técnica' : 'Nova ficha técnica'}</h2><p>Vincule uma ficha técnica a um produto Coz ou de produção própria.</p></div></div><div className="technical-sheet-grid"><label>Produto vinculado<select required value={recipeForm.produtoId} onChange={(event) => { const product = recipeProducts.find((item) => item._id === event.target.value); setRecipeForm({ ...recipeForm, produtoId: event.target.value, nome: recipeForm.nome || product?.nome || '' }); }}><option value="">Selecione um produto</option>{recipeProducts.map((product) => <option key={product._id} value={product._id}>{product.nome} · {product.aFazer ? 'Coz' : 'Produção Própria'}</option>)}</select></label><label>Nome da ficha<input required value={recipeForm.nome} onChange={(event) => setRecipeForm({ ...recipeForm, nome: event.target.value })} /></label><label>Rendimento<input required type="number" min="0.001" step="0.001" value={recipeForm.rendimento} onChange={(event) => setRecipeForm({ ...recipeForm, rendimento: event.target.value })} /></label><label>Unidade do rendimento<select value={recipeForm.unidadeRendimento} onChange={(event) => setRecipeForm({ ...recipeForm, unidadeRendimento: event.target.value })}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></label></div><div className="technical-ingredients-heading"><h3>Ingredientes</h3><button type="button" className="secondary" onClick={() => setRecipeForm({ ...recipeForm, ingredientes: [...recipeForm.ingredientes, { produtoId: '', quantidade: '', unidade: 'un' }] })}>+ Adicionar ingrediente</button></div><div className="technical-ingredients">{recipeForm.ingredientes.map((item, index) => <div className="technical-ingredient-row" key={`${index}-${item.produtoId}`}><select required value={item.produtoId} onChange={(event) => setRecipeForm({ ...recipeForm, ingredientes: recipeForm.ingredientes.map((current, currentIndex) => currentIndex === index ? { ...current, produtoId: event.target.value } : current) })}><option value="">Insumo</option>{ingredients.map((product) => <option key={product._id} value={product._id}>{product.nome}</option>)}</select><input required type="number" min="0.001" step="0.001" value={item.quantidade} onChange={(event) => setRecipeForm({ ...recipeForm, ingredientes: recipeForm.ingredientes.map((current, currentIndex) => currentIndex === index ? { ...current, quantidade: event.target.value } : current) })} placeholder="Quantidade" /><select value={item.unidade} onChange={(event) => setRecipeForm({ ...recipeForm, ingredientes: recipeForm.ingredientes.map((current, currentIndex) => currentIndex === index ? { ...current, unidade: event.target.value } : current) })}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select><button type="button" className="danger" disabled={recipeForm.ingredientes.length === 1} onClick={() => setRecipeForm({ ...recipeForm, ingredientes: recipeForm.ingredientes.filter((_, currentIndex) => currentIndex !== index) })}>Remover</button></div>)}</div>{recipeForm.produtoId && <div className="technical-calculation"><span>Custo total: <strong>{money(cost(recipeForm))}</strong></span><span>Custo por unidade: <strong>{money(cost(recipeForm) / Math.max(1, Number(recipeForm.rendimento || 1)))}</strong></span><span>Disponível para fazer: <strong>{availability(recipeForm).quantity} {recipeForm.unidadeRendimento}</strong></span><small>Ingrediente limitante: {availability(recipeForm).limiting}</small></div>}<div className="technical-form-actions"><button className="primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar ficha'}</button>{editingId && <button type="button" className="secondary" onClick={() => { setEditingId(null); setRecipeForm(emptyRecipe); }}>Voltar</button>}</div></form>}
    <section className="technical-sheet-list"><div className="section-heading"><div><h2>Lista de fichas</h2><p>Disponibilidade calculada com o estoque atual dos insumos.</p></div></div><div className="technical-filters"><div><button type="button" className={filter === 'todos' ? 'active' : ''} onClick={() => setFilter('todos')}>Todas</button><button type="button" className={filter === 'coz' ? 'active' : ''} onClick={() => setFilter('coz')}>Coz</button><button type="button" className={filter === 'producao' ? 'active' : ''} onClick={() => setFilter('producao')}>Produção Própria</button></div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome" /></div>{loading ? <p className="empty">Carregando fichas...</p> : filteredRecipes.length ? <div className="technical-table-wrap"><table className="technical-table"><thead><tr><th>Produto</th><th>Tipo</th><th>Disponível</th><th>Custo/unidade</th><th>Ações</th></tr></thead><tbody>{filteredRecipes.map((recipe) => { const current = availability(recipe); const className = current.quantity >= 5 ? 'technical-good' : current.quantity > 0 ? 'technical-warning' : 'technical-empty'; return <tr key={recipe._id}><td><strong>{recipe.produtoId?.nome || recipe.nome}</strong><small>{recipe.nome}</small></td><td>{recipe.tipoFicha === 'coz' ? 'Coz' : 'Produção Própria'}</td><td><button type="button" className={`technical-availability ${className}`} title={`Ingrediente limitante: ${current.limiting}`}>{current.quantity >= 5 ? '✅' : current.quantity > 0 ? '⚠️' : '❌'} {current.quantity} {recipe.unidadeRendimento}</button></td><td>{money(recipe.custoUnitario)}</td><td><div className="technical-actions"><button type="button" className="secondary" onClick={() => startEdit(recipe)}>✏️</button><button type="button" className="secondary" onClick={() => duplicate(recipe)}>📋</button><button type="button" className="danger" onClick={() => remove(recipe)}>🗑️</button></div></td></tr>; })}</tbody></table></div> : <p className="empty">Nenhuma ficha técnica encontrada.</p>}</section>
    <style>{styles}</style>
    <style>{readOnlyStyles}</style>
  </div>;
}

const styles = `.technical-sheets-page{display:grid;gap:16px;color:var(--text-primary)}.technical-sheets-count{padding:10px 13px;border:1px solid var(--accent-border);border-radius:10px;background:var(--accent-light);color:var(--accent-primary);font-size:12px}.technical-sheet-form,.technical-sheet-list{padding:18px;border:1px solid var(--border-color);border-radius:16px;background:var(--bg-secondary);box-shadow:var(--shadow-sm)}.technical-sheet-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.technical-sheet-grid label{display:grid;gap:5px;color:var(--text-secondary);font-size:12px;font-weight:700}.technical-sheet-grid input,.technical-sheet-grid select,.technical-ingredient-row input,.technical-ingredient-row select,.technical-filters input{box-sizing:border-box;width:100%;min-height:42px;padding:9px 11px;border:1px solid var(--input-border);border-radius:8px;background:var(--input-bg);color:var(--input-text);font:inherit}.technical-ingredients-heading{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:20px 0 10px}.technical-ingredients-heading h3{margin:0;font-size:16px}.technical-ingredients{display:grid;gap:8px}.technical-ingredient-row{display:grid;grid-template-columns:1.5fr 1fr .8fr auto;gap:8px;padding:10px;border:1px solid var(--border-light);border-radius:9px;background:var(--bg-tertiary)}.technical-calculation{display:flex;flex-wrap:wrap;gap:18px;margin-top:14px;padding:14px;border:1px solid var(--accent-border);border-radius:10px;background:var(--accent-light);color:var(--text-secondary);font-size:12px}.technical-calculation strong{color:var(--accent-primary);font-size:15px}.technical-calculation small{width:100%}.technical-form-actions{display:flex;gap:8px;margin-top:16px}.technical-form-actions .primary,.technical-form-actions .secondary{margin-top:0}.technical-filters{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}.technical-filters>div{display:flex;gap:6px}.technical-filters button{min-height:38px;padding:8px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-tertiary);color:var(--text-secondary);font-weight:700;cursor:pointer}.technical-filters button.active{border-color:var(--accent-primary);background:var(--accent-primary);color:#fff}.technical-filters input{width:min(260px,100%)}.technical-table-wrap{overflow-x:auto}.technical-table{width:100%;min-width:700px;border-collapse:collapse}.technical-table th,.technical-table td{padding:11px 10px;border-bottom:1px solid var(--border-light);text-align:left;font-size:12px}.technical-table th{color:var(--text-secondary);font-size:11px;text-transform:uppercase}.technical-table td:first-child{display:grid;gap:3px}.technical-table td small{color:var(--text-secondary)}.technical-availability{border:0;background:transparent;font-weight:800;cursor:help}.technical-good{color:var(--success-bg)}.technical-warning{color:var(--warning-bg)}.technical-empty{color:var(--error-bg)}.technical-actions{display:flex;gap:5px}.technical-actions button{min-width:36px;padding:7px}.empty{color:var(--text-secondary);font-size:13px}@media(max-width:900px){.technical-sheet-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.technical-sheets-count{display:none}.technical-sheet-grid,.technical-ingredient-row{grid-template-columns:1fr}.technical-ingredients-heading,.technical-filters{align-items:stretch;flex-direction:column}.technical-ingredients-heading button,.technical-form-actions button{width:100%}.technical-form-actions{display:grid}.technical-filters>div{overflow-x:auto}.technical-filters button{white-space:nowrap}.technical-filters input{width:100%}}`;

const readOnlyStyles = `.technical-sheets-page.read-only .technical-actions{display:none}`;
