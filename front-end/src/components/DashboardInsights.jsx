const money = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const percent = (value) => `${Number(value || 0).toFixed(1).replace('.', ',')}%`;

export default function DashboardInsights({ insights }) {
  const horarioPico = insights?.horarioPico || {};
  const comparativo = insights?.comparativoMes || {};
  const fidelidade = insights?.fidelidade || {};
  const topABC = (insights?.curvaABC || []).slice(0, 8);
  const margens = (insights?.margemProdutos || []).filter((produto) => produto.quantidade > 0).slice(0, 8);
  const estoqueParado = (insights?.estoqueParado || []).slice(0, 8);
  const horarios = insights?.vendasPorHora || [];

  return <section className="dashboard-insights">
    <div className="dashboard-section-heading"><div><span className="dashboard-eyebrow">INSIGHTS DE GESTÃO</span><h2>Decisões para a operação</h2><p>Leitura dos últimos 90 dias, com alertas de venda, margem e recorrência.</p></div></div>
    <div className="insight-summary-grid">
      <article><small>Horário de pico</small><strong>{horarioPico.hora === null ? 'Sem dados' : `${String(horarioPico.hora).padStart(2, '0')}h`}</strong><span>{horarioPico.pedidos || 0} pedidos · {money(horarioPico.total)}</span></article>
      <article><small>Cancelamento de comandas</small><strong>{percent(insights?.cancelamentoComandas?.taxa)}</strong><span>{insights?.cancelamentoComandas?.canceladas || 0} cancelada(s) de {insights?.cancelamentoComandas?.totalFinalizadas || 0}</span></article>
      <article><small>Comparativo mensal</small><strong className={Number(comparativo.variacaoPercentual) >= 0 ? 'positive' : 'negative'}>{comparativo.variacaoPercentual === null ? 'Sem base' : percent(comparativo.variacaoPercentual)}</strong><span>{money(comparativo.atual?.total)} contra {money(comparativo.anterior?.total)}</span></article>
      <article><small>Clientes recorrentes</small><strong>{percent(fidelidade.taxaRecorrencia)}</strong><span>{fidelidade.clientesRecorrentes || 0} de {fidelidade.clientesComCompra || 0} clientes</span></article>
    </div>
    <div className="insight-columns">
      <article className="insight-panel"><h3>Vendas por horário</h3><p className="insight-help">Use o pico para definir a escala da equipe.</p>{horarios.length ? horarios.map((item) => <div className="insight-row" key={item.hora}><span>{String(item.hora).padStart(2, '0')}h</span><div className="insight-bar"><i style={{ width: `${Math.min(100, (item.total / Math.max(1, horarioPico.total)) * 100)}%` }} /></div><b>{item.pedidos}</b></div>) : <p>Sem vendas no período.</p>}</article>
      <article className="insight-panel"><h3>Curva ABC</h3><p className="insight-help">Priorize os produtos que concentram receita e volume.</p>{topABC.length ? topABC.map((item) => {
        const total = Number(item.quantidade || 0);
        const diaria = total / 90;
        const semanal = total / 13;
        const mensal = total / 3;
        return <div className="insight-row" key={item.produtoId}><span className={`abc-badge abc-${item.classe}`}>{item.classe}</span><em>{item.nome}</em><span>D {diaria.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} / S {semanal.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} / M {mensal.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span><b>{money(item.receita)}</b></div>;
      }) : <p>Sem vendas no período.</p>}</article>
      <article className="insight-panel"><h3>Margem por produto</h3><p className="insight-help">Lucro bruto estimado: venda menos custo unitário.</p>{margens.length ? margens.map((item) => <div className="insight-row" key={item.produtoId}><em>{item.nome}</em><span className={item.lucro >= 0 ? 'positive' : 'negative'}>{money(item.lucro)}</span><b>{percent(item.margemPercentual)}</b></div>) : <p>Informe custos e registre vendas.</p>}</article>
      <article className="insight-panel"><h3>Estoque parado</h3><p className="insight-help">Produtos com saldo e nenhuma saída nos últimos 60 dias.</p>{estoqueParado.length ? estoqueParado.map((item) => <div className="insight-row" key={item.produtoId}><em>{item.nome}</em><b>{item.estoque} em estoque</b></div>) : <p>Nenhum produto parado.</p>}</article>
    </div>
    <div className="insight-panel loyalty-panel"><h3>Frequência de clientes</h3><p className="insight-help">Base para ações de fidelidade e relacionamento.</p>{fidelidade.clientes?.length ? fidelidade.clientes.slice(0, 5).map((cliente) => <div className="insight-row" key={cliente.id}><em>{cliente.nome}</em><span>{cliente.compras} compra(s)</span><b>{cliente.intervaloMedioDias ? `a cada ${cliente.intervaloMedioDias.toFixed(0)} dias` : 'primeira compra'}</b></div>) : <p>Nenhum cliente identificado nas vendas.</p>}</div>
    <style>{styles}</style>
  </section>;
}

const styles = `.dashboard-insights{margin:24px 0;padding:18px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:16px;box-shadow:var(--shadow-sm)}.insight-summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.insight-summary-grid article{padding:12px;border:1px solid var(--border-light);border-radius:10px;background:var(--bg-tertiary)}.insight-summary-grid small,.insight-summary-grid strong,.insight-summary-grid span{display:block}.insight-summary-grid small,.insight-summary-grid span,.insight-help{color:var(--text-secondary);font-size:11px}.insight-summary-grid strong{margin:6px 0;color:var(--accent-primary);font-size:21px}.insight-summary-grid .positive,.positive{color:var(--success-bg)}.negative{color:var(--error-bg)}.insight-columns{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:12px}.insight-panel{padding:14px;border:1px solid var(--border-light);border-radius:10px;background:var(--bg-tertiary)}.insight-panel h3{margin:0 0 3px;font-size:14px}.insight-help{margin:0 0 10px}.insight-row{display:flex;align-items:center;gap:9px;min-height:30px;border-bottom:1px solid var(--border-light);font-size:12px}.insight-row em{flex:1;overflow:hidden;color:var(--text-primary);font-style:normal;text-overflow:ellipsis;white-space:nowrap}.insight-row b{color:var(--accent-primary);white-space:nowrap}.insight-bar{height:6px;flex:1;overflow:hidden;border-radius:5px;background:var(--border-light)}.insight-bar i{display:block;height:100%;border-radius:inherit;background:var(--accent-primary)}.abc-badge{width:19px;height:19px;display:grid;place-items:center;border-radius:50%;font-size:10px;font-weight:800}.abc-A{background:rgba(22,163,74,.15);color:var(--success-bg)}.abc-B{background:rgba(210,137,48,.16);color:var(--warning-bg)}.abc-C{background:rgba(220,38,38,.12);color:var(--error-bg)}.loyalty-panel{margin-top:12px}.loyalty-panel .insight-row{gap:16px}@media(max-width:760px){.insight-summary-grid,.insight-columns{grid-template-columns:1fr}.loyalty-panel .insight-row{align-items:flex-start;flex-direction:column;gap:3px;padding:7px 0}}`;
