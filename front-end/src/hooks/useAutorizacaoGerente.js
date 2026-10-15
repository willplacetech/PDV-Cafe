import { useCallback, useContext, useState } from 'react';
import AutorizarGerente, { getAutorizacaoCache } from '../components/AutorizarGerente.jsx';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import { useToast } from '../components/useToast.js';

const EXIGIR_LOCAL = typeof import.meta !== 'undefined' && import.meta.env?.VITE_EXIGIR_AUTORIZACAO_GERENTE !== 'false';

export function useAutorizacaoGerente(acao) {
  const { user } = useContext(AuthContext);
  const [modalAberto, setModalAberto] = useState(false);
  const { showToast } = useToast();

  const solicitar = useCallback(async () => {
    if (!EXIGIR_LOCAL) return null;

    const cached = getAutorizacaoCache(acao, user?.role);
    if (cached?.token) {
      return cached.token;
    }

    return new Promise((resolve, reject) => {
      setModalAberto(true);
      window.__pdv_resolve_autorizacao_gerente = (token) => {
        setModalAberto(false);
        resolve(token);
      };
      window.__pdv_reject_autorizacao_gerente = (err) => {
        setModalAberto(false);
        showToast(err || 'Autorização cancelada.', 'warning');
        reject(err);
      };
    });
  }, [acao, user?.role, showToast]);

  const confirmado = useCallback((token) => {
    if (window.__pdv_resolve_autorizacao_gerente) {
      window.__pdv_resolve_autorizacao_gerente(token);
      delete window.__pdv_resolve_autorizacao_gerente;
      delete window.__pdv_reject_autorizacao_gerente;
    }
  }, []);

  const cancelado = useCallback(() => {
    if (window.__pdv_reject_autorizacao_gerente) {
      window.__pdv_reject_autorizacao_gerente('cancelado');
      delete window.__pdv_resolve_autorizacao_gerente;
      delete window.__pdv_reject_autorizacao_gerente;
    }
  }, []);

  const renderizarModal = useCallback(() => (
    <AutorizarGerente
      acao={acao}
      aberto={modalAberto}
      onCancelar={cancelado}
      onConfirmado={confirmado}
    />
  ), [modalAberto, acao, cancelado, confirmado]);

  return { solicitar, renderizarModal };
}

export function AutorizarGerenteWrapper({ acao, children }) {
  const hook = useAutorizacaoGerente(acao);
  const childProps = typeof children === 'function'
    ? children(hook)
    : null;
  return (
    <>
      {typeof children === 'function' ? childProps : children}
      {hook.renderizarModal()}
    </>
  );
}
