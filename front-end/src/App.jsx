import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ToastProvider } from './components/Toast.jsx';
import PrivateRoute from './components/PrivateRoute.jsx';
import RoleRoute from './components/RoleRoute.jsx';
import Layout from './components/Layout.jsx';
const Login = lazy(() => import('./pages/Login.jsx'));
const PDV = lazy(() => import('./pages/PDV.jsx'));
const Products = lazy(() => import('./pages/Products.jsx'));
const Customers = lazy(() => import('./pages/Customers.jsx'));
const ContasReceber = lazy(() => import('./pages/ContasReceber'));
const Users = lazy(() => import('./pages/Users'));
const Comandas = lazy(() => import('./pages/Comandas.jsx'));
const MesasCadastro = lazy(() => import('./pages/MesasCadastro.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Production = lazy(() => import('./pages/Production.jsx'));
const Purchases = lazy(() => import('./pages/Purchases.jsx'));
const Kitchen = lazy(() => import('./pages/Kitchen.jsx'));
const Financeiro = lazy(() => import('./pages/Financeiro.jsx'));
const Caixa = lazy(() => import('./pages/Caixa.jsx'));
const ImpressoraManager = lazy(() => import('./components/Impressao/ImpressoraManager.jsx'));


const DeliveryAdmin = lazy(() => import('./pages/DeliveryAdmin.jsx'));
const DeliveryPlataforma = lazy(() => import('./pages/DeliveryPlataforma.jsx'));
const DeliveryEntregador = lazy(() => import('./pages/DeliveryEntregador.jsx'));
const RastreioEntrega = lazy(() => import('./pages/RastreioEntrega.jsx'));

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <Router>
            <Suspense fallback={<p role="status" style={{ padding: 24 }}>Carregando…</p>}>
            <Routes>
              <Route path="/admin" element={<DeliveryAdmin />} />
              <Route path="/plataforma" element={<DeliveryPlataforma />} />
              <Route path="/entregador" element={<DeliveryEntregador />} />
              <Route path="/pedido/:token" element={<RastreioEntrega />} />
              <Route path="/login" element={<Login />} />
              <Route element={<PrivateRoute />}>
                <Route element={<Layout />}>
                  <Route path="/pdv" element={<PDV />} />
                  <Route path="/atendimento/mesas" element={<Comandas />} />
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
                  </Route>
                  <Route element={<RoleRoute roles={['admin', 'cozinha']} />}>
                    <Route path="/producao/fichas" element={<Navigate to="/producao?tab=fichas" replace />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/pdv" />} />
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
