const mongoose = require('mongoose');
const User = require('./models/User');
const Product = require('./models/Product');
const Customer = require('./models/Customer');
const Order = require('./models/Order');
const Comanda = require('./models/Comanda');
const Recipe = require('./models/Recipe');
const Production = require('./models/Production');
const StockMovement = require('./models/StockMovement');
const Despesa = require('./models/Despesa');
const HistoricoCusto = require('./models/HistoricoCusto');

const models = [User, Product, Customer, Order, Comanda, Recipe, Production, StockMovement, Despesa, HistoricoCusto];

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    await Promise.all(models.map((model) => model.createCollection()));
    await Product.updateMany({ categoria: 'Alimentos' }, { $set: { categoria: 'Café da manhã' } });
    await Product.updateMany({ categoria: 'Bebidas' }, { $set: { categoria: 'Bebidas geladas' } });
    await Product.updateMany({ categoria: 'Padaria' }, { $set: { categoria: 'Salgados' } });
    await Product.updateMany({ categoria: 'Grãos e insumos' }, { $set: { categoria: 'Insumos' } });
    await Product.updateMany({ categoria: { $in: ['Limpeza', 'Higiene', 'Hortifruti'] } }, { $set: { categoria: 'Outros' } });
    const adminExists = await User.exists({ username: 'admin' });
    if (!adminExists) {
      await User.create({
        username: 'admin',
        password: process.env.ADMIN_PASSWORD || '1234',
        role: 'admin',
      });
    }

    console.log(`MongoDB Conectado: ${conn.connection.host}`.cyan.underline.bold);
  } catch (error) {
    console.error(`Erro na conexão: ${error.message}`.red.bold);
    process.exit(1);
  }
};

module.exports = connectDB;