import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ToastProvider } from './components/Toast.jsx';
import PrivateRoute from './components/PrivateRoute.jsx';
import RoleRoute from './components/RoleRoute.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import PDV from './pages/PDV.jsx';
import Products from './pages/Products.jsx';
import Customers from './pages/Customers.jsx';
import ContasReceber from './pages/ContasReceber';
import Users from './pages/Users';
import Comandas from './pages/Comandas.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Production from './pages/Production.jsx';
import Kitchen from './pages/Kitchen.jsx';
import Financeiro from './pages/Financeiro.jsx';


export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<PrivateRoute />}>
                <Route element={<Layout />}>
                  <Route path="/pdv" element={<PDV />} />
                  <Route path="/comandas" element={<Comandas />} />
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
                    <Route path="/financeiro" element={<Financeiro />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/pdv" />} />
                </Route>
              </Route>
            </Routes>
          </Router>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
