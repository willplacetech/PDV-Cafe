import { useContext } from 'react';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import Layout from '../components/Layout.jsx';
import DeliveryAdmin from './DeliveryAdmin.jsx';
import Entregas from './Entregas.jsx';

export default function DeliveryEntry() {
  const { user, loading } = useContext(AuthContext);
  if (loading) return null;

  if (user && ['admin', 'operador'].includes(user.role) && user.tenantId) {
    return <Layout><Entregas /></Layout>;
  }

  return <DeliveryAdmin />;
}
