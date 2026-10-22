import { useCallback, useEffect, useState } from 'react';
import api from '../services/api.jsx';
import { useToast } from '../components/useToast.js';
import Paginacao from '../components/Paginacao.jsx';
import usePagination from '../hooks/usePagination.js';
import EstadoLista from '../components/EstadoLista.jsx';

const formatTime = (value) => new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const formatQuantity = (item) => `${Number(item.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${item.unidadeVenda || 'un'}`;

export default function Kitchen() {
  const [comandas, setComandas] = useState([]);
  const paginacao = usePagination(comandas);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const { showToast } = useToast();

  const load = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) setLoading(true);
    setLoadError('');
    try {
      const response = await api.get('/comandas/cozinha');
      setComandas(response.data);
    } catch (error) {
      setLoadError(error.response?.data?.msg || 'Não foi possível carregar a cozinha.');
    } finally {
      setLoading(false);
    }
  }, []);

  const marcarEntregaPronta = async (comanda) => {
    try {
      await api.post(`/comandas/${comanda._id}/cozinha/pronto`);
      showToast('Preparo da entrega marcado como pronto.', 'success');
      await load();
    } catch (error) {
      showToast(error.response?.data?.msg || 'Não foi possível atualizar o preparo da entrega', 'error');
    }
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void load({ showLoading: true }); }, 0);
    const interval = window.setInterval(() => { load(); }, 15000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [load]);

  return <div className="kitchen-page">
    <header className="kitchen-heading page-heading"><div><span className="kitchen-eyebrow">PRODUÇÃO DO MOMENTO</span><h1>Cozinha</h1><p>Itens para produção nas comandas em aberto, incluindo todos os pedidos QR.</p></div><strong>{comandas.reduce((total, comanda) => total + comanda.itens.length, 0)} itens</strong></header>
    <EstadoLista
      carregando={loading}
      erro={loadError}
      vazio={comandas.length === 0}
      tituloVazio="Nenhum preparo pendente"
      mensagemVazia="Novos itens A Fazer aparecerão aqui automaticamente."
      onRetry={() => load({ showLoading: true })}
    >
      <div className="kitchen-grid">{paginacao.itensPagina.map((comanda) => {
        const pedidoQr = comanda.origem === 'qr';
        const identificacao = pedidoQr
          ? `QR — ${comanda.clienteNome || 'Cliente'} (Mesa ${comanda.mesa || 'não informada'})`
          : comanda.tipoAtendimento === 'delivery' ? '🛵 Delivery'
            : comanda.tipoAtendimento === 'balcao' ? '📦 Balcão'
              : `🪑 Mesa ${comanda.mesa || 'não informada'}`;
        return (
          <article className={`kitchen-card${pedidoQr ? ' kitchen-card-qr' : ''}`} key={comanda._id}>
            <div className="kitchen-card-heading">
              <div><span className={pedidoQr ? 'kitchen-qr-label' : ''}>{identificacao}</span><h2>#{comanda.numero}</h2></div>
              <time>{formatTime(comanda.createdAt)}</time>
            </div>
            {!pedidoQr && <div className="kitchen-client">{comanda.clienteNome || 'Cliente não identificado'}</div>}
            <div className="kitchen-items">{comanda.itens.map((item) => (
              <div className="kitchen-item" key={item._id}>
                <strong>{formatQuantity(item)}</strong>
                <span>{item.nome}</span>
                {item.modificadores?.length ? <small>{item.modificadores.join(' · ')}</small> : null}
                {item.observacao && <small className="kitchen-item-observation">Observação: {item.observacao}</small>}
              </div>
            ))}</div>
            {comanda.observacao && <p className="kitchen-note">Observação: {comanda.observacao}</p>}
            <div className="kitchen-pending">{comanda.entrega ? (comanda.entrega.preparoPronto ? 'Entrega pronta — aguardando fechamento da comanda' : 'Entrega Delivery em preparo') : comanda.tipoAtendimento === 'balcao' ? `Balcão · ${comanda.statusBalcao || 'aguardando'}` : 'Pendente até concluir a comanda'}</div>
            {comanda.entrega && !comanda.entrega.preparoPronto && <button type="button" className="kitchen-ready-button" onClick={() => void marcarEntregaPronta(comanda)}>Marcar entrega pronta</button>}
          </article>
        );
      })}</div>
      <Paginacao prefixo="cozinha" total={paginacao.total} paginaAtual={paginacao.paginaAtual} limiteAtual={paginacao.limiteAtual} onChangePagina={paginacao.alterarPagina} onChangeLimite={paginacao.alterarLimite} />
    </EstadoLista>
    <style>{styles}</style>
  </div>;
}

const styles = `.kitchen-page{color:var(--text-primary)}.kitchen-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px}.kitchen-eyebrow{color:var(--accent-primary);font-size:10px;font-weight:800;letter-spacing:.1em}.kitchen-heading p{margin:0;color:var(--text-secondary);font-size:13px}.kitchen-heading>strong{padding:10px 13px;border:1px solid var(--accent-border);border-radius:10px;background:var(--accent-light);color:var(--accent-primary);font-size:13px}.kitchen-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.kitchen-card{padding:16px;border:1px solid var(--border-color);border-radius:14px;background:var(--bg-secondary);box-shadow:var(--shadow-sm)}.kitchen-card-qr{border:2px solid var(--accent-primary);background:var(--accent-light)}.kitchen-qr-label{display:inline-block;padding:4px 7px;border-radius:6px;background:var(--accent-primary);color:var(--accent-text)!important;font-weight:800}.kitchen-card-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--border-light)}.kitchen-card-heading span,.kitchen-card-heading time,.kitchen-client,.kitchen-item small{color:var(--text-secondary);font-size:11px}.kitchen-card-heading h2{margin:3px 0 0;color:var(--accent-primary);font-size:22px}.kitchen-client{padding:10px 0;color:var(--text-primary);font-weight:700}.kitchen-items{display:grid;gap:8px}.kitchen-item{display:grid;grid-template-columns:auto 1fr;gap:3px 9px;padding:10px;border-radius:9px;background:var(--bg-tertiary)}.kitchen-item strong{color:var(--accent-primary)}.kitchen-item span{font-weight:700}.kitchen-item small{grid-column:2}.kitchen-item .kitchen-item-observation{grid-column:1/-1;padding:6px 8px;border-left:3px solid var(--warning-bg);border-radius:4px;background:var(--warning-light,var(--bg-secondary));color:var(--text-primary);font-weight:800}.kitchen-note{margin:12px 0 0;padding:9px;border-left:3px solid var(--accent-primary);background:var(--accent-light);color:var(--text-secondary);font-size:11px}.kitchen-pending{margin-top:12px;color:var(--warning-bg);font-size:11px;font-weight:700}.kitchen-ready-button{width:100%;min-height:48px;margin-top:12px;padding:12px;border:0;border-radius:10px;background:var(--success-bg);color:var(--success-text);font:inherit;font-weight:800;cursor:pointer}.kitchen-empty{display:grid;place-items:center;gap:6px;min-height:180px;padding:20px;border:1px dashed var(--border-color);border-radius:14px;background:var(--bg-secondary);color:var(--text-secondary);text-align:center}.kitchen-empty strong{color:var(--text-primary);font-size:15px}@media(max-width:600px){.kitchen-heading{align-items:flex-start;flex-direction:column}.kitchen-heading>strong{width:100%;box-sizing:border-box}.kitchen-grid{grid-template-columns:1fr}}`;
