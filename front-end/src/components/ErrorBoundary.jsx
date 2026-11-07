import { Component } from 'react';
import { captureException } from '../utils/errorReporting.js';
import { recoverStaleApp } from '../services/appVersion.js';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, isRecovering: false, recoveryError: '' };
  }

  recuperarAplicativo = async () => {
    this.setState({ isRecovering: true, recoveryError: '' });
    try {
      await recoverStaleApp(window);
    } catch (error) {
      console.error('[PWA] Não foi possível recuperar o aplicativo automaticamente.', error);
      this.setState({
        isRecovering: false,
        recoveryError: 'Não foi possível atualizar automaticamente. Verifique sua conexão e tente novamente.',
      });
    }
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
          {this.state.recoveryError && (
            <p role="alert" style={{ margin: '0 0 16px', fontSize: 13 }}>
              {this.state.recoveryError}
            </p>
          )}
          <button
            type="button"
            onClick={this.recuperarAplicativo}
            disabled={this.state.isRecovering}
            style={{
              padding: '10px 20px', border: 'none', borderRadius: 8,
              background: 'var(--accent-primary)', color: 'var(--accent-text)',
              fontSize: 14, fontWeight: 600,
              cursor: this.state.isRecovering ? 'wait' : 'pointer',
              opacity: this.state.isRecovering ? 0.7 : 1,
              fontFamily: 'inherit',
            }}
          >
            {this.state.isRecovering ? 'Atualizando…' : 'Corrigir e recarregar'}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
