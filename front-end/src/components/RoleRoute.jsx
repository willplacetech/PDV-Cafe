import { useContext } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextDefinition.jsx';

export default function RoleRoute({ roles }) {
  const { user } = useContext(AuthContext);
  return roles.includes(user?.role) ? <Outlet /> : <Navigate to="/pdv" replace />;
}
