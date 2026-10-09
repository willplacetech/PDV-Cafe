export const COMANDAS_POR_MULTIPLICADOR_FIDELIDADE = 10;

export const calcularMultiplicadorFidelidade = (totalComandas) => {
  const total = Number(totalComandas);
  return Math.floor(Math.max(0, Number.isFinite(total) ? total : 0) / COMANDAS_POR_MULTIPLICADOR_FIDELIDADE);
};
