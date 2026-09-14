import { useEffect, useState } from 'react';
import api from '../services/api.jsx';

const money = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const quantity = (value) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const periodLabels = { dia: 'Dia', semana: 'Semana', mes: 'Mês' };

export default function ProductSalesHistory({ products }) {
  const [productId, setProductId] = useState('');
  const [period, setPeriod] = useState('dia');
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.get('/dashboard/historico-produtos', { params: { periodo: period, ...(productId ? { produtoId: productId } : {}) } })
      .then((response) => { if (active) setHistory(response.data); })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.msg || 'Não foi possível carregar o histórico de vendas.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period, productId]);

  const points = history?.pontos || [];
  const maxTotal = Math.max(1, ...points.map((point) => Number(point.total || 0)));
  const summary = history?.resumo || { quantidade: 0, total: 0, pedidos: 0 };

  return <section className="product-sales-history">
    <div className="dashboard-section-heading">
      <div>
        <span className="dashboard-eyebrow">HISTÓRICO DE VENDAS</span>
        <h2>Vendas por produto</h2>
        <p>Consulte quantidade, pedidos e faturamento por dia, semana ou mês.</p>
      </div>
    </div>
    <div className="product-history-filters">
      <label>Produto
        <select value={productId} onChange={(event) => setProductId(event.target.value)}>
          <option value="">Todos os produtos</option>
          {products.map((product) => <option key={product._id} value={product._id}>{product.nome}</option>)}
        </select>
      </label>
      <div className="product-history-periods" aria-label="Período do histórico">
        {Object.entries(periodLabels).map(([value, label]) => <button type="button" className={period === value ? 'active' : ''} key={value} onClick={() => setPeriod(value)}>{label}</button>)}
      </div>
    </div>
    {loading ? <p className="product-history-message">Carregando histórico...</p> : error ? <p className="product-history-message">{error}</p> : <>
      <div className="product-history-summary">
        <div><small>Faturamento</small><b>{money(summary.total)}</b></div>
        <div><small>Itens vendidos</small><b>{quantity(summary.quantidade)}</b></div>
        <div><small>Pedidos com o produto</small><b>{summary.pedidos}</b></div>
      </div>
      <div className="product-history-list">
        {points.map((point) => <article className="product-history-point" key={point.chave}>
          <div className="product-history-point-title"><strong>{point.rotulo}</strong><span>{quantity(point.quantidade)} item(ns) · {point.pedidos} pedido(s)</span></div>
          <div className="product-history-bar" aria-hidden="true"><i style={{ width: `${(Number(point.total || 0) / maxTotal) * 100}%` }} /></div>
          <b>{money(point.total)}</b>
        </article>)}
      </div>
    </>}
    <style>{styles}</style>
  </section>;
}

const styles = `.product-sales-history{margin-top:16px;padding:18px;border:1px solid var(--border-color);border-radius:16px;background:var(--bg-secondary);box-shadow:var(--shadow-sm)}.product-history-filters{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:14px}.product-history-filters label{display:grid;gap:5px;min-width:min(100%,260px);color:var(--text-secondary);font-size:11px;font-weight:700}.product-history-filters select{min-height:40px;padding:8px 10px;border:1px solid var(--border-color);border-radius:8px;background:var(--input-bg);color:var(--input-text);font:inherit}.product-history-periods{display:flex;gap:6px}.product-history-periods button{min-height:40px;padding:8px 13px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-tertiary);color:var(--text-secondary);font:700 12px var(--font-body);cursor:pointer}.product-history-periods button.active{border-color:var(--accent-primary);background:var(--accent-primary);color:#fff}.product-history-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}.product-history-summary div{padding:11px;border:1px solid var(--border-light);border-radius:10px;background:var(--bg-tertiary)}.product-history-summary small,.product-history-summary b{display:block}.product-history-summary small,.product-history-message{color:var(--text-secondary);font-size:11px}.product-history-summary b{margin-top:5px;color:var(--accent-primary);font-size:16px}.product-history-list{display:grid;gap:8px}.product-history-point{display:grid;grid-template-columns:minmax(150px,1fr) minmax(80px,2fr) auto;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-light)}.product-history-point-title{display:grid;gap:3px}.product-history-point-title strong{color:var(--text-primary);font-size:12px}.product-history-point-title span{color:var(--text-secondary);font-size:11px}.product-history-bar{height:8px;overflow:hidden;border-radius:8px;background:var(--border-light)}.product-history-bar i{display:block;height:100%;border-radius:inherit;background:var(--accent-primary)}.product-history-point>b{color:var(--accent-primary);font-size:12px;white-space:nowrap}.product-history-message{margin:18px 0 0}@media(max-width:640px){.product-history-filters{align-items:stretch;flex-direction:column}.product-history-periods{width:100%}.product-history-periods button{flex:1}.product-history-summary{grid-template-columns:1fr}.product-history-point{grid-template-columns:1fr auto}.product-history-bar{grid-column:1 / -1;grid-row:2}}`;
