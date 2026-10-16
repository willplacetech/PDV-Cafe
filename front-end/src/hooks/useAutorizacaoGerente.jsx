import { useCallback } from 'react';
import { useConfiguracoes } from './useConfiguracoes.js';
import { solicitarAutorizacao } from '../services/managerApproval.js';

// eslint-disable-next-line react-refresh/only-export-components -- API existente usada pelas telas.
export function useAutorizacaoGerente(acao) {
  const { exigirAutorizacaoGerente } = useConfiguracoes();

  const solicitar = useCallback(async () => {
    if (exigirAutorizacaoGerente === false) {
      return null;
    }
    return solicitarAutorizacao(acao);
  }, [acao, exigirAutorizacaoGerente]);

  return { solicitar, renderizarModal: () => null };
}

export function AutorizarGerenteWrapper({ acao, children }) {
  const hook = useAutorizacaoGerente(acao);
  return typeof children === 'function' ? children(hook) : children;
}
