const fail = message => Object.assign(new Error(message), { status: 400 });
const text = (value, label, max) => {
  if (typeof value !== 'string' || value.length > max || !value.trim()) throw fail(`Invalid ${label}.`);
  return value.trim();
};
const amount = (value, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw fail(`Invalid ${label}.`);
  return value;
};

const normalizeOrder = body => {
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 200) throw fail('At least one valid item is required.');
  const items = body.items.map(item => ({
    description: text(item.description, 'item description', 240),
    quantity: amount(item.quantity, 'item quantity'),
    unitPrice: amount(item.unitPrice, 'item unit price'),
  }));
  if (items.some(item => item.quantity === 0)) throw fail('Item quantity must be positive.');
  return {
    customer: {
      name: text(body.customer?.name, 'customer name', 160),
      phone: text(body.customer?.phone, 'customer phone', 30),
      address: text(body.customer?.address, 'delivery address', 500),
    },
    items,
    total: amount(body.total, 'order total'),
    deliveryFee: amount(body.deliveryFee, 'delivery fee'),
  };
};

module.exports = { normalizeOrder };
