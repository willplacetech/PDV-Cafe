process.env.JWT_SECRET = 'test-only-private-key-for-isolated-api-tests';

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const path = require('path');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({
    binary: { version: process.env.MONGOMS_VERSION || '7.0.24', downloadDir: path.resolve(__dirname, '../../.test-mongodb-cache') },
    replSet: { name: 'test-replica-set', count: 1 },
  });
  const uri = mongoServer.getUri();
  mongoose.set('autoIndex', true);
  await mongoose.connect(uri);
  const Product = require('../models/Product');
  const User = require('../models/User');
  const Customer = require('../models/Customer');
  const Order = require('../models/Order');
  const Comanda = require('../models/Comanda');
  await Promise.all([
    Product.init(),
    User.init(),
    Customer.init(),
    Order.init(),
    Comanda.init(),
    require('../models/RuntimeSettings').init(),
    require('../models/MesasSettings').init(),
  ]);
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});
