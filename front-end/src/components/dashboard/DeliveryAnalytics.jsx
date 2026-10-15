import { useContext, useEffect, useState } from 'react';
import api from '../../services/api.jsx';
import { AuthContext } from '../../context/AuthContextDefinition.jsx';

const dinheiro = value => `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const periodos = [{ id: 'hoje', titulo: 'Hoje' }, { id: 'semana', titulo: 'Esta semana' }, { id: 'mes', titulo: 'Este mês' }];

export default function DeliveryAnalytics({ section = 'both' }) {
  const { user } = useContext(AuthContext);
  const [periodo, setPeriodo] = useState('hoje');
  const [tentativa, setTentativa] = useState(0);
  const [resultado, setResultado] = useState(null);
  const chave = `${periodo}:${tentativa}`;
  const carregando = resultado?.chave !== chave;
  const delivery = carregando ? null : resultado?.data;
  const erroDelivery = carregando ? '' : resultado?.erro;
  const [dias, setDias] = useState([]);
  const [erroGrafico, setErroGrafico] = useState('');

  useEffect(() => {
    if ((section !== 'summary' && section !== 'both') || user?.role !== 'admin' || !user.tenantId) return undefined;
    let ativo = true;
    api.get('/dashboard/delivery', { params: { periodo } })
      .then(({ data }) => { if (ativo) setResultado({ chave, data }); })
      .catch(error => { if (ativo) setResultado({ chave, erro: error.response?.data?.msg || 'Não foi possível carregar os indicadores de Delivery.' }); });
    return () => { ativo = false; };
  }, [periodo, chave, section, user?.role, user?.tenantId]);

  useEffect(() => {
    if (section !== 'chart' && section !== 'both') return undefined;
    let ativo = true;
    api.get('/dashboard/receita-7-dias')
      .then(({ data }) => { if (ativo) { setDias(data || []); setErroGrafico(''); } })
      .catch(error => { if (ativo) setErroGrafico(error.response?.data?.msg || 'Não foi possível carregar a receita dos últimos sete dias.'); });
    return () => { ativo = false; };
  }, [section]);

  const maxReceita = Math.max(1, ...dias.map(dia => Number(dia.total || 0)));
  const maxTicket = Math.max(1, ...dias.map(dia => Number(dia.ticketMedio || 0)));
  const pontosTicket = dias.map((dia, indice) => {
    const x = dias.length < 2 ? 350 : indice * 700 / (dias.length - 1);
    const y = 130 - Number(dia.ticketMedio || 0) / maxTicket * 105;
    return `${x},${y}`;
  }).join(' ');

  return <div className="delivery-analytics">
    {(section === 'chart' || section === 'both') && <section className="delivery-chart-card">
      <div className="delivery-analytics-heading"><div><span>ÚLTIMOS 7 DIAS</span><h2>Receita e ticket médio</h2></div><small>Barras: receita · linha: ticket médio</small></div>
       {erroGrafico ? <p role="alert" className="delivery-analytics-error">{erroGrafico}</p> : (!dias.length && !erroGrafico) ? <p role="status" className="delivery-analytics-empty">Nenhum dado de receita nos últimos 7 dias.</p> : <div className="delivery-chart">
        <svg className="delivery-chart-line" viewBox="0 0 700 140" preserveAspectRatio="none" role="img" aria-label="Linha de ticket médio nos últimos sete dias">
          {pontosTicket && <polyline points={pontosTicket} fill="none" stroke="var(--accent-secondary)" strokeWidth="3" vectorEffect="non-scaling-stroke" />}
        </svg>
        {dias.map(dia => <div className="delivery-chart-day" key={dia.data} title={`${dia.dia}: ${dinheiro(dia.total)} de receita; ticket médio ${dinheiro(dia.ticketMedio)}`}>
          <div className="delivery-chart-value">{dinheiro(dia.total)}</div>
          <div className="delivery-chart-column" style={{ height: `${Math.max(4, Number(dia.total || 0) / maxReceita * 108)}px` }} />
          <small>{dia.dia}</small>
        </div>)}
      </div>}
    </section>}

    {(section === 'summary' || section === 'both') && <section className="delivery-summary">
      <div className="delivery-analytics-heading"><div><span>CANAL DE VENDAS</span><h2>Delivery</h2></div>
        <div className="delivery-period-selector" aria-label="Período dos indicadores de Delivery">{periodos.map(item => <button type="button" key={item.id} className={periodo === item.id ? 'active' : ''} onClick={() => setPeriodo(item.id)}>{item.titulo}</button>)}</div>
      </div>
      {!user?.tenantId ? <p role="status">Associe este usuário administrador a um comércio para consultar os indicadores de Delivery.</p> : carregando ? <p role="status">Carregando indicadores de Delivery...</p> : erroDelivery ? <div className="delivery-analytics-error"><p role="alert">{erroDelivery}</p><button type="button" onClick={() => setTentativa(valor => valor + 1)}>Tentar novamente</button></div> : delivery && <>
        <div className="delivery-summary-grid">
          <article><span>Pedidos Delivery</span><strong>{delivery.totalPedidos}</strong></article>
          <article><span>Receita delivery</span><strong>{dinheiro(delivery.receitaTotal)}</strong><small>{Number(delivery.porcentagemFaturamento || 0).toLocaleString('pt-BR')}% do faturamento total</small></article>
          <article><span>Frete cobrado</span><strong>{dinheiro(delivery.freteTotal)}</strong></article>
          <article><span>Ticket médio</span><strong>{dinheiro(delivery.ticketMedio)}</strong><small>Presencial: {dinheiro(delivery.ticketMedioPresencial)}</small></article>
        </div>
        <div className="delivery-average-time" title={delivery.tempoMedioMinutos == null ? 'Será medido quando houver dados de rota' : undefined}>
          Tempo médio de entrega: <strong>{delivery.tempoMedioMinutos == null ? '—' : `${delivery.tempoMedioMinutos} min`}</strong>
        </div>
        <details className="delivery-couriers">
          <summary>Entregadores · {delivery.porEntregador.length}</summary>
          <div className="delivery-table-wrap"><table><thead><tr><th>Entregador</th><th>Pedidos Delivery</th><th>Receita total</th><th>Frete coletado</th><th>Tempo médio</th></tr></thead>
            <tbody>{delivery.porEntregador.length ? delivery.porEntregador.map((entregador, indice) => <tr key={`${entregador.nome}-${indice}`}>
              <td>{entregador.nome}</td><td>{entregador.pedidos}</td><td>{dinheiro(entregador.receita)}</td><td>{dinheiro(entregador.frete)}</td><td>{entregador.tempoMedioMinutos == null ? '—' : `${entregador.tempoMedioMinutos} min`}</td>
            </tr>) : <tr><td colSpan="5">Nenhum pedido Delivery concluído no período.</td></tr>}</tbody>
          </table></div>
        </details>
      </>}
    </section>}
    <style>{`
      .delivery-analytics{display:grid;gap:16px;margin:18px 0}
      .delivery-chart-card,.delivery-summary{padding:18px;border:1px solid var(--border-color);border-radius:16px;background:var(--bg-secondary);box-shadow:var(--shadow-sm)}
      .delivery-analytics-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
      .delivery-analytics-heading>div:first-child>span{font-size:10px;font-weight:800;letter-spacing:.1em;color:var(--accent-primary)}
      .delivery-analytics-heading h2{margin:4px 0 0;font-size:18px;color:var(--text-primary)}
      .delivery-analytics-heading small,.delivery-summary-grid small{color:var(--text-secondary);font-size:11px}
      .delivery-chart{position:relative;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));align-items:end;gap:8px;min-height:166px;padding-top:12px}
      .delivery-chart-line{position:absolute;z-index:1;inset:12px 0 28px;width:100%;height:126px;overflow:visible;pointer-events:none}
      .delivery-chart-day{z-index:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px;min-width:0;height:166px}
      .delivery-chart-value{overflow:hidden;max-width:100%;font-size:9px;color:var(--text-secondary);text-overflow:ellipsis;white-space:nowrap}
      .delivery-chart-column{width:min(60%,46px);min-height:4px;border-radius:7px 7px 2px 2px;background:var(--accent-primary);opacity:.84}
      .delivery-chart-day small{font-size:10px;color:var(--text-secondary)}
      .delivery-period-selector{display:flex;gap:5px;padding:3px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary)}
      .delivery-period-selector button{padding:7px 10px;border:0;border-radius:7px;background:transparent;color:var(--text-secondary);font:inherit;font-size:11px;font-weight:700;cursor:pointer}
      .delivery-period-selector button.active{background:var(--accent-primary);color:#fff}
      .delivery-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .delivery-summary-grid article{display:grid;align-content:start;gap:6px;min-height:86px;padding:13px;border:1px solid var(--border-light);border-radius:12px;background:var(--bg-primary)}
      .delivery-summary-grid article span{font-size:11px;color:var(--text-secondary)}.delivery-summary-grid article strong{font-size:20px;color:var(--accent-primary)}
      .delivery-average-time{margin-top:12px;padding:11px 13px;border-radius:10px;background:var(--accent-light);color:var(--text-primary);font-size:12px}
      .delivery-average-time strong{margin-left:5px;color:var(--accent-primary)}
      .delivery-couriers{margin-top:14px;border-top:1px solid var(--border-color);padding-top:12px}
      .delivery-couriers summary{color:var(--text-primary);font-size:13px;font-weight:800;cursor:pointer}
      .delivery-table-wrap{overflow-x:auto;margin-top:10px}.delivery-table-wrap table{width:100%;border-collapse:collapse;text-align:left;font-size:12px}
      .delivery-table-wrap th,.delivery-table-wrap td{padding:10px;border-bottom:1px solid var(--border-light);white-space:nowrap}
      .delivery-table-wrap th{color:var(--text-secondary);font-size:10px;text-transform:uppercase}
      .delivery-analytics-error{color:var(--danger-bg);font-size:13px}
      .delivery-analytics-empty{color:var(--text-secondary);font-size:12px;text-align:center;padding:20px}
      @media(max-width:760px){.delivery-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.delivery-chart{gap:3px}.delivery-chart-value{font-size:8px}.delivery-analytics-heading{align-items:flex-start;flex-direction:column}.delivery-period-selector{width:100%}.delivery-period-selector button{flex:1}}
    `}</style>
  </div>;
}
