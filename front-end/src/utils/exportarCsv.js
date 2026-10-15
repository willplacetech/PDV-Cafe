const formatarValor = (valor) => {
  if (valor == null || valor === '') return '';
  if (typeof valor === 'string') return valor;
  if (valor instanceof Date) return valor.toLocaleDateString('pt-BR');
  return String(valor);
};

const sanitizarCelula = (valor) => {
  const texto = formatarValor(valor);
  if (texto.includes(';') || texto.includes('\n') || texto.includes('"')) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
};

export function exportarCSV(dados, colunas, nomeArquivo = 'exportacao.csv') {
  const cabeçalho = colunas.map((coluna) => coluna.rotulo || coluna.chave).join(';');
  const linhas = dados.map((linha) => colunas.map((coluna) => sanitizarCelula(linha[coluna.chave])).join(';'));
  const conteudo = [cabeçalho, ...linhas].join('\n');
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
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
    { rotulo: 'Email', chave: 'email' },
    { rotulo: 'Total comprado', chave: 'totalCompras' },
  ],
  estoque: [
    { rotulo: 'Nome', chave: 'nome' },
    { rotulo: 'Código', chave: 'codigo' },
    { rotulo: 'Estoque', chave: 'estoque' },
    { rotulo: 'Mínimo', chave: 'estoqueMinimo' },
    { rotulo: 'Unidade', chave: 'unidade' },
  ],
};
