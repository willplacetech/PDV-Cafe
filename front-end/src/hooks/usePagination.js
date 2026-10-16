import { useCallback, useState } from 'react';

export function paginarItens(itens, paginaAtual, limiteAtual) {
  const lista = Array.isArray(itens) ? itens : [];
  const limite = Number.isInteger(Number(limiteAtual)) && Number(limiteAtual) > 0 ? Number(limiteAtual) : 25;
  const total = lista.length;
  const totalPaginas = Math.max(1, Math.ceil(total / limite));
  const pagina = Math.min(Math.max(1, Number.parseInt(paginaAtual, 10) || 1), totalPaginas);
  const inicio = (pagina - 1) * limite;

  return {
    itensPagina: lista.slice(inicio, inicio + limite),
    paginaAtual: pagina,
    limiteAtual: limite,
    total,
  };
}

export default function usePagination(itens, limiteInicial = 25, resetKey) {
  const [estadoInterno, setEstadoInterno] = useState({ pagina: 1, limite: limiteInicial, resetKey });
  const paginaSolicitada = Object.is(estadoInterno.resetKey, resetKey) ? estadoInterno.pagina : 1;
  const estado = paginarItens(itens, paginaSolicitada, estadoInterno.limite);

  const alterarPagina = useCallback(novaPagina => {
    setEstadoInterno(atual => ({ ...atual, pagina: Number.parseInt(novaPagina, 10) || 1, resetKey }));
  }, [resetKey]);

  const alterarLimite = useCallback(novoLimite => {
    const limiteValido = Number.parseInt(novoLimite, 10);
    if (limiteValido > 0) {
      setEstadoInterno({ pagina: 1, limite: limiteValido, resetKey });
    }
  }, [resetKey]);

  const reiniciar = useCallback(() => setEstadoInterno(atual => ({ ...atual, pagina: 1, resetKey })), [resetKey]);

  return { ...estado, alterarPagina, alterarLimite, reiniciar };
}
