import { useCallback, useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const tokenKey = 'deliverylinkhub_session';
const readSession = () => {
  try {
    return JSON.parse(localStorage.getItem(tokenKey) || 'null');
  } catch {
    return null;
  }
};

async function request(path, { token, ...options } = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
}

function Login({ onLogin, onError }) {
  const [courierLogin, setCourierLogin] = useState(false);
  const submit = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const session = await request(courierLogin ? '/courier/login' : '/auth/login', {
        method: 'POST',
        body: JSON.stringify(courierLogin
          ? { phone: form.get('phone'), password: form.get('password') }
          : { email: form.get('email'), password: form.get('password') }),
      });
      onLogin(session);
    } catch (error) {
      onError(error.message);
    }
  };
  return <main className="login-shell"><form className="panel form" onSubmit={submit}>
    <p className="eyebrow">DELIVERY OPERATIONS</p><h1>DeliveryLinkHub</h1>
    {courierLogin
      ? <label>Phone<input name="phone" type="tel" autoComplete="username" required /></label>
      : <label>Email<input name="email" type="email" autoComplete="username" required /></label>}
    <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
    <button>Sign in</button>
    <button type="button" className="secondary" onClick={() => setCourierLogin(value => !value)}>
      {courierLogin ? 'Commerce / platform sign in' : 'Courier sign in'}
    </button>
  </form></main>;
}

function Tracking({ token }) {
  const [tracking, setTracking] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => request(`/tracking/${encodeURIComponent(token)}`)
      .then(data => { if (active) { setTracking(data); setError(''); } })
      .catch(reason => { if (active) setError(reason.message); });
    void load();
    const timer = window.setInterval(load, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [token]);
  return <main className="tracking-shell"><section className="panel">
    <p className="eyebrow">PUBLIC ORDER TRACKING</p><h1>{tracking?.commerceName || 'Your delivery'}</h1>
    {error ? <p role="alert">{error}</p> : tracking ? <><p className="status">{tracking.status.replaceAll('_', ' ')}</p><ol>{tracking.statusHistory.map((item, index) => <li key={`${item.status}-${index}`}>{item.status.replaceAll('_', ' ')}</li>)}</ol></> : <p>Loading delivery status…</p>}
  </section></main>;
}

