import { lazy, Suspense, useContext, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ComandaProvider } from './context/ComandaContext.jsx';
import { FormasPagamentoProvider } from './context/FormasPagamentoContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ConfiguracoesProvider } from './context/ConfiguracoesContext.jsx';
import { ToastProvider } from './components/Toast.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import AutorizacaoGerenteGlobal from './components/AutorizacaoGerenteGlobal.jsx';
import PrivateRoute from './components/PrivateRoute.jsx';
import RoleRoute from './components/RoleRoute.jsx';
import Layout from './components/Layout.jsx';
import { AuthContext } from './context/AuthContextDefinition.jsx';
import { useToast } from './components/useToast.js';
import { APP_VERSION, fetchPublishedAppVersion, waitForServiceWorkerUpdate } from './services/appVersion.js';
import { installNumberInputWheelGuard } from './utils/numberInputWheelGuard.js';
import './styles/delivery.css';
const Login = lazy(() => import('./pages/Login.jsx'));
const PDV = lazy(() => import('./pages/PDV.jsx'));
const Products = lazy(() => import('./pages/Products.jsx'));
const Customers = lazy(() => import('./pages/Customers.jsx'));
const ContasReceber = lazy(() => import('./pages/ContasReceber.jsx'));
const Auditoria = lazy(() => import('./pages/Auditoria.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));
const Comandas = lazy(() => import('./pages/Comandas.jsx'));
const MesasCadastro = lazy(() => import('./pages/MesasCadastro.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Production = lazy(() => import('./pages/Production.jsx'));
const Purchases = lazy(() => import('./pages/Purchases.jsx'));
const Kitchen = lazy(() => import('./pages/Kitchen.jsx'));
const Financeiro = lazy(() => import('./pages/Financeiro.jsx'));
const Caixa = lazy(() => import('./pages/Caixa.jsx'));
const ImpressoraManager = lazy(() => import('./components/Impressao/ImpressoraManager.jsx'));
const PaymentSettings = lazy(() => import('./pages/PaymentSettings.jsx'));
const ConfiguracoesPage = lazy(() => import('./pages/Configuracoes.jsx'));

const DeliveryEntry = lazy(() => import('./pages/DeliveryEntry.jsx'));
const DeliveryEntregador = lazy(() => import('./pages/DeliveryEntregador.jsx'));
const RastreioEntrega = lazy(() => import('./pages/RastreioEntrega.jsx'));

function AppVersionGuard() {
  const { showToast } = useToast();

  useEffect(() => {
    let active = true;
    let checking = false;

    const checkVersion = async () => {
      if (checking || navigator.onLine === false || document.visibilityState === 'hidden') return;
      checking = true;
      try {
        const publishedVersion = await fetchPublishedAppVersion();
        if (!active || publishedVersion === APP_VERSION) return;

        const reloadKey = `pdv:version-reload:${publishedVersion}`;
        try {
          if (sessionStorage.getItem(reloadKey) === '1') {
            showToast('Há uma nova versão disponível. Feche e reabra o aplicativo para tentar atualizar.', 'warning');
            return;
          }
          sessionStorage.setItem(reloadKey, '1');
        } catch {
          // A successful service-worker activation still reloads through the PWA runtime.
        }

        showToast('Nova versão encontrada. Atualizando o aplicativo…', 'info');
        try {
          if (!('serviceWorker' in navigator)) throw new Error('Este navegador não oferece suporte ao service worker.');
          const serviceWorker = navigator.serviceWorker;
          const registration = await serviceWorker.ready;
          await waitForServiceWorkerUpdate(registration, serviceWorker);
        } catch (error) {
          try {
            sessionStorage.removeItem(reloadKey);
          } catch {
            // Session storage can be unavailable in restricted browser modes.
          }
          console.error('[PWA] Não foi possível aplicar a nova versão.', error);
          if (active) showToast('A nova versão foi encontrada, mas não foi possível aplicá-la. Tente fechar e reabrir o aplicativo.', 'warning');
        }
      } catch (error) {
        console.warn('[PWA] Não foi possível validar a versão atual.', error);
        if (active) showToast('Não foi possível confirmar a versão atual. O acesso continuará com a versão disponível.', 'warning');
      } finally {
        checking = false;
      }
    };

    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') void checkVersion();
    };

    void checkVersion();
    window.addEventListener('online', checkVersion);
    document.addEventListener('visibilitychange', checkWhenVisible);
    return () => {
      active = false;
      window.removeEventListener('online', checkVersion);
      document.removeEventListener('visibilitychange', checkWhenVisible);
    };
  }, [showToast]);

  return null;
}

function DefaultLanding() {
  const { user } = useContext(AuthContext);
  return <Navigate to={user?.role === 'admin' ? '/dashboard' : '/pdv'} replace />;
}

export default function App() {
  useEffect(() => installNumberInputWheelGuard(document), []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <ConfiguracoesProvider>
          <ToastProvider>
            <ErrorBoundary>
              <AutorizacaoGerenteGlobal />
              <AppVersionGuard />
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
                        <Route path="/atendimento/mesas" element={<Navigate to="/comandas" replace />} />
                        <Route path="/comandas" element={<Comandas />} />
                        <Route path="/cadastro/mesas" element={<MesasCadastro />} />
                        <Route element={<RoleRoute roles={['admin', 'operador', 'cozinha']} />}>
                          <Route path="/cozinha" element={<Kitchen />} />
                        </Route>
                        <Route element={<RoleRoute roles={['admin']} />}>
                          <Route path="/produtos" element={<Products />} />
                          <Route path="/clientes" element={<Customers />} />
                          <Route path="/auditoria" element={<Auditoria />} />
                          <Route path="/contas-receber" element={<ContasReceber />} />
                          <Route path="/usuarios" element={<Users />} />
                          <Route path="/dashboard" element={<Dashboard />} />
                          <Route path="/producao" element={<Production />} />
                          <Route path="/compras" element={<Purchases />} />
                          <Route path="/financeiro" element={<Financeiro />} />
                          <Route path="/caixa" element={<Caixa />} />
                          <Route path="/ajustes/impressoras" element={<ImpressoraManager />} />
                          <Route path="/configuracoes" element={<ConfiguracoesPage />} />
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
            </ErrorBoundary>
          </ToastProvider>
        </ConfiguracoesProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
