import { useCallback, useContext, useState } from 'react';
import AutorizarGerente from '../components/AutorizarGerente.jsx';
import { getAutorizacaoCache } from '../utils/autorizacaoGerenteCache.js';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import { useToast } from '../components/useToast.js';
import { EXIGIR_LOCAL } from '../utils/autorizacaoGerenteCache.js';
import { useConfiguracoes } from '../context/ConfiguracoesContext.jsx';

export function useAutorizacaoGerente(acao) {
  const { user } = useContext(AuthContext);
  const { exigirAutorizacaoGerente } = useConfiguracoes();
  const [modalAberto, setModalAberto] = useState(false);
  const { showToast } = useToast();

  const solicitar = useCallback(async () => {
    // If the configuration is false, we don't require authorization
    if (!exigirAutorizacaoGerente) {
      return null;
    }
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
  }, [acao, user?.role, showToast, exigirAutorizacaoGerente]);

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

  const renderizarModal = useCallback(() => {
    // If the configuration is false, we don't show the modal
    if (!exigirAutorizacaoGerente) {
      return null;
    }
    return (
      <AutorizarGerente
        acao={acao}
        aberto={modalAberto}
        onCancelar={cancelado}
        onConfirmado={confirmado}
      />
    );
  }, [modalAberto, acao, cancelado, confirmado, exigirAutorizacaoGerente]);

  return { solicitar, renderizarModal };
}
