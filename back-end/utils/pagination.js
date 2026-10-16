const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function parsePositiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) return null;
  return parsed;
}

function parsePagination(query, { pageKey = 'pagina', limitKey = 'limite' } = {}) {
  const requested = query[pageKey] !== undefined || query[limitKey] !== undefined;
  const pagina = parsePositiveInteger(query[pageKey], 1);
  const limite = parsePositiveInteger(query[limitKey], DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = pagina === null || limite === null ? null : (pagina - 1) * limite;

  if (pagina === null || limite === null || !Number.isSafeInteger(skip)) {
    const error = new Error('Parâmetros de paginação inválidos');
    error.status = 400;
    throw error;
  }

  return { requested, pagina, limite, skip };
}

function createPaginationResponse(dados, total, pagination) {
  const totalSeguro = Math.max(0, Number(total) || 0);
  const totalPaginas = Math.ceil(totalSeguro / pagination.limite);
  const pagina = Math.min(pagination.pagina, Math.max(1, totalPaginas));

  return {
    dados,
    total: totalSeguro,
    pagina,
    limite: pagination.limite,
    totalPaginas,
  };
}

module.exports = { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, parsePagination, createPaginationResponse };
