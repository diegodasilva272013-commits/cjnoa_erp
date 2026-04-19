import { useAuth } from '../context/AuthContext';
import { PERMISOS_DEFAULT, Rol, PermisosUsuario } from '../types/database';

export function usePermisos() {
  const { perfil } = useAuth();
  const rol: Rol = (perfil?.rol as Rol) || 'empleado';

  // Si el usuario tiene permisos personalizados en la DB, usarlos.
  // Si no, usar los defaults del rol.
  const permisos: PermisosUsuario = perfil?.permisos
    ? { ...PERMISOS_DEFAULT[rol], ...perfil.permisos }
    : PERMISOS_DEFAULT[rol];

  return {
    rol,
    permisos,
    isAdmin: rol === 'admin',
    canSee: (modulo: keyof PermisosUsuario) => permisos[modulo],
  };
}
