export function formatarDataSegura(valor) {
  if (valor === null || valor === undefined || valor === '') return '-';

  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? '-' : data.toLocaleString('pt-BR');
}
