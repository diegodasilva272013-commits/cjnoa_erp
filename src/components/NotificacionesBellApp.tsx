import { useState, useEffect, useRef } from 'react';
import { Inbox, X, Check, ListTodo, Eye, MessageSquare, ExternalLink, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotificacionesApp, NotificacionApp } from '../hooks/useNotificacionesApp';

function fmt(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

function iconFor(tipo: NotificacionApp['tipo']) {
  switch (tipo) {
    case 'tarea_asignada': return <ListTodo className="w-4 h-4 text-violet-400" />;
    case 'tarea_vista':    return <Eye className="w-4 h-4 text-emerald-400" />;
    case 'tarea_estado':   return <Check className="w-4 h-4 text-cyan-400" />;
    case 'nota_caso':      return <MessageSquare className="w-4 h-4 text-blue-400" />;
    default:               return <Inbox className="w-4 h-4 text-gray-400" />;
  }
}

export default function NotificacionesBellApp() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { items, unreadCount, marcarLeida, marcarTodasLeidas, eliminar } = useNotificacionesApp(user?.id || null);
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const lastCountRef = useRef(unreadCount);
  const dropRef = useRef<HTMLDivElement | null>(null);

  // Pulse when new unread arrives
  useEffect(() => {
    if (unreadCount > lastCountRef.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1200);
      return () => clearTimeout(t);
    }
    lastCountRef.current = unreadCount;
  }, [unreadCount]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleClick(n: NotificacionApp) {
    if (!n.leida) marcarLeida(n.id);
    if (n.link) {
      // Internal route only (avoid full page reloads for unknown URLs)
      if (n.link.startsWith('/')) {
        navigate(n.link);
        setOpen(false);
      }
    }
  }

  return (
    <div className="relative" ref={dropRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
          open ? 'bg-violet-500/15 text-violet-300' : 'text-gray-400 hover:bg-white/5 hover:text-white'
        } ${pulse ? 'animate-pulse' : ''}`}
        title="Mensajes"
      >
        <Inbox className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-violet-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-[#0a0a0a]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[380px] max-w-[95vw] rounded-2xl bg-[#0e0e12] border border-white/10 shadow-2xl shadow-black/50 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Inbox className="w-4 h-4 text-violet-400" />
              Mensajes
              {unreadCount > 0 && <span className="text-[10px] font-normal text-violet-300">({unreadCount} sin leer)</span>}
            </h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={marcarTodasLeidas}
                  className="text-[11px] text-gray-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 flex items-center gap-1"
                  title="Marcar todas como leídas"
                >
                  <CheckCheck className="w-3 h-3" /> Todas
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Inbox className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500">Sin mensajes por ahora</p>
              </div>
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {items.map(n => (
                  <li key={n.id}
                    className={`group px-4 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer ${
                      !n.leida ? 'bg-violet-500/[0.04]' : ''
                    }`}
                    onClick={() => handleClick(n)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">{iconFor(n.tipo)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm truncate ${!n.leida ? 'font-semibold text-white' : 'text-gray-300'}`}>
                            {n.titulo}
                          </p>
                          {!n.leida && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />}
                        </div>
                        {n.mensaje && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.mensaje}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-gray-600">hace {fmt(n.created_at)}</span>
                          {n.link && <ExternalLink className="w-3 h-3 text-gray-600" />}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); eliminar(n.id); }}
                        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 p-1 transition"
                        title="Eliminar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
