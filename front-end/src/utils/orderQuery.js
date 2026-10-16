export function buildOrdersQuery({ pagina, limite, status, inicio, fim, paginada = true }) {
  return {
    ...(paginada ? { pagina, limite } : {}),
    ...(status && status !== 'todos' ? { status } : {}),
    ...(inicio ? { inicio } : {}),
    ...(fim ? { fim } : {}),
  };
}
