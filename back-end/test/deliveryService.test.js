const { urlPublicaDelivery } = require('../utils/deliveryService');

describe('URL pública do DeliveryLink', () => {
  const original = {
    nodeEnv: process.env.NODE_ENV,
    deliveryPublicUrl: process.env.DELIVERY_PUBLIC_URL,
    frontendUrl: process.env.FRONTEND_URL,
  };

  afterEach(() => {
    if (original.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original.nodeEnv;
    if (original.deliveryPublicUrl === undefined) delete process.env.DELIVERY_PUBLIC_URL;
    else process.env.DELIVERY_PUBLIC_URL = original.deliveryPublicUrl;
    if (original.frontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original.frontendUrl;
  });

  test('produção ignora localhost e usa o domínio público do Delivery como fallback', () => {
    process.env.NODE_ENV = 'production';
    process.env.DELIVERY_PUBLIC_URL = 'http://localhost:5173';
    process.env.FRONTEND_URL = 'http://localhost:5173';

    expect(urlPublicaDelivery()).toBe('https://pdv-delivery-9j0a.onrender.com');
  });

  test('produção prefere a URL pública configurada', () => {
    process.env.NODE_ENV = 'production';
    process.env.DELIVERY_PUBLIC_URL = 'https://pdv-delivery-9j0a.onrender.com/';
    process.env.FRONTEND_URL = 'http://localhost:5173';

    expect(urlPublicaDelivery()).toBe('https://pdv-delivery-9j0a.onrender.com');
  });

  test('desenvolvimento continua usando localhost', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DELIVERY_PUBLIC_URL;
    process.env.FRONTEND_URL = 'http://localhost:5173';

    expect(urlPublicaDelivery()).toBe('http://localhost:5173');
  });
});
