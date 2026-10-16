import { useCallback } from 'react';
import { solicitarAutorizacao } from '../services/managerApproval.js';

// eslint-disable-next-line react-refresh/only-export-components -- API existente usada pelas telas.
export function useAutorizacaoGerente(acao) {
  const solicitar = useCallback(() => solicitarAutorizacao(acao), [acao]);
  return { solicitar, renderizarModal: () => null };
}

export function AutorizarGerenteWrapper({ acao, children }) {
  const hook = useAutorizacaoGerente(acao);
  return typeof children === 'function' ? children(hook) : children;
}
