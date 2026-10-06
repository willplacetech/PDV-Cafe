import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ToastContext } from './ToastContext.js';

export const ToastProvider = ({ children }) => {
  const [toast, setToast] = useState({ open: false, msg: '', type: 'info' });
  const [aguardandoServidor, setAguardandoServidor] = useState(false);
  const requisicoesPendentes = useRef(0);
  const timerAguarde = useRef(null);

  useEffect(() => {
    const iniciar = () => {
      requisicoesPendentes.current += 1;
      if (requisicoesPendentes.current === 1) {
        timerAguarde.current = window.setTimeout(() => {
          if (requisicoesPendentes.current > 0) setAguardandoServidor(true);
        }, 600);
      }
    };
    const finalizar = () => {
      requisicoesPendentes.current = Math.max(0, requisicoesPendentes.current - 1);
      if (requisicoesPendentes.current === 0) {
        window.clearTimeout(timerAguarde.current);
        setAguardandoServidor(false);
      }
    };

    window.addEventListener('pdv:request-start', iniciar);
    window.addEventListener('pdv:request-end', finalizar);
    return () => {
      window.removeEventListener('pdv:request-start', iniciar);
      window.removeEventListener('pdv:request-end', finalizar);
      window.clearTimeout(timerAguarde.current);
    };
  }, []);

  const showToast = useCallback((msg, type = 'info') => {
    if (type === 'error') {
      console.error('[PDV] Erro apresentado pela interface:', msg);
      return;
    }
    setToast({ open: true, msg, type });
    setTimeout(() => setToast((currentToast) => ({ ...currentToast, open: false })), 3500);
  }, []);

  const getBackgroundColor = () => {
    switch(toast.type) {
      case 'error': return 'var(--error-bg)';
      case 'success': return 'var(--success-bg)';
      case 'warning': return 'var(--warning-bg)';
      default: return 'var(--info-bg)';
    }
  };

  const styles = {
    position: 'fixed',
    top: 20,
    right: 20,
    padding: '12px 24px',
    borderRadius: 6,
    color: '#fff',
    fontWeight: 500,
    zIndex: 9999,
    backgroundColor: getBackgroundColor(),
    transition: 'all 0.3s ease'
  };

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {toast.open && <div style={styles}>{toast.msg}</div>}
      {aguardandoServidor && <div role="status" aria-live="polite" style={{ position: 'fixed', left: '50%', bottom: 20, transform: 'translateX(-50%)', zIndex: 9998, padding: '10px 16px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', boxShadow: 'var(--shadow-md)', fontWeight: 700 }}>Aguarde...</div>}
    </ToastContext.Provider>
  );
};
