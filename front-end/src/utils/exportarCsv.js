export const dataArquivoCSV = (data = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(data);

const sanitizarCelula = (valor) => {
  if (valor == null) return '';
  // Números permanecem numéricos no Excel brasileiro; texto nunca vira fórmula.
  let texto = typeof valor === 'number' ? String(valor).replace('.', ',')
    : valor instanceof Date ? valor.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : String(valor);
  if (typeof valor === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(texto)) texto = `'${texto}`;
  if (/[;\r\n"]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
};

export function criarCSV(dados, colunas) {
  const cabeçalho = colunas.map((coluna) => sanitizarCelula(coluna.rotulo || coluna.chave)).join(';');
  const linhas = dados.map((linha) => colunas.map((coluna) => sanitizarCelula(linha[coluna.chave])).join(';'));
  return `\uFEFF${[cabeçalho, ...linhas].join('\r\n')}`;
}

export function exportarCSV(dados, colunas, nomeArquivo = `exportacao_${dataArquivoCSV()}.csv`) {
  const blob = new Blob([criarCSV(dados, colunas)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const colunasCSV = {
  vendas: [
    { rotulo: 'Data', chave: 'createdAt' },
    { rotulo: 'Número', chave: 'numero' },
    { rotulo: 'Cliente', chave: 'clienteNome' },
    { rotulo: 'Total', chave: 'total' },
    { rotulo: 'Status', chave: 'status' },
  ],
  clientes: [
    { rotulo: 'Nome', chave: 'nome' },
    { rotulo: 'Telefone', chave: 'telefone' },
    { rotulo: 'CPF', chave: 'cpf' },
    { rotulo: 'Aniversário', chave: 'aniversario' },
  ],
  estoque: [
    { rotulo: 'Nome', chave: 'nome' },
    { rotulo: 'Código', chave: 'codigo' },
    { rotulo: 'Tipo', chave: 'tipo' },
    { rotulo: 'Categoria', chave: 'categoria' },
    { rotulo: 'Preço de venda', chave: 'preco' },
    { rotulo: 'Estoque', chave: 'estoque' },
    { rotulo: 'Mínimo', chave: 'estoqueMinimo' },
    { rotulo: 'Unidade', chave: 'unidade' },
    { rotulo: 'Estoque de insumos', chave: 'estoqueInsumos' },
    { rotulo: 'Mínimo de insumos', chave: 'estoqueMinimoInsumos' },
    { rotulo: 'Estoque em kg', chave: 'estoquePesoKg' },
  ],
};
