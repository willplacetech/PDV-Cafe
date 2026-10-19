export default function PagamentoResultadoModal({
  titulo = 'Pagamento registrado',
  descricao,
  pedido,
  onPrint,
  onWhatsApp,
  onClose,
}) {
  if (!pedido) return null;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 20
    }}>
      <div onClick={(event) => event.stopPropagation()} style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 16,
        padding: 24, width: '100%', maxWidth: 360, textAlign: 'center'
      }}>
        <h3 style={{ margin: '0 0 8px' }}>✅ {titulo}</h3>
        <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)' }}>
          {descricao || `Pedido(s) #${pedido.numero} atualizado(s) com sucesso.`}
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          <button onClick={onPrint} style={{
            padding: 12, background: 'var(--brand-brown)', color: 'var(--brand-action-text)', border: 'none', borderRadius: 10,
            fontWeight: 700, cursor: 'pointer'
          }}>🖨️ Imprimir comprovante</button>
          <button onClick={onWhatsApp} style={{
            padding: 12, background: 'var(--success-bg)', color: '#fff', border: 'none', borderRadius: 10,
            fontWeight: 700, cursor: 'pointer'
          }}>💬 Enviar pelo WhatsApp</button>
          <button onClick={onClose} style={{
            padding: 11, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 10,
            fontWeight: 600, cursor: 'pointer'
          }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
