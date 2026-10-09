require('./models');

const { createHash, randomBytes } = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const Courier = require('./models/Courier');
const IntegrationCredential = require('./models/IntegrationCredential');
const Order = require('./models/Order');
const Tenant = require('./models/Tenant');
const User = require('./models/User');
const { normalizeOrder } = require('./orderContract');
const { createRouteLimit } = require('./routeLimits');

const router = express.Router();
const integrationLimit = createRouteLimit();
const trackingLimit = createRouteLimit();
const fail = (status, message) => Object.assign(new Error(message), { status });
const route = handler => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (error.code === 11000) return res.status(409).json({ message: 'A record with these unique values already exists.' });
    return next(error);
  }
};
const text = (value, label, max, required = true) => {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw fail(400, `Invalid ${label}.`);
  return value.trim();
};
const amount = (value, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw fail(400, `Invalid ${label}.`);
  return value;
};
const sign = claims => jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: '12h' });
const requireSession = async (req, _res, next) => {
  try {
    const header = req.get('authorization') || '';
    if (!header.startsWith('Bearer ')) throw fail(401, 'Authentication required.');
    let claims;
    try {
      claims = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    } catch {
      throw fail(401, 'Session expired or invalid.');
    }
    if (claims.role === 'courier') {
      const courier = await Courier.findOne({ _id: claims.sub, active: true });
      if (!courier || claims.ver !== courier.tokenVersion) throw fail(401, 'Courier session is inactive.');
      req.courier = courier;
    } else {
      const user = await User.findOne({ _id: claims.sub, role: claims.role });
      if (!user || claims.ver !== user.tokenVersion) throw fail(401, 'Account session is inactive.');
      if (user.tenantId && !await Tenant.exists({ _id: user.tenantId, active: true })) throw fail(403, 'Commerce is inactive.');
      req.user = user;
    }
    next();
  } catch (error) {
    next(error);
  }
};
const requireRoles = (...roles) => (req, _res, next) => {
  const role = req.courier ? 'courier' : req.user?.role;
  if (!roles.includes(role)) return next(fail(403, 'Access denied.'));
  next();
};
const tenantAdmin = [requireSession, requireRoles('tenant_admin')];
const platformAdmin = [requireSession, requireRoles('platform_admin')];
const commerceOrPlatformAdmin = [requireSession, requireRoles('tenant_admin', 'platform_admin')];
const requireIntegration = async (req, _res, next) => {
  try {
    const apiKey = req.get('x-hub-api-key');
    if (!apiKey || apiKey.length > 200) throw fail(401, 'Valid Hub API key required.');
    const digest = createHash('sha256').update(apiKey).digest('hex');
    const credential = await IntegrationCredential.findOne({ digest, active: true });
    if (!credential || !await Tenant.exists({ _id: credential.tenantId, active: true })) throw fail(401, 'Valid Hub API key required.');
    req.integrationTenantId = credential.tenantId;
    next();
  } catch (error) {
    next(error);
  }
};
const sessionResponse = (res, claims) => res.json({ token: sign(claims), user: claims });
const login = async (email, password) => {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user || !await user.matchesPassword(password)) throw fail(401, 'Email or password is incorrect.');
  if (user.tenantId && !await Tenant.exists({ _id: user.tenantId, active: true })) throw fail(403, 'Commerce is inactive.');
  return { sub: user.id, role: user.role, tenantId: user.tenantId?.toString(), ver: user.tokenVersion };
};
const orderDigest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const createOrder = async (tenantId, body, externalReference) => {
  const normalized = normalizeOrder(body);
  const digest = orderDigest(normalized);
  if (externalReference) {
    const existing = await Order.findOne({ tenantId, externalReference });
    if (existing) {
      if (existing.requestDigest !== digest) throw fail(409, 'The external reference already exists with different order content.');
      return { order: existing, created: false };
    }
  }
  try {
    const order = await Order.create({
      tenantId,
      externalReference,
      requestDigest: digest,
      trackingToken: randomBytes(24).toString('hex'),
      ...normalized,
      status: 'ready',
      statusHistory: [{ status: 'ready' }],
    });
    return { order, created: true };
  } catch (error) {
    if (error.code !== 11000 || !externalReference) throw error;
    const existing = await Order.findOne({ tenantId, externalReference });
    if (!existing) throw error;
    if (existing.requestDigest !== digest) throw fail(409, 'The external reference already exists with different order content.');
    return { order: existing, created: false };
  }
};

