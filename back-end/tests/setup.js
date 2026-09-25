const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({
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
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});
