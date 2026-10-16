export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const parameterName = (name, prefix) => prefix ? `${name}_${prefix}` : name;

export function readPaginationParams(searchParams, prefix = '') {
  const paginaValue = Number(searchParams.get(parameterName('pagina', prefix)));
  const limiteValue = Number(searchParams.get(parameterName('limite', prefix)));

  return {
    pagina: Number.isSafeInteger(paginaValue) && paginaValue > 0 ? paginaValue : 1,
    limite: PAGE_SIZE_OPTIONS.includes(limiteValue) ? limiteValue : 25,
  };
}

export function updatePaginationParams(searchParams, changes, prefix = '') {
  const next = new URLSearchParams(searchParams);
  const current = readPaginationParams(next, prefix);
  const pagina = changes.pagina ?? (changes.limite !== undefined ? 1 : current.pagina);
  const limite = changes.limite ?? current.limite;

  next.set(parameterName('pagina', prefix), String(pagina));
  next.set(parameterName('limite', prefix), String(limite));
  return next;
}

export function resetPageParam(searchParams, prefix = '') {
  return updatePaginationParams(searchParams, { pagina: 1 }, prefix);
}
