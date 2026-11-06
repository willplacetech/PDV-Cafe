import { useEffect, useId, useRef, useState } from 'react';
import { useToast } from './useToast.js';

export default function ConfirmarAcao({ titulo, mensagem, acaoTexto = 'Confirmar', onConfirmar, children }) {
  const [aberto, setAberto] = useState(false);
  const [elementoAbrir, setElementoAbrir] = useState(null);
  const cancelButtonRef = useRef(null);
  const tituloId = useId();
  const mensagemId = useId();
  const { showToast } = useToast();

  useEffect(() => {
    if (!aberto) return undefined;

    const returnFocusTo = elementoAbrir;
    const dialog = cancelButtonRef.current?.closest('[role="dialog"]');
    const dialogDocument = dialog?.ownerDocument ?? document;
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setAberto(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableElements = dialog?.querySelectorAll('button:not(:disabled)');
      if (!focusableElements?.length) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && (dialogDocument.activeElement === firstElement || !dialog.contains(dialogDocument.activeElement))) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (dialogDocument.activeElement === lastElement || !dialog.contains(dialogDocument.activeElement))) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    dialogDocument.addEventListener('keydown', handleKeyDown);
    return () => {
      dialogDocument.removeEventListener('keydown', handleKeyDown);
      returnFocusTo?.focus();
    };
  }, [aberto, elementoAbrir]);

  const handleAbrir = (event) => {
    setElementoAbrir(event?.currentTarget ?? document.activeElement);
    setAberto(true);
  };

  const handleConfirmar = async () => {
    setAberto(false);
    try {
      await onConfirmar();
    } catch (error) {
      showToast(error?.response?.data?.msg || error.message || 'Não foi possível concluir a ação.', 'error');
    }
  };
  const trigger = Array.isArray(children)
    ? children.find(child => typeof child === 'function') ?? children
    : children;

  return (
    <>
      {typeof trigger === 'function' ? trigger({ onClick: handleAbrir }) : trigger}
      {aberto && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 99999, padding: 20,
        }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={tituloId}
            aria-describedby={mensagemId}
            tabIndex={-1}
            style={{
              background: 'var(--bg-secondary)', borderRadius: 16, padding: 24,
              width: '100%', maxWidth: 360, boxShadow: 'var(--shadow-lg)',
              color: 'var(--text-primary)', textAlign: 'center',
            }}
          >
            <h3 id={tituloId} style={{ margin: '0 0 12px', fontSize: 18 }}>{titulo}</h3>
            <p id={mensagemId} style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)' }}>{mensagem}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button ref={cancelButtonRef} type="button" onClick={() => setAberto(false)} style={{
                flex: 1, padding: '12px 16px', background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)', border: '1px solid var(--border-color)',
                borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 48,
              }}>Cancelar</button>
              <button type="button" onClick={handleConfirmar} style={{
                flex: 1, padding: '12px 16px', background: 'var(--error-bg)',
                color: 'var(--error-text)', border: 'none', borderRadius: 10,
                fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 48,
              }}>{acaoTexto}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
