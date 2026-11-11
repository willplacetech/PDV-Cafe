import { useContext } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextDefinition.jsx';
import { getHomePath } from '../permissions/roleAccess.js';

export default function RoleRoute({ roles }) {
  const { user } = useContext(AuthContext);
  return roles.includes(user?.role) ? <Outlet /> : <Navigate to={getHomePath(user?.role)} replace />;
}
