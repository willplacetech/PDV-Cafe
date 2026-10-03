import { useCallback, useEffect, useState } from 'react';
import api from '../services/api.jsx';
import { useToast } from '../components/useToast.js';

const formatTime = (value) => new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const formatQuantity = (item) => `${Number(item.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${item.unidadeVenda || 'un'}`;

export default function Kitchen() {
  const [comandas, setComandas] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const load = useCallback(async () => {
    try {
      const response = await api.get('/comandas/cozinha');
      setComandas(response.data);
    } catch (error) {
      showToast(error.response?.data?.msg || 'Não foi possível carregar a cozinha', 'error');
    } finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => {
    const inicializar = async () => { await load(); };
    inicializar();
    const interval = window.setInterval(load, 15000);
    return () => window.clearInterval(interval);
  }, [load]);

  return <div className="kitchen-page">
    <header className="kitchen-heading page-heading"><div><span className="kitchen-eyebrow">PRODUÇÃO DO MOMENTO</span><h1>Cozinha</h1><p>Itens marcados como A Fazer nas comandas em aberto.</p></div><strong>{comandas.reduce((total, comanda) => total + comanda.itens.length, 0)} itens</strong></header>
    {loading ? <div className="kitchen-empty">Carregando comandas...</div> : comandas.length ? <div className="kitchen-grid">{comandas.map((comanda) => <article className="kitchen-card" key={comanda._id}><div className="kitchen-card-heading"><div><span>{comanda.tipoAtendimento === 'balcao' ? '📦 Balcão' : `🪑 Mesa ${comanda.mesa || 'não informada'}`}</span><h2>#{comanda.numero}</h2></div><time>{formatTime(comanda.createdAt)}</time></div><div className="kitchen-client">{comanda.clienteNome || 'Cliente não identificado'}</div><div className="kitchen-items">{comanda.itens.map((item) => <div className="kitchen-item" key={item._id}><strong>{formatQuantity(item)}</strong><span>{item.nome}</span>{item.modificadores?.length ? <small>{item.modificadores.join(' · ')}</small> : null}</div>)}</div>{comanda.observacao && <p className="kitchen-note">Observação: {comanda.observacao}</p>}<div className="kitchen-pending">{comanda.tipoAtendimento === 'balcao' ? `Balcão · ${comanda.statusBalcao || 'aguardando'}` : 'Pendente até concluir a comanda'}</div></article>)}</div> : <div className="kitchen-empty"><strong>Nenhum preparo pendente</strong><span>Novos itens A Fazer aparecerão aqui automaticamente.</span></div>}
    <style>{styles}</style>
  </div>;
}

const styles = `.kitchen-page{color:var(--text-primary)}.kitchen-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px}.kitchen-eyebrow{color:var(--accent-primary);font-size:10px;font-weight:800;letter-spacing:.1em}.kitchen-heading p{margin:0;color:var(--text-secondary);font-size:13px}.kitchen-heading>strong{padding:10px 13px;border:1px solid var(--accent-border);border-radius:10px;background:var(--accent-light);color:var(--accent-primary);font-size:13px}.kitchen-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.kitchen-card{padding:16px;border:1px solid var(--border-color);border-radius:14px;background:var(--bg-secondary);box-shadow:var(--shadow-sm)}.kitchen-card-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--border-light)}.kitchen-card-heading span,.kitchen-card-heading time,.kitchen-client,.kitchen-item small{color:var(--text-secondary);font-size:11px}.kitchen-card-heading h2{margin:3px 0 0;color:var(--accent-primary);font-size:22px}.kitchen-client{padding:10px 0;color:var(--text-primary);font-weight:700}.kitchen-items{display:grid;gap:8px}.kitchen-item{display:grid;grid-template-columns:auto 1fr;gap:3px 9px;padding:10px;border-radius:9px;background:var(--bg-tertiary)}.kitchen-item strong{color:var(--accent-primary)}.kitchen-item span{font-weight:700}.kitchen-item small{grid-column:2}.kitchen-note{margin:12px 0 0;padding:9px;border-left:3px solid var(--accent-primary);background:var(--accent-light);color:var(--text-secondary);font-size:11px}.kitchen-pending{margin-top:12px;color:var(--warning-bg);font-size:11px;font-weight:700}.kitchen-empty{display:grid;place-items:center;gap:6px;min-height:180px;padding:20px;border:1px dashed var(--border-color);border-radius:14px;background:var(--bg-secondary);color:var(--text-secondary);text-align:center}.kitchen-empty strong{color:var(--text-primary);font-size:15px}@media(max-width:600px){.kitchen-heading{align-items:flex-start;flex-direction:column}.kitchen-heading>strong{width:100%;box-sizing:border-box}.kitchen-grid{grid-template-columns:1fr}}`;
