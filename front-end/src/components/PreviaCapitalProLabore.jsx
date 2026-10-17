const money = (value) =>
  `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Prévia gerencial de capital de giro e pró-labore com base no DRE do mês.
 * Estimativa educativa — não substitui planejamento contábil.
 */
export default function PreviaCapitalProLabore({ dre, diasCobertura = 30 }) {
  if (!dre) return null;

  const cmv = Number(dre.cmv || 0);
  const desp = Number(dre.despesasOperacionais || 0);
  const taxas = Number(dre.taxasCartao || 0);
  const lucro = Number(dre.lucroLiquido || 0);
  const baseMensal = cmv + desp + taxas;
  const necessario = baseMensal * (diasCobertura / 30);
  const minimo15 = baseMensal * (15 / 30);
  const confortavel45 = baseMensal * (45 / 30);
  const conservador = Math.max(0, lucro * 0.3);
  const moderado = Math.max(0, lucro * 0.5);
  const aposReserva = Math.max(0, lucro * 0.8);

  return (
    <section className="financeiro-panel" style={{ marginTop: 16 }}>
      <div className="dashboard-section-heading">
        <div>
          <span className="dashboard-eyebrow">PRÉVIA GERENCIAL</span>
          <h2>Capital de giro e pró-labore</h2>
          <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            Estimativas com base no DRE do mês selecionado — orientativas, não substituem contabilidade.
          </p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 12 }}>
        <div style={{ padding: 16, borderRadius: 14, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>CAPITAL DE GIRO</div>
          <div style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 4px', color: 'var(--brand-brown)' }}>{money(necessario)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>Necessário para {diasCobertura} dias de operação</div>
          <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Mínimo (15 dias)</span><strong>{money(minimo15)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Confortável (45 dias)</span><strong>{money(confortavel45)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Base mensal (CMV+desp.+taxas)</span><strong>{money(baseMensal)}</strong></div>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>
            Fórmula: (CMV + despesas operacionais + taxas de cartão) × (dias / 30). Não inclui estoque parado nem contas a receber/pagar.
          </p>
        </div>
        <div style={{ padding: 16, borderRadius: 14, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>PRÓ-LABORE POSSÍVEL</div>
          <div style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 4px', color: 'var(--success-bg)' }}>{money(moderado)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>Faixa moderada (50% do lucro líquido do mês)</div>
          <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Lucro líquido do mês</span><strong>{money(lucro)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Conservador (30%)</span><strong>{money(conservador)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Após reserva 20%</span><strong>{money(aposReserva)}</strong></div>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>
            Prévia educativa. Ajuste conforme INSS/IR e a política de retirada do sócio. Só faz sentido com lucro líquido positivo.
          </p>
        </div>
      </div>
    </section>
  );
}
