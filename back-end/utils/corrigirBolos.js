const bolo = /bolo|rechead|caseir/i;

const corrigirBolos = async (Model) => {
  const documentos = await Model.find({ 'itens.unidadeVenda': 'g', 'itens.nome': { $regex: bolo } });
  let itensCorrigidos = 0;

  for (const documento of documentos) {
    let alterado = false;
    for (const item of documento.itens || []) {
      if (item.unidadeVenda !== 'g' || !bolo.test(item.nome || '')) continue;
      item.quantidade = Number(item.quantidade || 0) / 1000;
      item.precoUnitario = Number(item.precoUnitario || 0) * 1000;
      item.unidadeVenda = 'kg';
      alterado = true;
      itensCorrigidos += 1;
    }
    if (alterado) await documento.save();
  }
  return itensCorrigidos;
};

module.exports = { corrigirBolos };