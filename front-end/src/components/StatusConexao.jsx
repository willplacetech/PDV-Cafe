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
  const cor = online ? 'var(--success-bg)' : 'var(--error-bg)';
  const statusTexto = online ? 'Conectado' : 'Desconectado';

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
      <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          role="img"
          aria-label={statusTexto}
          title={statusTexto}
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            flex: '0 0 10px',
            borderRadius: '50%',
            background: cor,
            boxShadow: `0 0 0 2px color-mix(in srgb, ${cor} 22%, transparent)`,
          }}
        />
        {pendentes > 0 && ` · ⚠️ ${pendentes} venda(s) pendente(s)`}
      </strong>
      {armazenamentoCheio && <span style={{ color: 'var(--error-bg)', fontWeight: 700 }}>Conecte à internet para sincronizar</span>}
      {pendentes > 0 && <span>Não limpe os dados do site enquanto houver vendas pendentes.</span>}
      {origensPendentes.length > 0 && <span>Vendas preservadas para revisão: {origensPendentes.length}.</span>}
      {origensPendentes.map(item => item.motivoQuarentena === 'OFFLINE_ORIGIN_MISMATCH'
        ? <span key={item.idTemporario}>A venda {item.idTemporario} foi rejeitada porque o operador ou comércio mudou. Confira os dados antes de lançá-la novamente.</span>
        : <button key={item.idTemporario} type="button" onClick={() => confirmarOrigem(item.idTemporario)}>Conferir origem: {item.idTemporario}</button>)}
    </div>
  );
}
