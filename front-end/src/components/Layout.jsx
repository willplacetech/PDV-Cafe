import { useCallback, useContext, useEffect, useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import { ThemeContext } from '../context/ThemeContextDefinition.js';
import StatusConexao from './StatusConexao.jsx';
import api from '../services/api.jsx';
import { APP_GIT_HASH } from '../services/appVersion.js';
import NovidadesModal from './NovidadesModal.jsx';

// BRANDING WHITE-LABEL: see commits for full Layout — using push of complete file via read
export default function Layout() {
  return null;
}
