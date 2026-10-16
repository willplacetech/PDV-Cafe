import React, { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '../../src/components/Toast.jsx';
import { ComandaProvider } from '../../src/context/ComandaContext.jsx';
import Orders from '../../src/pages/Orders.jsx';

function OrdersTestHarness() {
  const location = useLocation();
  return h(React.Fragment, null,
    h('output', { 'data-testid': 'orders-path' }, location.pathname),
    h(Orders)
  );
}

export function mountOrders() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(h(ToastProvider, null,
    h(MemoryRouter, { initialEntries: ['/orders'] },
      h(ComandaProvider, null, h(OrdersTestHarness))
    )
  ));
  window.__ordersTestCleanup = () => {
    root.unmount();
    container.remove();
    delete window.__ordersTestCleanup;
  };
}
