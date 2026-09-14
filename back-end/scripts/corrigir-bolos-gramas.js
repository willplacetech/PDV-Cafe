require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Comanda = require('../models/Comanda');

const aplicar = process.argv.includes('--apply');
const bolo = /bolo|rechead|caseir/i;

const corrigirDocumentos = async (Model, nome) => {
  const documentos = await Model.find({ 'itens.unidadeVenda': 'g', 'itens.nome': { $regex: bolo } });
  let itensCorrigidos = 0;

  for (const documento of documentos) {
    let alterado = false;
    for (const item of documento.itens || []) {
      if (item.unidadeVenda !== 'g' || !bolo.test(item.nome || '')) continue;
      const quantidadeAnterior = Number(item.quantidade || 0);
      const precoAnterior = Number(item.precoUnitario || 0);
      item.quantidade = quantidadeAnterior / 1000;
      item.precoUnitario = precoAnterior * 1000;
      item.unidadeVenda = 'kg';
      alterado = true;
      itensCorrigidos += 1;
      console.log(`${nome} ${documento._id}: ${item.nome} ${quantidadeAnterior}g -> ${item.quantidade}kg; preco ${precoAnterior} -> ${item.precoUnitario}`);
    }
    if (alterado && aplicar) await documento.save();
  }
  return itensCorrigidos;
};

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error('Defina MONGO_URI antes de executar a migração.');
  await mongoose.connect(process.env.MONGO_URI);
  const pedidos = await corrigirDocumentos(Order, 'Pedido');
  const comandas = await corrigirDocumentos(Comanda, 'Comanda');
  console.log(`${aplicar ? 'Migração aplicada' : 'Simulação concluída'}: ${pedidos + comandas} item(ns) encontrado(s).`);
  if (!aplicar) console.log('Para gravar as alterações, execute novamente com --apply.');
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});