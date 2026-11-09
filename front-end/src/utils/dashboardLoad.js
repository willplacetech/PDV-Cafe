export function shouldSkipDashboardReload({
  selectedMonth,
  loadedMonth,
  carregandoFechamento,
}) {
  if (carregandoFechamento) return true;
  if (!selectedMonth) return true;
  return selectedMonth === loadedMonth;
}
