import useFilaOffline from '../hooks/useFilaOffline.js';

export default function StatusConexao({ compacto = false }) {
  const { pendentes, online, armazenamentoCheio, origensPendentes, resolverOrigem } = useFilaOffline();
  const confirmarOrigem = async id => {
    const reason = window.prompt('Informe como conferiu a origem desta venda legada. Ela sera vinculada ao seu operador e comercio atuais:');
    if (!reason || reason.trim().length < 3) return;
    const confirmed = window.confirm(`Confirmar a origem da venda ${id} para seu operador e comercio atuais? Motivo: ${reason}`);
    if (!confirmed) return;
    try { await resolverOrigem(id, reason, true); }
    catch (error) { window.alert(error.message); }
  };
  const cor = armazenamentoCheio
    ? 'var(--error-bg)'
    : online && pendentes === 0
      ? 'var(--success-bg)'
      : 'var(--warning-bg)';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'grid',
        gap: 3,
        minWidth: 0,
        padding: compacto ? '5px 8px' : '9px 10px',
        border: `1px solid ${cor}`,
        borderRadius: 8,
        color: 'var(--text-primary)',
        fontSize: 11,
        lineHeight: 1.35,
        overflowWrap: 'anywhere',
      }}
    >
      <strong style={{ color: cor }}>
        {online ? '✅ Conectado' : '⚠️ Sem conexão'}
        {pendentes > 0 && ` · ⚠️ ${pendentes} venda(s) pendente(s)`}
      </strong>
      {armazenamentoCheio && <span style={{ color: 'var(--error-bg)', fontWeight: 700 }}>Conecte à internet para sincronizar</span>}
      {pendentes > 0 && <span>Não limpe os dados do site enquanto houver vendas pendentes.</span>}
      {origensPendentes.length > 0 && <span>Vendas legadas com origem desconhecida: {origensPendentes.length}. Preservadas para revisao do administrador.</span>}
      {origensPendentes.map(item => <button key={item.idTemporario} type="button" onClick={() => confirmarOrigem(item.idTemporario)}>Conferir origem: {item.idTemporario}</button>)}
    </div>
  );
}
