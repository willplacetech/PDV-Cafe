import SearchableSelect from '../components/SearchableSelect.jsx';
const CAMPOS_ENDERECO = ['rua', 'numero', 'bairro', 'complemento', 'referencia'];
const ENDERECO_VAZIO = { rua: '', numero: '', bairro: '', complemento: '', referencia: '' };

export default function DeliveryPDV({ value, onChange, customer, showToggle = true }) {
  const alterar = (campo, valor) => onChange({ ...value, [campo]: valor });
  const enderecoCadastrado = customer?.enderecoEntrega || ENDERECO_VAZIO;
  const temEnderecoCadastrado = ['rua', 'numero', 'bairro'].every(campo => enderecoCadastrado[campo]?.trim());
  const estiloLabel = { display: 'grid', alignContent: 'start', gap: 6, minWidth: 0 };
  const estiloInput = { width: '100%', minHeight: 44, padding: 10, border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--input-bg)', color: 'var(--input-text)', font: 'inherit', boxSizing: 'border-box' };
  return <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border-color)' }}>
    {showToggle && <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700 }}><input type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked ? { telefone: customer?.telefone || '', endereco: temEnderecoCadastrado ? { ...enderecoCadastrado } : { ...ENDERECO_VAZIO }, enderecoAlternativo: { ...ENDERECO_VAZIO }, usarEnderecoCadastrado: temEnderecoCadastrado, taxaEntrega: 0 } : null)} />Entrega ao cliente (DeliveryLink)</label>}
    {value && <><p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>O nome vem do cliente selecionado ou do campo Nome no atendimento. O pedido usará o endereço cadastrado, se houver, ou o endereço alternativo informado.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
      <label style={estiloLabel}>Telefone do cliente<input style={estiloInput} type="tel" value={value.telefone} onChange={event => alterar('telefone', event.target.value)} maxLength={30} /></label>
      {temEnderecoCadastrado && <label style={{ ...estiloLabel, gridColumn: '1 / -1' }}>Endereço para entrega<SearchableSelect style={estiloInput} value={value.usarEnderecoCadastrado ? 'cadastrado' : 'outro'} onChange={event => {
        const usarEnderecoCadastrado = event.target.value === 'cadastrado';
        onChange({ ...value, usarEnderecoCadastrado, endereco: usarEnderecoCadastrado ? { ...enderecoCadastrado } : value.enderecoAlternativo });
      }}><option value="cadastrado">Usar endereço cadastrado do cliente</option><option value="outro">Entregar em outro endereço</option></SearchableSelect></label>}
      {CAMPOS_ENDERECO.map(campo => <label key={campo} style={estiloLabel}>{({ rua: 'Rua', numero: 'Número', bairro: 'Bairro', complemento: 'Complemento', referencia: 'Referência' })[campo]}<input style={estiloInput} value={value.endereco[campo] || ''} disabled={Boolean(value.usarEnderecoCadastrado)} onChange={event => {
        const enderecoAlternativo = { ...value.enderecoAlternativo, [campo]: event.target.value };
        onChange({ ...value, endereco: enderecoAlternativo, enderecoAlternativo });
      }} maxLength={campo === 'rua' ? 300 : campo === 'numero' ? 30 : campo === 'bairro' ? 120 : 200} /></label>)}
      <label style={estiloLabel}>Taxa de entrega no caixa (R$)<input style={estiloInput} type="number" min="0" step="0.01" value={value.taxaEntrega} onChange={event => alterar('taxaEntrega', event.target.value)} /></label>
    </div></>}
  </div>;
}
