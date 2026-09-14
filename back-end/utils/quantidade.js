const quantidadeNaUnidadeBase = (item = {}) => {
  const quantidade = Number(item.quantidade || 0);
  if (item.unidadeVenda === 'g') return quantidade / 1000;
  if (item.unidadeVenda === 'ml') return quantidade / 1000;
  return quantidade;
};

module.exports = { quantidadeNaUnidadeBase };