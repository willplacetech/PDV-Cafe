import { useEffect, useState } from 'react';
import api from '../services/api.jsx';
import { useToast } from '../components/Toast.jsx';
import AreaTabs from '../components/AreaTabs.jsx';

const units = ['mg', 'g', 'kg', 'ml', 'l', 'un'];
const newItem = () => ({ produtoId: '', valorTotal: '', qtdEmbalagens: '', conteudoPorEmbalagem: '', unidadeConteudo: 'kg' });
const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const number = (value) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 6 });

export default function Purchases() {
  const [products, setProducts] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [form, setForm] = useState({ fornecedor: '', numeroNF: '', data: today(), metodoCusteio: 'media_ponderada', itens: [newItem()] });
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    try {
      const [productsResponse, purchasesResponse] = await Promise.all([api.get('/products'), api.get('/compras')]);
      setProducts((productsResponse.data || []).filter((product) => product.tipo === 'insumo' || product.usavelEmReceita));
      setPurchases(purchasesResponse.data || []);
    } catch (error) {
      showToast(error.response?.data?.msg || 'Nao foi possivel carregar as compras', 'error');
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [productsResponse, purchasesResponse] = await Promise.all([api.get('/products'), api.get('/compras')]);
        setProducts((productsResponse.data || []).filter((product) => product.tipo === 'insumo' || product.usavelEmReceita));
        setPurchases(purchasesResponse.data || []);
      } catch (error) {
        showToast(error.response?.data?.msg || 'Nao foi possivel carregar as compras', 'error');
      }
    };
    loadInitialData();
  }, [showToast]);

  const updateItem = (index, field, value) => {
    setForm((current) => ({ ...current, itens: current.itens.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  };

  const addItem = () => setForm((current) => ({ ...current, itens: [...current.itens, newItem()] }));
  const removeItem = (index) => setForm((current) => ({ ...current, itens: current.itens.length === 1 ? current.itens : current.itens.filter((_, itemIndex) => itemIndex !== index) }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const itens = form.itens.map((item) => ({ ...item, valorTotal: Number(item.valorTotal), qtdEmbalagens: Number(item.qtdEmbalagens), conteudoPorEmbalagem: Number(item.conteudoPorEmbalagem) }));
      await api.post('/compras', { ...form, itens });
      showToast('Compra registrada e estoque atualizado', 'success');
      setForm({ fornecedor: '', numeroNF: '', data: today(), metodoCusteio: 'media_ponderada', itens: [newItem()] });
      await load();
    } catch (error) {
      showToast(error.response?.data?.msg || 'Nao foi possivel registrar a compra', 'error');
    } finally {
      setSaving(false);
    }
  };

  return <div className="purchases-page">
      <AreaTabs area="compras" />
    <header className="page-heading"><div><span className="purchases-eyebrow">PRODUCAO / COMPRAS</span><h1>Compras</h1><p>Registre entradas de insumos e atualize o custo pelo recebimento.</p></div></header>
    <form className="purchases-form" onSubmit={submit}>
      <div className="purchases-grid">
        <label>Fornecedor<input required value={form.fornecedor} onChange={(event) => setForm({ ...form, fornecedor: event.target.value })} /></label>
        <label>Numero da NF<input required value={form.numeroNF} onChange={(event) => setForm({ ...form, numeroNF: event.target.value })} /></label>
        <label>Data<input required type="date" value={form.data} onChange={(event) => setForm({ ...form, data: event.target.value })} /></label>
        <label>Atualizacao de custo<select value={form.metodoCusteio} onChange={(event) => setForm({ ...form, metodoCusteio: event.target.value })}><option value="media_ponderada">Media ponderada</option><option value="ultimo_preco">Ultimo preco</option></select></label>
      </div>
      <div className="purchases-section-heading"><h2>Itens da compra</h2><button type="button" className="secondary" onClick={addItem}>Adicionar item</button></div>
      <div className="purchase-items">{form.itens.map((item, index) => {
        const total = Number(item.qtdEmbalagens || 0) * Number(item.conteudoPorEmbalagem || 0);
        const unitCost = Number(item.valorTotal || 0) / (total || 1);
        return <div className="purchase-item" key={`purchase-item-${index}`}>
          <label>Produto comprado<select required value={item.produtoId} onChange={(event) => updateItem(index, 'produtoId', event.target.value)}><option value="">Selecione</option>{products.map((product) => <option key={product._id} value={product._id}>{product.nome} [{product.tipo === 'insumo' ? 'Insumo' : 'Venda + Insumo'}]</option>)}</select></label>
          <label>Valor total<input required type="number" min="0.000001" step="0.01" value={item.valorTotal} onChange={(event) => updateItem(index, 'valorTotal', event.target.value)} /></label>
          <label>Qtd. embalagens<input required type="number" min="0.000001" step="0.001" value={item.qtdEmbalagens} onChange={(event) => updateItem(index, 'qtdEmbalagens', event.target.value)} /></label>
          <label>Conteudo por embalagem<input required type="number" min="0.000001" step="0.001" value={item.conteudoPorEmbalagem} onChange={(event) => updateItem(index, 'conteudoPorEmbalagem', event.target.value)} /></label>
          <label>Unidade<select required value={item.unidadeConteudo} onChange={(event) => updateItem(index, 'unidadeConteudo', event.target.value)}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
          <div className="purchase-calculation"><span>Total: <strong>{number(total)} {item.unidadeConteudo}</strong></span><span>Custo unitario: <strong>{money(unitCost)} / {item.unidadeConteudo}</strong></span></div>
          <button type="button" className="danger" onClick={() => removeItem(index)} disabled={form.itens.length === 1}>Remover</button>
        </div>;
      })}</div>
      <button className="primary" disabled={saving}>{saving ? 'Registrando...' : 'Registrar compra'}</button>
    </form>
    <section className="purchases-history"><div className="purchases-section-heading"><h2>Historico de compras</h2><span>{purchases.length} registro(s)</span></div>{purchases.length ? purchases.map((purchase) => <article key={purchase._id}><div><strong>{purchase.fornecedor}</strong><span>NF {purchase.numeroNF} · {new Date(purchase.data).toLocaleDateString('pt-BR')}</span></div><b>{money(purchase.valorTotal)}</b></article>) : <p>Nenhuma compra registrada.</p>}</section>
    <style>{styles}</style>
  </div>;
}

const styles = `.purchases-page{display:grid;gap:16px;color:var(--text-primary)}.purchases-eyebrow{color:var(--accent-primary);font-size:10px;font-weight:800;letter-spacing:.1em}.purchases-form,.purchases-history{padding:18px;border:1px solid var(--border-color);border-radius:16px;background:var(--bg-secondary);box-shadow:var(--shadow-sm)}.purchases-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.purchases-form label{display:grid;gap:5px;color:var(--text-secondary);font-size:12px;font-weight:700}.purchases-form input,.purchases-form select{box-sizing:border-box;width:100%;min-height:42px;padding:9px 11px;border:1px solid var(--border-color);border-radius:8px;background:var(--input-bg);color:var(--input-text);font:inherit}.purchases-section-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:20px 0 12px}.purchases-section-heading h2{margin:0;font-size:17px}.purchase-items{display:grid;gap:10px}.purchase-item{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr .8fr;gap:10px;padding:14px;border:1px solid var(--border-light);border-radius:10px;background:var(--bg-tertiary)}.purchase-calculation{grid-column:1/-1;display:flex;gap:20px;color:var(--text-secondary);font-size:12px}.purchase-calculation strong{color:var(--accent-primary)}.primary,.secondary,.danger{min-height:38px;padding:8px 12px;border-radius:8px;font-weight:700;cursor:pointer}.primary{margin-top:14px;border:0;background:var(--accent-primary);color:#fff}.secondary{border:1px solid var(--accent-border);background:var(--accent-light);color:var(--accent-primary)}.danger{border:1px solid rgba(220,38,38,.2);background:rgba(220,38,38,.08);color:var(--error-bg)}.purchases-history article{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--border-light)}.purchases-history article div{display:grid;gap:3px}.purchases-history article span,.purchases-history>p{color:var(--text-secondary);font-size:12px}.purchases-history article b{color:var(--accent-primary)}@media(max-width:800px){.purchases-grid{grid-template-columns:repeat(2,1fr)}.purchase-item{grid-template-columns:1fr 1fr}.purchase-item label:first-child,.purchase-calculation{grid-column:1/-1}}@media(max-width:520px){.purchases-grid{grid-template-columns:1fr}.purchase-item{grid-template-columns:1fr}.purchase-item label:first-child,.purchase-calculation{grid-column:auto}.purchase-calculation{display:grid;gap:4px}}`;
