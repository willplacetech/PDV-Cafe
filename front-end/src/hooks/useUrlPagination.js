import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { readPaginationParams, resetPageParam, updatePaginationParams } from '../utils/paginationUrl.js';

export default function useUrlPagination(prefix = '') {
  const [searchParams, setSearchParams] = useSearchParams();
  const { pagina, limite } = readPaginationParams(searchParams, prefix);

  const alterarPagina = useCallback((novaPagina) => {
    setSearchParams((current) => updatePaginationParams(current, { pagina: novaPagina }, prefix), { replace: true });
  }, [prefix, setSearchParams]);

  const alterarLimite = useCallback((novoLimite) => {
    setSearchParams((current) => updatePaginationParams(current, { limite: novoLimite }, prefix), { replace: true });
  }, [prefix, setSearchParams]);

  const definirFiltro = useCallback((nome, valor) => {
    setSearchParams((current) => {
      const next = resetPageParam(current, prefix);
      if (valor === '' || valor === null || valor === undefined) next.delete(nome);
      else next.set(nome, String(valor));
      return next;
    }, { replace: true });
  }, [prefix, setSearchParams]);

  const limparFiltros = useCallback((nomes) => {
    setSearchParams((current) => {
      const next = updatePaginationParams(current, { pagina: 1 }, prefix);
      nomes.forEach((nome) => next.delete(nome));
      return next;
    }, { replace: true });
  }, [prefix, setSearchParams]);

  return {
    paginaAtual: pagina,
    limiteAtual: limite,
    query: { pagina, limite },
    alterarPagina,
    alterarLimite,
    definirFiltro,
    limparFiltros,
  };
}
