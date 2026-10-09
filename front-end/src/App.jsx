import { lazy, Suspense, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ComandaProvider } from './context/ComandaContext.jsx';
import { FormasPagamentoProvider } from './context/FormasPagamentoContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ToastProvider } from './components/Toast.jsx';
import PrivateRoute from './components/PrivateRoute.jsx';
import RoleRoute from './components/RoleRoute.jsx';
import Layout from './components/Layout.jsx';
import { AuthContext } from './context/AuthContextDefinition.jsx';
const Login = lazy(() => import('./pages/Login.jsx'));
const PDV = lazy(() => import('./pages/PDV.jsx'));
const Products = lazy(() => import('./pages/Products.jsx'));
const Customers = lazy(() => import('./pages/Customers.jsx'));
const ContasReceber = lazy(() => import('./pages/ContasReceber'));
const Users = lazy(() => import('./pages/Users'));
const Mesas = lazy(() => import('./pages/Mesas.jsx'));
const MesasCadastro = lazy(() => import('./pages/MesasCadastro.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Production = lazy(() => import('./pages/Production.jsx'));
const Purchases = lazy(() => import('./pages/Purchases.jsx'));
const Kitchen = lazy(() => import('./pages/Kitchen.jsx'));
const Financeiro = lazy(() => import('./pages/Financeiro.jsx'));
const Caixa = lazy(() => import('./pages/Caixa.jsx'));
const ImpressoraManager = lazy(() => import('./components/Impressao/ImpressoraManager.jsx'));
const PaymentSettings = lazy(() => import('./pages/PaymentSettings.jsx'));


const DeliveryEntry = lazy(() => import('./pages/DeliveryEntry.jsx'));
const DeliveryEntregador = lazy(() => import('./pages/DeliveryEntregador.jsx'));
const RastreioEntrega = lazy(() => import('./pages/RastreioEntrega.jsx'));

function DefaultLanding() {
  const { user } = useContext(AuthContext);
  return <Navigate to={user?.role === 'admin' ? '/dashboard' : '/pdv'} replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <Router>
            <Suspense fallback={<p role="status" style={{ padding: 24 }}>Carregando…</p>}>
            <Routes>
              <Route path="/DeliveryAdmin" element={<Navigate to="/entregas" replace />} />
              <Route path="/entregas" element={<DeliveryEntry />} />
              <Route path="/admin" element={<Navigate to="/entregas" replace />} />
              <Route path="/plataforma" element={<Navigate to="/entregas" replace />} />
              <Route path="/entregador" element={<DeliveryEntregador />} />
              <Route path="/pedido/:token" element={<RastreioEntrega />} />
              <Route path="/login" element={<Login />} />
              <Route element={<PrivateRoute />}>
                <Route element={<FormasPagamentoProvider><ComandaProvider><Layout /></ComandaProvider></FormasPagamentoProvider>}>
                  <Route path="/pdv" element={<PDV />} />
                  <Route path="/atendimento/mesas" element={<Mesas />} />
                  <Route path="/comandas" element={<Navigate to="/atendimento/mesas" replace />} />
                  <Route path="/cadastro/mesas" element={<MesasCadastro />} />
                  <Route element={<RoleRoute roles={['admin', 'operador', 'cozinha']} />}>
                    <Route path="/cozinha" element={<Kitchen />} />
                  </Route>
                  <Route element={<RoleRoute roles={['admin']} />}>
                    <Route path="/produtos" element={<Products />} />
                    <Route path="/clientes" element={<Customers />} />
                    <Route path="/pedidos" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/contas-receber" element={<ContasReceber />} />
                    <Route path="/usuarios" element={<Users />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/producao" element={<Production />} />
                    <Route path="/compras" element={<Purchases />} />
                    <Route path="/financeiro" element={<Financeiro />} />
                    <Route path="/caixa" element={<Caixa />} />
                    <Route path="/ajustes/impressoras" element={<ImpressoraManager />} />
                    <Route path="/configuracoes/pagamentos" element={<PaymentSettings />} />
                  </Route>
                  <Route element={<RoleRoute roles={['admin', 'cozinha']} />}>
                    <Route path="/producao/fichas" element={<Navigate to="/producao?tab=fichas" replace />} />
                  </Route>
                  <Route path="*" element={<DefaultLanding />} />
                </Route>
              </Route>
            </Routes>
            </Suspense>
          </Router>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
