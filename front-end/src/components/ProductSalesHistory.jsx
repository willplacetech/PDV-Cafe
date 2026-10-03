import { useEffect, useState } from 'react';
import api from '../services/api.jsx';

const quantity = (value) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const isoDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const mondayOf = (value) => {
  const date = new Date(`${value || isoDate(new Date())}T12:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return isoDate(date);
};
const shiftWeek = (weekStart, amount) => {
  const date = new Date(`${weekStart}T12:00:00`);
  date.setDate(date.getDate() + amount * 7);
  return isoDate(date);
};
const weekRange = (weekStart) => {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')}`;
};

export default function ProductSalesHistory({ products, topProducts = [] }) {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [weekStart, setWeekStart] = useState(() => mondayOf());
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    api.get('/dashboard/historico-produtos', { params: { semanaInicio: weekStart, ...(productId ? { produtoId: productId } : {}) } })
      .then((response) => { if (active) setHistory(response.data); })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.msg || 'Não foi possível carregar o histórico de vendas.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, weekStart, productId]);

  const salesRank = new Map(topProducts.map((product, index) => [product.nome, index]));
  const sortedProducts = [...products].filter((product) => !product.tipo || product.tipo !== 'insumo').sort((first, second) => {
    const firstRank = salesRank.has(first.nome) ? salesRank.get(first.nome) : Number.MAX_SAFE_INTEGER;
    const secondRank = salesRank.has(second.nome) ? salesRank.get(second.nome) : Number.MAX_SAFE_INTEGER;
    return firstRank - secondRank || first.nome.localeCompare(second.nome, 'pt-BR');
  });

  const points = history?.pontos || [];
  const maxQuantity = Math.max(1, ...points.map((point) => Number(point.quantidade || 0)));
  const summary = history?.resumo || { quantidade: 0, total: 0, pedidos: 0 };

  return <section className="product-sales-history">
    <div className="dashboard-section-heading product-history-heading">
      <div>
        <span className="dashboard-eyebrow">HISTÓRICO DE VENDAS</span>
        <h2>Vendas por produto — semana completa</h2>
        <p>{open ? `Gráfico de quantidades de ${weekRange(weekStart)}.` : 'Abra para consultar as quantidades vendidas por produto.'}</p>
      </div>
      <button type="button" className="product-history-toggle" onClick={() => { setLoading(true); setError(''); setOpen((value) => !value); }} aria-expanded={open}>{open ? 'Ocultar' : 'Consultar'}</button>
    </div>
    {open && <><div className="product-history-filters">
      <label>Produto
        <select value={productId} onChange={(event) => { setLoading(true); setError(''); setProductId(event.target.value); }}>
          <option value="">Todos os produtos</option>
          {sortedProducts.map((product) => <option key={product._id} value={product._id}>{salesRank.has(product.nome) ? `★ ${product.nome}` : product.nome}</option>)}
        </select>
      </label>
      <div className="product-history-period-control">
        <span>Semana completa</span>
        <div className="product-history-week-navigation">
          <button type="button" onClick={() => { setLoading(true); setError(''); setWeekStart((value) => shiftWeek(value, -1)); }} aria-label="Semana anterior">&lt;</button>
          <small>{weekRange(weekStart)}</small>
          <button type="button" onClick={() => { setLoading(true); setError(''); setWeekStart((value) => shiftWeek(value, 1)); }} aria-label="Próxima semana">&gt;</button>
        </div>
      </div>
    </div>
    {loading ? <p className="product-history-message">Carregando histórico...</p> : error ? <p className="product-history-message">{error}</p> : <>
      <div className="product-history-summary">
        <div><small>Quantidade vendida (unidade base)</small><b>{quantity(summary.quantidade)}</b></div>
        <div><small>Pedidos com o produto</small><b>{summary.pedidos}</b></div>
        <div><small>Média por pedido (unidade base)</small><b>{quantity(summary.pedidos ? summary.quantidade / summary.pedidos : 0)}</b></div>
      </div>
      <div className="product-history-list">
        {points.map((point) => <article className="product-history-point" key={point.chave}>
          <div className="product-history-point-title"><strong>{point.rotulo}</strong><span>{quantity(point.quantidade)} unidade base · {point.pedidos} pedido(s)</span></div>
          <div className="product-history-bar" aria-hidden="true"><i style={{ width: `${(Number(point.quantidade || 0) / maxQuantity) * 100}%` }} /></div>
          <b>{quantity(point.quantidade)} unidade base</b>
        </article>)}
      </div>
    </>}</>}
    <style>{styles}</style>
  </section>;
}

const styles = `.product-sales-history{margin-top:24px;padding:18px;border:1px solid var(--border-color);border-radius:16px;background:var(--bg-secondary);box-shadow:var(--shadow-sm)}.product-history-heading{margin-bottom:0}.product-history-toggle{min-height:40px;padding:8px 13px;border:1px solid var(--accent-primary);border-radius:8px;background:var(--accent-primary);color:#fff;font:700 12px var(--font-body);cursor:pointer}.product-history-filters{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-top:14px;margin-bottom:14px}.product-history-filters label,.product-history-period-control{display:grid;gap:5px;min-width:min(100%,260px);color:var(--text-secondary);font-size:11px;font-weight:700}.product-history-filters select{min-height:40px;padding:8px 10px;border:1px solid var(--border-color);border-radius:8px;background:var(--input-bg);color:var(--input-text);font:inherit}.product-history-week-navigation{display:grid;grid-template-columns:40px 1fr 40px;align-items:center;gap:6px}.product-history-week-navigation button{height:40px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-tertiary);color:var(--accent-primary);font-size:20px;font-weight:700;cursor:pointer}.product-history-week-navigation small{color:var(--accent-primary);font-size:11px;text-align:center;white-space:nowrap}.product-history-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}.product-history-summary div{padding:11px;border:1px solid var(--border-light);border-radius:10px;background:var(--bg-tertiary)}.product-history-summary small,.product-history-summary b{display:block}.product-history-summary small,.product-history-message{color:var(--text-secondary);font-size:11px}.product-history-summary b{margin-top:5px;color:var(--accent-primary);font-size:16px}.product-history-list{display:grid;gap:8px}.product-history-point{display:grid;grid-template-columns:minmax(150px,1fr) minmax(80px,2fr) auto;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-light)}.product-history-point-title{display:grid;gap:3px}.product-history-point-title strong{color:var(--text-primary);font-size:12px}.product-history-point-title span{color:var(--text-secondary);font-size:11px}.product-history-bar{height:8px;overflow:hidden;border-radius:8px;background:var(--border-light)}.product-history-bar i{display:block;height:100%;border-radius:inherit;background:var(--accent-primary)}.product-history-point>b{color:var(--accent-primary);font-size:12px;white-space:nowrap}.product-history-message{margin:18px 0 0}@media(max-width:640px){.product-history-filters{align-items:stretch;flex-direction:column}.product-history-summary{grid-template-columns:1fr}.product-history-point{grid-template-columns:1fr auto}.product-history-bar{grid-column:1 / -1;grid-row:2}}`;
