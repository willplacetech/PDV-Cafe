import { useCallback, useContext } from 'react';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import { useConfiguracoes } from './useConfiguracoes.js';
import { solicitarAutorizacao } from '../services/managerApproval.js';

// eslint-disable-next-line react-refresh/only-export-components -- API existente usada pelas telas.
export function useAutorizacaoGerente(acao) {
  const { user } = useContext(AuthContext);
  const { exigirAutorizacaoGerente } = useConfiguracoes();

  const solicitar = useCallback(async () => {
    // Admin nunca precisa de senha; toggle global desligado também dispensa.
    if (user?.role === 'admin' || exigirAutorizacaoGerente === false) {
      return null;
    }
    return solicitarAutorizacao(acao);
  }, [acao, exigirAutorizacaoGerente, user?.role]);

  return { solicitar, renderizarModal: () => null };
}

export function AutorizarGerenteWrapper({ acao, children }) {
  const hook = useAutorizacaoGerente(acao);
  return typeof children === 'function' ? children(hook) : children;
}