function Hub({ session, onLogout, onError }) {
  const [orders, setOrders] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [commerce, setCommerce] = useState(null);
  const [credential, setCredential] = useState(null);
  const [courierSelection, setCourierSelection] = useState({});
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    if (session.user.role === 'tenant_admin') {
      const [orderData, courierData, commerceData] = await Promise.all([
        request('/tenant/orders', { token: session.token }),
        request('/tenant/couriers', { token: session.token }),
        request('/tenant/configuration', { token: session.token }),
      ]);
      setOrders(orderData.orders);
      setCouriers(courierData.couriers);
      setCommerce(commerceData);
    } else if (session.user.role === 'platform_admin') {
      const tenantData = await request('/platform/tenants', { token: session.token });
      setTenants(tenantData.tenants);
    }
  }, [session]);

  useEffect(() => {
    reload().catch(error => onError(error.message));
  }, [reload, onError]);

  const perform = async action => {
    setBusy(true);
    try {
      await action();
      await reload();
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  };
  const createOrder = event => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    void perform(async () => {
      await request('/tenant/orders', { token: session.token, method: 'POST', body: JSON.stringify({
        customer: { name: form.get('customer'), phone: form.get('phone'), address: form.get('address') },
        items: [{ description: form.get('item'), quantity: Number(form.get('quantity')), unitPrice: Number(form.get('unitPrice')) }],
        total: Number(form.get('total')),
        deliveryFee: Number(form.get('deliveryFee')),
      }) });
      formElement.reset();
    });
  };
  const createCourier = event => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    void perform(async () => {
      await request('/tenant/couriers', { token: session.token, method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
      formElement.reset();
    });
  };
  const createTenant = event => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    void perform(async () => {
      await request('/platform/tenants', { token: session.token, method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
      formElement.reset();
    });
  };
  const updateCommerce = event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void perform(async () => {
      await request('/tenant/configuration', { token: session.token, method: 'PUT', body: JSON.stringify({
        name: form.get('name'),
        phone: form.get('phone'),
        address: form.get('address'),
        defaultDeliveryFee: Number(form.get('defaultDeliveryFee')),
      }) });
    });
  };
  const toggleTenant = tenant => {
    void perform(() => request(`/platform/tenants/${tenant._id}`, {
      token: session.token,
      method: 'PATCH',
      body: JSON.stringify({ active: !tenant.active }),
    }));
  };
  const issueCredential = tenant => {
    void perform(async () => {
      const result = await request(`/platform/tenants/${tenant._id}/integration-credentials`, { token: session.token, method: 'POST' });
      setCredential({ tenantName: tenant.name, ...result });
    });
  };
  const revokeCredential = () => {
    if (!credential) return;
    void perform(async () => {
      await request(`/platform/integration-credentials/${credential.credentialId}`, { token: session.token, method: 'DELETE' });
      setCredential(null);
    });
  };
  const dispatch = order => {
    const courierId = courierSelection[order._id];
    if (!courierId) return;
    void perform(() => request(`/tenant/orders/${order._id}/dispatch`, {
      token: session.token,
      method: 'POST',
      body: JSON.stringify({ courierId }),
    }));
  };
  const cancelOrder = order => {
    if (!window.confirm(`Cancel delivery for ${order.customer.name}?`)) return;
    void perform(() => request(`/tenant/orders/${order._id}/cancel`, { token: session.token, method: 'POST' }));
  };

  return <main className="shell">
    <header className="topbar"><div><p className="eyebrow">DELIVERY OPERATIONS</p><h1>DeliveryLinkHub</h1></div><button className="secondary" onClick={onLogout}>Sign out</button></header>
    {session.user.role === 'platform_admin' ? <section className="panel">
      <h2>Create commerce</h2>
      <form className="form grid" onSubmit={createTenant}>
        <label>Commerce name<input name="name" required maxLength="160" /></label><label>Slug<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>
        <label>Phone<input name="phone" required maxLength="30" /></label><label>Address<input name="address" required maxLength="500" /></label>
        <label>Default delivery fee<input name="defaultDeliveryFee" type="number" min="0" step="0.01" defaultValue="0" required /></label>
        <label>Administrator email<input name="adminEmail" type="email" required /></label><label>Administrator password<input name="adminPassword" type="password" required minLength="12" /></label>
        <button disabled={busy}>Create commerce</button>
      </form>
      <h2>Commerces</h2><ul>{tenants.map(tenant => <li key={tenant._id}>
        {tenant.name} · {tenant.slug} · {tenant.active ? 'active' : 'inactive'}
        <button className="secondary inline-button" disabled={busy || !tenant.active} onClick={() => issueCredential(tenant)}>Issue integration key</button>
        <button className="secondary inline-button" disabled={busy} onClick={() => toggleTenant(tenant)}>{tenant.active ? 'Deactivate' : 'Reactivate'}</button>
      </li>)}</ul>
      {credential && <div className="credential" role="status">
        <strong>Copy this key for {credential.tenantName}. It is shown only once.</strong>
        <code>{credential.apiKey}</code>
        <button className="secondary" disabled={busy} onClick={revokeCredential}>Revoke key</button>
      </div>}
      <p className="muted">Integration secrets are hashed at rest and scoped to one active commerce.</p>
    </section> : session.user.role === 'courier' ? <CourierView session={session} onError={onError} /> : <>
      {commerce && <section className="panel"><h2>Commerce settings</h2>
        <form className="form grid" onSubmit={updateCommerce}>
          <label>Name<input name="name" defaultValue={commerce.name} required maxLength="160" /></label>
          <label>Phone<input name="phone" type="tel" defaultValue={commerce.phone} required maxLength="30" /></label>
          <label>Address<input name="address" defaultValue={commerce.address} required maxLength="500" /></label>
          <label>Default delivery fee<input name="defaultDeliveryFee" type="number" min="0" step="0.01" defaultValue={commerce.defaultDeliveryFee} required /></label>
          <button disabled={busy}>Save settings</button>
        </form>
      </section>}
      <section className="panel">
        <h2>New delivery</h2>
        <form className="form grid" onSubmit={createOrder}>
          <label>Customer<input name="customer" required maxLength="160" /></label><label>Phone<input name="phone" required maxLength="30" /></label>
          <label>Address<input name="address" required maxLength="500" /></label><label>Item<input name="item" required maxLength="240" /></label>
          <label>Quantity<input name="quantity" type="number" min="0.001" step="0.001" defaultValue="1" required /></label>
          <label>Unit price<input name="unitPrice" type="number" min="0" step="0.01" required /></label>
          <label>Order total<input name="total" type="number" min="0" step="0.01" required /></label>
          <label>Delivery fee<input name="deliveryFee" type="number" min="0" step="0.01" defaultValue={commerce?.defaultDeliveryFee || 0} required /></label>
          <button disabled={busy}>Create delivery</button>
        </form>
      </section>
      <section className="columns">
        <div className="panel"><h2>Couriers</h2><form className="form grid" onSubmit={createCourier}>
          <label>Name<input name="name" required maxLength="160" /></label><label>Phone<input name="phone" type="tel" required maxLength="30" /></label>
          <label>Temporary password<input name="password" type="password" required minLength="12" /></label><button disabled={busy}>Add courier</button>
        </form><ul>{couriers.map(courier => <li key={courier._id}>{courier.name} · {courier.phone} · {courier.available ? 'available' : 'busy'}</li>)}</ul></div>
        <div className="panel"><h2>Orders and history</h2>{orders.map(order => <article className="order" key={order._id}>
          <div><strong>{order.customer.name}</strong><span>{order.status.replaceAll('_', ' ')}</span></div>
          <p>{order.customer.address}</p><p>Total {order.total.toFixed(2)} · delivery {order.deliveryFee.toFixed(2)}</p>
          <a href={`/tracking/${order.trackingToken}`} target="_blank" rel="noreferrer">Public tracking</a>
          {order.status === 'ready' && <div className="dispatch">
            <select aria-label={`Courier for ${order.customer.name}`} value={courierSelection[order._id] || ''} onChange={event => setCourierSelection(current => ({ ...current, [order._id]: event.target.value }))}>
              <option value="">Select a courier</option>
              {couriers.filter(courier => courier.active && courier.available).map(courier => <option key={courier._id} value={courier._id}>{courier.name}</option>)}
            </select>
            <button className="secondary" disabled={busy || !courierSelection[order._id]} onClick={() => dispatch(order)}>Assign courier</button>
          </div>}
          {['pending', 'ready'].includes(order.status) && <button className="secondary" disabled={busy} onClick={() => cancelOrder(order)}>Cancel order</button>}
        </article>)}</div>
      </section>
    </>}
  </main>;
}