router.post('/auth/login', route(async (req, res) => {
  const email = text(req.body.email, 'email', 254).toLowerCase();
  const password = text(req.body.password, 'password', 72);
  const claims = await login(email, password);
  sessionResponse(res, claims);
}));
router.post('/courier/login', route(async (req, res) => {
  const phone = text(req.body.phone, 'phone', 30);
  const password = text(req.body.password, 'password', 72);
  const courier = await Courier.findOne({ phone, active: true }).select('+passwordHash');
  if (!courier || !await courier.matchesPassword(password)) throw fail(401, 'Phone or password is incorrect.');
  sessionResponse(res, { sub: courier.id, role: 'courier', tenantId: courier.tenantId.toString(), ver: courier.tokenVersion });
}));
router.post('/auth/logout', ...commerceOrPlatformAdmin, route(async (req, res) => {
  req.user.tokenVersion += 1;
  await req.user.save();
  res.status(204).end();
}));
router.post('/courier/logout', requireSession, requireRoles('courier'), route(async (req, res) => {
  req.courier.tokenVersion += 1;
  await req.courier.save();
  res.status(204).end();
}));

router.get('/tenant/configuration', ...tenantAdmin, route(async (req, res) => {
  const tenant = await Tenant.findById(req.user.tenantId).lean();
  if (!tenant) throw fail(404, 'Commerce not found.');
  res.json(tenant);
}));
router.put('/tenant/configuration', ...tenantAdmin, route(async (req, res) => {
  const updates = {};
  for (const [field, max] of Object.entries({ name: 160, phone: 30, address: 500 })) {
    if (req.body[field] !== undefined) updates[field] = text(req.body[field], field, max);
  }
  if (req.body.defaultDeliveryFee !== undefined) updates.defaultDeliveryFee = amount(req.body.defaultDeliveryFee, 'default delivery fee');
  if (!Object.keys(updates).length) throw fail(400, 'Provide at least one commerce setting.');
  const tenant = await Tenant.findByIdAndUpdate(req.user.tenantId, { $set: updates }, { new: true, runValidators: true });
  if (!tenant) throw fail(404, 'Commerce not found.');
  res.json(tenant);
}));
router.get('/platform/tenants', ...platformAdmin, route(async (_req, res) => {
  const tenants = await Tenant.find().sort({ name: 1 }).limit(500).lean();
  res.json({ tenants });
}));
router.post('/platform/tenants', ...platformAdmin, route(async (req, res) => {
  const email = text(req.body.adminEmail, 'administrator email', 254).toLowerCase();
  const password = text(req.body.adminPassword, 'administrator password', 72);
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) throw fail(400, 'Administrator password must contain 12 to 72 UTF-8 bytes.');
  const tenant = await Tenant.create({
    name: text(req.body.name, 'commerce name', 160),
    slug: text(req.body.slug, 'commerce slug', 120).toLowerCase(),
    phone: text(req.body.phone, 'commerce phone', 30),
    address: text(req.body.address, 'commerce address', 500),
    defaultDeliveryFee: req.body.defaultDeliveryFee === undefined ? 0 : amount(req.body.defaultDeliveryFee, 'default delivery fee'),
  });
  try {
    await User.create({ email, passwordHash: password, role: 'tenant_admin', tenantId: tenant._id });
  } catch (error) {
    await Tenant.deleteOne({ _id: tenant._id });
    throw error;
  }
  res.status(201).json({ tenant: tenant.toObject() });
}));
router.patch('/platform/tenants/:tenantId', ...platformAdmin, route(async (req, res) => {
  const updates = {};
  if (req.body.active !== undefined) {
    if (typeof req.body.active !== 'boolean') throw fail(400, 'Invalid active flag.');
    updates.active = req.body.active;
  }
  if (!Object.keys(updates).length) throw fail(400, 'Provide a commerce setting to update.');
  const tenant = await Tenant.findByIdAndUpdate(req.params.tenantId, { $set: updates }, { new: true, runValidators: true });
  if (!tenant) throw fail(404, 'Commerce not found.');
  res.json(tenant);
}));
router.post('/platform/tenants/:tenantId/integration-credentials', ...platformAdmin, route(async (req, res) => {
  const tenant = await Tenant.findById(req.params.tenantId);
  if (!tenant) throw fail(404, 'Commerce not found.');
  const apiKey = `dlh_${randomBytes(32).toString('base64url')}`;
  const credential = await IntegrationCredential.create({
    tenantId: tenant._id,
    digest: createHash('sha256').update(apiKey).digest('hex'),
  });
  res.status(201).json({ credentialId: credential.id, apiKey });
}));
router.delete('/platform/integration-credentials/:id', ...platformAdmin, route(async (req, res) => {
  const credential = await IntegrationCredential.findByIdAndUpdate(req.params.id, { active: false });
  if (!credential) throw fail(404, 'Credential not found.');
  res.status(204).end();
}));

