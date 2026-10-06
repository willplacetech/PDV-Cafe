export default function DeliveryPDV({ value, onChange }) {
  const alterar = (campo, valor) => onChange({ ...value, [campo]: valor });
  const alterarEndereco = (campo, valor) => onChange({ ...value, endereco: { ...value.endereco, [campo]: valor } });
  const estiloInput = { width: '100%', minHeight: 44, padding: 10, border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--input-bg)', color: 'var(--input-text)', font: 'inherit' };
  return <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border-color)' }}>
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700 }}><input type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked ? { telefone: '', endereco: { rua: '', numero: '', bairro: '', complemento: '', referencia: '' }, taxaEntrega: 0 } : null)} />Entrega ao cliente (DeliveryLink)</label>
    {value && <><p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Informe o nome do cliente acima. A entrega será registrada após salvar a venda, inclusive quando sincronizar uma venda offline.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
      <label>Telefone do cliente<input style={estiloInput} type="tel" value={value.telefone} onChange={event => alterar('telefone', event.target.value)} maxLength={30} /></label>
      {['rua', 'numero', 'bairro', 'complemento', 'referencia'].map(campo => <label key={campo}>{({ rua: 'Rua', numero: 'Número', bairro: 'Bairro', complemento: 'Complemento', referencia: 'Referência' })[campo]}<input style={estiloInput} value={value.endereco[campo]} onChange={event => alterarEndereco(campo, event.target.value)} maxLength={campo === 'numero' ? 30 : campo === 'bairro' ? 120 : 200} /></label>)}
      <label>Taxa de entrega no caixa (R$)<input style={estiloInput} type="number" min="0" step="0.01" value={value.taxaEntrega} onChange={event => alterar('taxaEntrega', event.target.value)} /></label>
    </div></>}
  </div>;
}
