import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ToastContext } from './ToastContext.js';

export const ToastProvider = ({ children }) => {
  const [toast, setToast] = useState({ open: false, msg: '', type: 'info' });
  const timerRef = useRef(null);
  const toastIdRef = useRef(0);
  const mountedRef = useRef(false);

  const showToast = useCallback((msg, type = 'info') => {
    if (type === 'error') {
      console.error('[PDV] Erro apresentado pela interface:', msg);
    }

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    const toastId = ++toastIdRef.current;
    setToast({ open: true, msg, type, id: toastId });
    timerRef.current = window.setTimeout(() => {
      if (!mountedRef.current) return;

      setToast((currentToast) => (
        currentToast.id === toastId ? { ...currentToast, open: false } : currentToast
      ));

      if (toastIdRef.current === toastId) {
        timerRef.current = null;
      }
    }, 3500);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
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
      {toast.open && (
        <div
          role={toast.type === 'error' ? 'alert' : 'status'}
          aria-atomic="true"
          style={styles}
        >
          {toast.msg}
        </div>
      )}
    </ToastContext.Provider>
  );
};
