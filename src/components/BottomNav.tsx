import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Scale,
  Calendar,
  User,
  MessageCircle,
  Target,
} from 'lucide-react';
import { usePermisos } from '../hooks/usePermisos';
import { useChatNotifications } from '../context/ChatNotificationsContext';

/**
 * Bottom navigation bar — visible only on mobile (hidden on lg+).
 * Shows the 5 most-used sections. Safe area aware for iPhone notch/home indicator.
 */
export default function BottomNav() {
  const { permisos } = usePermisos();
  const navigate = useNavigate();
  const { unreadTotal } = useChatNotifications();

  const itemClass = (isActive: boolean) =>
    `flex flex-col items-center gap-0.5 flex-1 py-2 relative transition-colors duration-200 ${
      isActive ? 'text-emerald-400' : 'text-gray-500'
    }`;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden
                 bg-[#0c0c0e]/95 backdrop-blur-xl
                 border-t border-white/[0.06]
                 flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Dashboard */}
      {permisos.dashboard && (
        <NavLink to="/" end className={({ isActive }) => itemClass(isActive)}>
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] font-medium">Panel</span>
        </NavLink>
      )}

      {/* Casos generales */}
      {permisos.casos_generales && (
        <NavLink to="/casos-generales" className={({ isActive }) => itemClass(isActive)}>
          <Scale className="w-5 h-5" />
          <span className="text-[10px] font-medium">Casos</span>
        </NavLink>
      )}

      {/* Mi Día */}
      {permisos.mi_dia && (
        <NavLink to="/mi-dia" className={({ isActive }) => itemClass(isActive)}>
          <Target className="w-5 h-5" />
          <span className="text-[10px] font-medium">Mi Día</span>
        </NavLink>
      )}

      {/* Chat */}
      {permisos.chat && (
        <NavLink to="/chat" className={({ isActive }) => itemClass(isActive)}>
          <div className="relative">
            <MessageCircle className="w-5 h-5" />
            {unreadTotal > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-1 rounded-full
                               bg-emerald-500 text-black text-[9px] font-bold
                               flex items-center justify-center">
                {unreadTotal > 9 ? '9+' : unreadTotal}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium">Chat</span>
        </NavLink>
      )}

      {/* Calendario */}
      {permisos.calendario && (
        <NavLink to="/calendario" className={({ isActive }) => itemClass(isActive)}>
          <Calendar className="w-5 h-5" />
          <span className="text-[10px] font-medium">Agenda</span>
        </NavLink>
      )}

      {/* Perfil — siempre visible */}
      <button
        onClick={() => navigate('/perfil')}
        className={itemClass(false) + ' flex-col'}
      >
        <User className="w-5 h-5" />
        <span className="text-[10px] font-medium">Perfil</span>
      </button>
    </nav>
  );
}
