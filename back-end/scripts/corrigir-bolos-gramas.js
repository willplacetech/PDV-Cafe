require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Comanda = require('../models/Comanda');
const { corrigirBolos } = require('../utils/corrigirBolos');

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error('Defina MONGO_URI antes de executar a migração.');
  await mongoose.connect(process.env.MONGO_URI);
  if (!process.argv.includes('--apply')) throw new Error('Use --apply para executar a migração pelo script.');
  const pedidos = await corrigirBolos(Order);
  const comandas = await corrigirBolos(Comanda);
  console.log(`Migração aplicada: ${pedidos + comandas} item(ns) corrigido(s).`);
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});