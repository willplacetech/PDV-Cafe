import { useCallback, useContext, useEffect, useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import { ThemeContext } from '../context/ThemeContextDefinition.js';
import StatusConexao from './StatusConexao.jsx';
import api from '../services/api.jsx';
import { APP_GIT_HASH } from '../services/appVersion.js';
import NovidadesModal from './NovidadesModal.jsx';

const gruposMenu = [
  {
    chave: 'atendimento',
    label: '🏪 ATENDIMENTO',
    items: [
      { label: 'PDV · Nova venda', icon: '🛒', to: '/pdv' },
      { label: 'Entregas', icon: '🛵', to: '/entregas', roles: ['admin', 'operador'], badge: true },
      { label: 'Mesas / Comandas', icon: '🪑', to: '/comandas', badge: 'comandas' },
      { label: 'A Receber', icon: '💰', to: '/contas-receber', admin: true },
    ],
  },
  {
    chave: 'cadastro',
    label: '📦 CADASTRO',
    items: [
      { label: 'Produtos', icon: '📦', to: '/produtos', roles: ['admin', 'gerente'] },
      { label: 'Mesas', icon: '🪑', to: '/cadastro/mesas', admin: true },
    ],
  },
  {
    chave: 'compras',
    label: '🧾 COMPRAS',
    items: [
      { label: 'Lançar Entrada', icon: '🧾', to: '/compras', admin: true },
      { label: 'Histórico de Compras', icon: '📚', to: '/compras', admin: true },
    ],
  },
  {
    chave: 'producao',
    label: '🧪 PRODUÇÃO',
    items: [
      { label: 'Estoque de Insumos', icon: '📦', to: '/producao', roles: ['admin', 'gerente'] },
      { label: 'Lançar Produção', icon: '🔄', to: '/producao', admin: true },
      { label: 'Histórico de Movimentação', icon: '📜', to: '/producao', admin: true },
      { label: 'Cozinha', icon: '🍳', to: '/cozinha', roles: ['admin', 'operador', 'cozinha'] },
    ],
  },
  {
    chave: 'financeiro',
    label: '💰 GESTÃO',
    items: [
      { label: 'Dashboard', icon: '📊', to: '/dashboard', admin: true },
      { label: 'Fechamento de Caixa', icon: '💵', to: '/caixa', roles: ['admin', 'gerente'] },
      { label: 'DRE / Demonstrativo', icon: '📈', to: '/financeiro', admin: true },
      { label: 'Auditoria', icon: '🧾', to: '/auditoria', admin: true },
    ],
  },
  {
    chave: 'pessoas',
    label: '👥 PESSOAS',
    items: [
      { label: 'Clientes', icon: '👤', to: '/clientes', roles: ['admin', 'gerente'] },
      { label: 'Usuários', icon: '👥', to: '/usuarios', admin: true },
    ],
  },
  {
    chave: 'configuracoes',
    label: '⚙️ CONFIGURAÇÕES',
    items: [
      { label: 'Autorização de gerente', icon: '🔐', to: '/configuracoes', admin: true },
      { label: 'Impressoras', icon: '🖨️', to: '/ajustes/impressoras', admin: true },
      { label: 'Pagamentos', icon: '💳', to: '/configuracoes/pagamentos', admin: true },
    ],
  },
];
