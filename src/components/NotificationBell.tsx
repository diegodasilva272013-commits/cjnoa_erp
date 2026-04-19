import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, AlertTriangle, Receipt, Wallet, UserPlus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Notification {
  id: string;
  icon: React.ReactNode;
  color: string;
  message: string;
  count: number;
}

interface NotifStats {
  cuotasVencidas: number;
  sinPagarConsulta: number;
  casosFondosBajos: number;
  nuevosClientes7d: number;
}

function useNotificationStats() {
  const [stats, setStats] = useState<NotifStats>({ cuotasVencidas: 0, sinPagarConsulta: 0, casosFondosBajos: 0, nuevosClientes7d: 0 });

  const fetch = useCallback(async () => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const today = new Date().toISOString().split('T')[0];

      const [cuotasRes, casosRes, movRes] = await Promise.all([
        supabase.from('cuotas').select('id').eq('estado', 'Pendiente').lt('fecha', today),
        supabase.from('casos_completos').select('id, modalidad_pago, pago_unico_pagado, created_at'),
        supabase.from('movimientos_caso').select('caso_id, tipo, monto, moneda'),
      ]);

      const casos = casosRes.data || [];
      const movimientos = movRes.data || [];

      const fondosPorCaso: Record<string, Record<string, { depositos: number; gastos: number }>> = {};
      movimientos.forEach((m: any) => {
        const cur = m.moneda || 'ARS';
        if (!fondosPorCaso[m.caso_id]) fondosPorCaso[m.caso_id] = {};
        if (!fondosPorCaso[m.caso_id][cur]) fondosPorCaso[m.caso_id][cur] = { depositos: 0, gastos: 0 };
        if (m.tipo === 'deposito') fondosPorCaso[m.caso_id][cur].depositos += Number(m.monto);
        else fondosPorCaso[m.caso_id][cur].gastos += Number(m.monto);
      });

      setStats({
        cuotasVencidas: cuotasRes.data?.length || 0,
        sinPagarConsulta: casos.filter((c: any) => c.modalidad_pago === 'Único' && c.pago_unico_pagado === false).length,
        casosFondosBajos: Object.values(fondosPorCaso).filter(currencies =>
          Object.values(currencies).some(f => f.depositos > 0 && (f.gastos / f.depositos) >= 0.8)
        ).length,
        nuevosClientes7d: casos.filter((c: any) => c.created_at >= sevenDaysAgo).length,
      });
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, 60_000); // refresh every minute
    return () => clearInterval(id);
  }, [fetch]);

  return stats;
}

export default function NotificationBell() {
  const stats = useNotificationStats();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const notifications: Notification[] = [
    stats.cuotasVencidas > 0 && {
      id: 'cuotas',
      icon: <AlertTriangle className="w-4 h-4" />,
      color: 'text-red-400 bg-red-500/10',
      message: `${stats.cuotasVencidas} cuota${stats.cuotasVencidas > 1 ? 's' : ''} vencida${stats.cuotasVencidas > 1 ? 's' : ''}`,
      count: stats.cuotasVencidas,
    },
    stats.sinPagarConsulta > 0 && {
      id: 'sinpagar',
      icon: <Receipt className="w-4 h-4" />,
      color: 'text-yellow-400 bg-yellow-500/10',
      message: `${stats.sinPagarConsulta} caso${stats.sinPagarConsulta > 1 ? 's' : ''} sin pagar consulta`,
      count: stats.sinPagarConsulta,
    },
    stats.casosFondosBajos > 0 && {
      id: 'fondos',
      icon: <Wallet className="w-4 h-4" />,
      color: 'text-orange-400 bg-orange-500/10',
      message: `${stats.casosFondosBajos} caso${stats.casosFondosBajos > 1 ? 's' : ''} con fondos bajos`,
      count: stats.casosFondosBajos,
    },
    stats.nuevosClientes7d > 0 && {
      id: 'nuevos',
      icon: <UserPlus className="w-4 h-4" />,
      color: 'text-blue-400 bg-blue-500/10',
      message: `${stats.nuevosClientes7d} cliente${stats.nuevosClientes7d > 1 ? 's' : ''} nuevo${stats.nuevosClientes7d > 1 ? 's' : ''} (7d)`,
      count: stats.nuevosClientes7d,
    },
  ].filter(Boolean) as Notification[];

  const totalCount = notifications.reduce((s, n) => s + n.count, 0);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2.5 text-gray-500 hover:text-white rounded-xl hover:bg-white/5 transition-all duration-200"
        title="Notificaciones"
      >
        <Bell className="w-4 h-4" />
        {totalCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 animate-scale-in">
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl border border-white/[0.06] bg-[#141418] shadow-2xl shadow-black/50 animate-slide-down z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <h3 className="text-sm font-semibold text-white">Notificaciones</h3>
            <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="max-h-[320px] overflow-y-auto py-1">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">Sin notificaciones pendientes</p>
            ) : (
              notifications.map(n => {
                const [textColor, bgColor] = n.color.split(' ');
                return (
                  <div key={n.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors">
                    <div className={`p-2 rounded-lg ${bgColor} flex-shrink-0`}>
                      <span className={textColor}>{n.icon}</span>
                    </div>
                    <p className="text-sm text-gray-300 flex-1">{n.message}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
