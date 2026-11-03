const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const formatarEstoque = (valor) => Number(valor || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export function createInventoryPrintHtml(items, emittedAt = new Date()) {
  const dataEmissao = emittedAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const linhas = items.map((item) => {
    const tipo = item.tipo === 'insumo' ? 'Insumo' : 'Venda';
    const categoriaTipo = [item.categoria, tipo].filter(Boolean).join(' / ');
    return `<tr>
      <td>${escapeHtml(item.codigo)}</td>
      <td>${escapeHtml(item.nome)}</td>
      <td>${escapeHtml(categoriaTipo)}</td>
      <td>${escapeHtml(item.unidade)}</td>
      <td class="numeric">${escapeHtml(formatarEstoque(item.estoque))}</td>
      <td class="manual"></td>
      <td class="manual"></td>
    </tr>`;
  }).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Inventário de produtos</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { color: #111; font: 10pt Arial, sans-serif; margin: 0; }
    h1 { font-size: 18pt; margin: 0 0 4mm; }
    .emission-date { margin: 0 0 6mm; }
    table { border-collapse: collapse; table-layout: fixed; width: 100%; }
    th, td { border: 1px solid #444; padding: 2mm; text-align: left; overflow-wrap: anywhere; }
    th { background: #eee; font-size: 9pt; }
    td { height: 9mm; }
    .numeric { text-align: right; }
    .manual { min-width: 20mm; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
  </style>
</head>
<body>
  <h1>Inventário de produtos e insumos</h1>
  <p class="emission-date">Emitido em: ${escapeHtml(dataEmissao)}</p>
  <table>
    <thead><tr><th>Código</th><th>Produto</th><th>Categoria / tipo</th><th>Unidade</th><th>Saldo atual</th><th>Contagem física</th><th>Diferença</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table>
</body>
</html>`;
}
