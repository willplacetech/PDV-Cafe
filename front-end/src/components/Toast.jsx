import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext();

export const ToastProvider = ({ children }) => {
  const [toast, setToast] = useState({ open: false, msg: '', type: 'info' });

  const showToast = useCallback((msg, type = 'info') => {
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
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);