import { useState } from 'react';
import { useToast } from './useToast.js';

export default function ConfirmarAcao({ titulo, mensagem, acaoTexto = 'Confirmar', onConfirmar, children }) {
  const [aberto, setAberto] = useState(false);
  const { showToast } = useToast();

  const handleConfirmar = async () => {
    setAberto(false);
    try {
      await onConfirmar();
    } catch (error) {
      showToast(error?.response?.data?.msg || error.message || 'Não foi possível concluir a ação.', 'error');
    }
  };

  return (
    <>
      {typeof children === 'function' ? children({ onClick: () => setAberto(true) }) : null}
      {aberto && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 99999, padding: 20,
        }}>
          <div style={{
            background: 'var(--bg-secondary)', borderRadius: 16, padding: 24,
            width: '100%', maxWidth: 360, boxShadow: 'var(--shadow-lg)',
            color: 'var(--text-primary)', textAlign: 'center',
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18 }}>{titulo}</h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)' }}>{mensagem}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setAberto(false)} style={{
                flex: 1, padding: '12px', background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)', border: '1px solid var(--border-color)',
                borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
              }}>Cancelar</button>
              <button type="button" onClick={handleConfirmar} style={{
                flex: 1, padding: '12px', background: 'var(--error-bg)',
                color: 'var(--error-text)', border: 'none', borderRadius: 10,
                fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
              }}>{acaoTexto}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