router.get('/tenant/orders', ...tenantAdmin, route(async (req, res) => {
  const orders = await Order.find({ tenantId: req.user.tenantId }).select('-requestDigest').sort({ createdAt: -1 }).limit(200).lean();
  res.json({ orders });
}));
router.post('/tenant/orders', ...tenantAdmin, route(async (req, res) => {
  const result = await createOrder(req.user.tenantId, req.body);
  res.status(201).json(result.order);
}));
router.post('/tenant/orders/:id/cancel', ...tenantAdmin, route(async (req, res) => {
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.user.tenantId, status: { $in: ['pending', 'ready'] } },
    { $set: { status: 'cancelled' }, $push: { statusHistory: { status: 'cancelled' } } },
    { new: true, runValidators: true },
  );
  if (!order) throw fail(409, 'Order is not available for cancellation.');
  res.json(order);
}));
router.get('/tenant/couriers', ...tenantAdmin, route(async (req, res) => {
  const couriers = await Courier.find({ tenantId: req.user.tenantId }).select('-passwordHash').sort({ name: 1 }).lean();
  res.json({ couriers });
}));
router.post('/tenant/couriers', ...tenantAdmin, route(async (req, res) => {
  const password = text(req.body.password, 'temporary password', 72);
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) throw fail(400, 'Courier password must contain 12 to 72 UTF-8 bytes.');
  const courier = await Courier.create({
    tenantId: req.user.tenantId,
    name: text(req.body.name, 'courier name', 160),
    phone: text(req.body.phone, 'courier phone', 30),
    passwordHash: password,
  });
  const { passwordHash: _passwordHash, ...publicCourier } = courier.toObject();
  res.status(201).json(publicCourier);
}));
router.post('/tenant/orders/:id/dispatch', ...tenantAdmin, route(async (req, res) => {
  const courier = await Courier.findOne({ _id: req.body.courierId, tenantId: req.user.tenantId, active: true });
  if (!courier) throw fail(404, 'Courier not found in this commerce.');
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.user.tenantId, status: 'ready' },
    { $set: { status: 'dispatched', courierId: courier._id }, $push: { statusHistory: { status: 'dispatched' } } },
    { new: true, runValidators: true },
  );
  if (!order) throw fail(409, 'Order is not available for dispatch.');
  res.json(order);
}));
router.get('/courier/orders', requireSession, requireRoles('courier'), route(async (req, res) => {
  const orders = await Order.find({ courierId: req.courier._id, status: { $in: ['dispatched', 'on_the_way'] } }).select('-requestDigest').sort({ createdAt: -1 }).lean();
  res.json({ orders });
}));
router.get('/courier/profile', requireSession, requireRoles('courier'), route(async (req, res) => {
  res.json({ name: req.courier.name, available: req.courier.available });
}));
router.post('/courier/orders/:id/status', requireSession, requireRoles('courier'), route(async (req, res) => {
  const nextStatus = req.body.status;
  if (!['on_the_way', 'delivered'].includes(nextStatus)) throw fail(400, 'Invalid courier status.');
  const permitted = nextStatus === 'on_the_way' ? 'dispatched' : 'on_the_way';
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, courierId: req.courier._id, status: permitted },
    { $set: { status: nextStatus }, $push: { statusHistory: { status: nextStatus } } },
    { new: true, runValidators: true },
  );
  if (!order) throw fail(409, 'Order is not available for this status transition.');
  res.json(order);
}));
router.patch('/courier/availability', requireSession, requireRoles('courier'), route(async (req, res) => {
  if (typeof req.body.available !== 'boolean') throw fail(400, 'Availability must be a boolean.');
  req.courier.available = req.body.available;
  await req.courier.save();
  res.json({ available: req.courier.available });
}));
router.post('/integrations/orders', integrationLimit, requireIntegration, route(async (req, res) => {
  const reference = text(req.body.externalReference, 'external reference', 128);
  const result = await createOrder(req.integrationTenantId, req.body, reference);
  res.status(result.created ? 201 : 200).json(result.order);
}));
router.get('/tracking/:token', trackingLimit, route(async (req, res) => {
  const order = await Order.findOne({ trackingToken: req.params.token }).populate('tenantId', 'name');
  if (!order) throw fail(404, 'Tracking link not found.');
  res.json({
    commerceName: order.tenantId.name,
    status: order.status,
    createdAt: order.createdAt,
    statusHistory: order.statusHistory.map(event => ({ status: event.status, at: event.at })),
  });
}));

module.exports = router;