function CourierView({ session, onError }) {
  const [orders, setOrders] = useState([]);
  const [available, setAvailable] = useState(true);
  const reload = useCallback(async () => {
    const [orderData, profile] = await Promise.all([
      request('/courier/orders', { token: session.token }),
      request('/courier/profile', { token: session.token }),
    ]);
    setOrders(orderData.orders);
    setAvailable(profile.available);
  }, [session]);
  useEffect(() => { reload().catch(error => onError(error.message)); }, [reload, onError]);
  const update = (order, status) => request(`/courier/orders/${order._id}/status`, {
    token: session.token,
    method: 'POST',
    body: JSON.stringify({ status }),
  }).then(reload).catch(error => onError(error.message));
  const toggleAvailability = async () => {
    try {
      const response = await request('/courier/availability', { token: session.token, method: 'PATCH', body: JSON.stringify({ available: !available }) });
      setAvailable(response.available);
      onError('');
    } catch (error) {
      onError(error.message);
    }
  };
  return <section className="panel"><div className="courier-heading"><h2>Assigned deliveries</h2><button className="secondary" onClick={toggleAvailability}>{available ? 'Set unavailable' : 'Set available'}</button></div>{orders.map(order => <article className="order" key={order._id}>
    <strong>{order.customer.name}</strong><p>{order.customer.phone} · {order.customer.address}</p><span>{order.status}</span>
    {order.status === 'dispatched' && <button onClick={() => update(order, 'on_the_way')}>Start delivery</button>}
    {order.status === 'on_the_way' && <button onClick={() => update(order, 'delivered')}>Confirm delivery</button>}
  </article>)}</section>;
}

export default function App() {
  const [session, setSession] = useState(readSession);
  const [error, setError] = useState('');
  const trackingToken = window.location.pathname.startsWith('/tracking/')
    ? window.location.pathname.slice('/tracking/'.length)
    : null;
  if (trackingToken) return <Tracking token={trackingToken} />;
  const login = value => {
    localStorage.setItem(tokenKey, JSON.stringify(value));
    setSession(value);
    setError('');
  };
  const logout = () => {
    const activeSession = session;
    localStorage.removeItem(tokenKey);
    setSession(null);
    const endpoint = activeSession.user.role === 'courier' ? '/courier/logout' : '/auth/logout';
    void request(endpoint, { token: activeSession.token, method: 'POST' })
      .then(() => setError(''))
      .catch(() => setError('Signed out locally, but the server could not revoke this session. Its token remains valid until it expires.'));
  };
  return <>
    {error && <p className="toast" role="alert">{error}</p>}
    {session ? <Hub key={session.user.role} session={session} onLogout={logout} onError={setError} /> : <Login onLogin={login} onError={setError} />}
  </>;
}
