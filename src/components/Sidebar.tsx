import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  DollarSign,
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  Shield,
  Calendar,
  X,
  User,
  FileText,
  ListTodo,
  PieChart,
  UserCheck,
  Activity,
  Gavel,
  Wallet,
  Clock,
} from 'lucide-react';
import { usePermisos } from '../hooks/usePermisos';
import { useAuth } from '../context/AuthContext';
import { useAvatarUrl } from '../hooks/useAvatarUrl';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { permisos } = usePermisos();
  const { perfil } = useAuth();
  const avatarUrl = useAvatarUrl(perfil?.avatar_url);

  const linkClass = (isActive: boolean) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
      isActive
        ? 'bg-white/[0.08] text-white border border-white/10 nav-active-glow'
        : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.04] hover:translate-x-1'
    }`;

  const isFinanzasActive = ['/ingresos', '/egresos', '/flujo-caja'].includes(location.pathname);
  const isPrevisionalActive = location.pathname.startsWith('/previsional');

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-screen w-[260px] bg-[#0c0c0e]/95 backdrop-blur-xl 
                    border-r border-white/[0.06] flex flex-col transition-transform duration-300 
                    lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <img
              src="/Logo NOA.jpeg"
              alt="CJ NOA"
              className="w-9 h-9 rounded-lg object-cover border border-white/10 animate-scale-in hover:scale-110 transition-transform duration-300"
            />
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">CJ NOA</h2>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest">Gestión</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {/* Panel de Control - visible para admin y socio */}
          {permisos.dashboard && (
            <NavLink to="/" onClick={onClose} className={({ isActive }) => linkClass(isActive)}>
              <LayoutDashboard className="w-5 h-5" />
              Panel de Control
            </NavLink>
          )}

          {/* Casos - visible para todos */}
          <NavLink to="/casos" onClick={onClose} className={({ isActive }) => linkClass(isActive)}>
            <Users className="w-5 h-5" />
            Casos
          </NavLink>

          {/* Tareas (spec seccion 5) - visible para todos */}
          <NavLink to="/tareas" onClick={onClose} className={({ isActive }) => linkClass(isActive)}>
            <ListTodo className="w-5 h-5" />
            Tareas
          </NavLink>

          {/* Audiencias (spec seccion 6) - visible para todos */}
          <NavLink to="/audiencias" onClick={onClose} className={({ isActive }) => linkClass(isActive)}>
            <Gavel className="w-5 h-5" />
            Audiencias
          </NavLink>

          {/* Cargos de Hora - visible para todos */}
          <NavLink to="/cargos-hora" onClick={onClose} className={({ isActive }) => linkClass(isActive)}>
            <Clock className="w-5 h-5" />
            Cargos de Hora
          </NavLink>

          {/* Honorarios y Cobros (spec seccion 8) - oculto a procurador */}
          {permisos.honorarios && (
            <NavLink to="/honorarios" onClick={onClose} className={({ isActive }) => linkClass(isActive)}>
              <Wallet className="w-5 h-5" />
              Honorarios y Cobros
            </NavLink>
          )}

          {/* Finanzas - visible para admin y socio */}
          {permisos.finanzas && (
            <div className="space-y-1">
              <div className="flex items-center gap-3 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4">
                <DollarSign className="w-4 h-4" />
                Finanzas
              </div>
              <NavLink to="/ingresos" onClick={onClose} className={({ isActive }) => `${linkClass(isActive)} pl-12`}>
                <ArrowDownCircle className="w-4 h-4" />
                Ingresos
              </NavLink>
              <NavLink to="/egresos" onClick={onClose} className={({ isActive }) => `${linkClass(isActive)} pl-12`}>
                <ArrowUpCircle className="w-4 h-4" />
                Egresos
              </NavLink>
              <NavLink to="/flujo-caja" onClick={onClose} className={({ isActive }) => `${linkClass(isActive)} pl-12`}>
                <BarChart3 className="w-4 h-4" />
                Flujo de Caja
              </NavLink>
            </div>
          )}

          {/* Equipo - solo admin */}
          {permisos.equipo && (
            <NavLink to="/equipo" onClick={onClose} className={({ isActive }) => linkClass(isActive)}>
              <Shield className="w-5 h-5" />
              Equipo
            </NavLink>
          )}

          {/* Previsional */}
          {permisos.previsional && (
            <div className="space-y-1">
              <div className="flex items-center gap-3 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4">
                <FileText className="w-4 h-4" />
                Previsional
              </div>
              <NavLink to="/previsional/fichas" onClick={onClose} className={({ isActive }) => `${linkClass(isActive)} pl-12`}>
                <Users className="w-4 h-4" />
                Fichas Clientes
              </NavLink>
              <NavLink to="/previsional/seguimiento" onClick={onClose} className={({ isActive }) => `${linkClass(isActive)} pl-12`}>
                <ListTodo className="w-4 h-4" />
                Seguimiento
              </NavLink>
              <NavLink to="/previsional/dashboard" onClick={onClose} className={({ isActive }) => `${linkClass(isActive)} pl-12`}>
                <PieChart className="w-4 h-4" />
                Dashboard
              </NavLink>
              <NavLink to="/previsional/mi-panel" onClick={onClose} className={({ isActive }) => `${linkClass(isActive)} pl-12`}>
                <UserCheck className="w-4 h-4" />
                Mi Panel
              </NavLink>
            </div>
          )}

          {/* Agenda */}
          {permisos.agenda && (
            <NavLink to="/agenda" onClick={onClose} className={({ isActive }) => linkClass(isActive)}>
              <Calendar className="w-5 h-5" />
              Agenda
            </NavLink>
          )}

          {/* Timeline */}
          <NavLink to="/timeline" onClick={onClose} className={({ isActive }) => linkClass(isActive)}>
            <Activity className="w-5 h-5" />
            Timeline
          </NavLink>
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/[0.06]">
          <button
            onClick={() => { navigate('/perfil'); onClose(); }}
            className="w-full flex items-center gap-3 rounded-xl p-1.5 hover:bg-white/[0.04] transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
              {perfil?.avatar_url && avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center">
                  <User className="w-4 h-4 text-gray-300" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white truncate">{perfil?.nombre || 'Usuario'}</p>
              <p className="text-[10px] text-gray-600">Ver perfil · v1.0</p>
            </div>
          </button>
        </div>
      </aside>
    </>
  );
}
