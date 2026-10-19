import { Component } from 'react';
import { captureException } from '../utils/errorReporting.js';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    captureException(error, errorInfo);
    if (this.props.onError) this.props.onError(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const fallback = this.props.fallback;
      if (typeof fallback === 'function') return fallback(this.state.error);
      if (fallback) return fallback;

      return (
        <div role="alert" style={{
          padding: '40px 20px', textAlign: 'center',
          color: 'var(--error-text)', background: 'var(--error-bg)',
          borderRadius: 12, margin: 20,
        }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Algo deu errado</h3>
          <p style={{ margin: '0 0 16px', fontSize: 13 }}>
            Não foi possível carregar esta tela. Atualize a página ou entre em contato com o suporte.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px', border: 'none', borderRadius: 8,
              background: 'var(--accent-primary)', color: 'var(--accent-text)',
              fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Recarregar página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
