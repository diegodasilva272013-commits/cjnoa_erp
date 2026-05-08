import { useEffect, useState } from 'react';
import { Clock, ArrowUpRight, ArrowDownRight, FolderPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { usePerfilMap } from '../hooks/usePerfiles';

interface Activity {
  id: string;
  type: 'ingreso' | 'egreso' | 'caso';
  description: string;
  user: string;
  time: string;
  amount?: number;
}

export default function ActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const perfilMap = usePerfilMap();

  useEffect(() => {
    async function load() {
      const [ingRes, egrRes, casRes] = await Promise.all([
        supabase.from('ingresos_operativos').select('id, cliente_nombre, concepto, monto, created_at, created_by').order('created_at', { ascending: false }).limit(5),
        supabase.from('egresos_v2').select('id, concepto, monto, created_at, created_by').order('created_at', { ascending: false }).limit(5),
        supabase.from('casos_completos').select('id, nombre_apellido, materia, created_at').order('created_at', { ascending: false }).limit(5),
      ]);

      const items: Activity[] = [];

      (ingRes.data || []).forEach((i: any) => items.push({
        id: `i-${i.id}`,
        type: 'ingreso',
        description: `Ingreso registrado: ${i.cliente_nombre || i.concepto}`,
        user: i.created_by || '',
        time: i.created_at,
        amount: i.monto,
      }));

      (egrRes.data || []).forEach((e: any) => items.push({
        id: `e-${e.id}`,
        type: 'egreso',
        description: `Egreso registrado: ${e.concepto}`,
        user: e.created_by || '',
        time: e.created_at,
        amount: e.monto,
      }));

      (casRes.data || []).forEach((c: any) => items.push({
        id: `c-${c.id}`,
        type: 'caso',
        description: `Nuevo caso: ${c.nombre_apellido} (${c.materia})`,
        user: '',
        time: c.created_at,
      }));

      items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setActivities(items.slice(0, 8));
      setLoading(false);
    }
    load();
  }, []);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Justo ahora';
    if (diffMin < 60) return `Hace ${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `Hace ${diffHr}h`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `Hace ${diffDays}d`;
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  };

  const icons = {
    ingreso: <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />,
    egreso: <ArrowDownRight className="w-3.5 h-3.5 text-red-400" />,
    caso: <FolderPlus className="w-3.5 h-3.5 text-blue-400" />,
  };

  const dotColors = {
    ingreso: 'bg-emerald-500',
    egreso: 'bg-red-500',
    caso: 'bg-blue-500',
  };

  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-white/60" />
          <h3 className="text-sm font-semibold text-white">Actividad Reciente</h3>
        </div>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-10 bg-white/5 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-white/60" />
        <h3 className="text-sm font-semibold text-white">Actividad Reciente</h3>
      </div>

      {activities.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">Sin actividad reciente</p>
      ) : (
        <div className="relative space-y-0">
          {/* Timeline line */}
          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-white/[0.06]" />

          {activities.map((a, i) => {
            const userName = a.user ? (perfilMap.get(a.user) || '') : '';
            return (
              <div
                key={a.id}
                className="relative flex items-start gap-3 py-2.5 animate-slide-right"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className={`relative z-10 w-[22px] h-[22px] rounded-full flex items-center justify-center bg-[#141418] border border-white/[0.06]`}>
                  <div className={`w-2 h-2 rounded-full ${dotColors[a.type]}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300 truncate">{a.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {userName && <span className="text-[10px] text-violet-400">{userName}</span>}
                    <span className="text-[10px] text-gray-600">{formatTime(a.time)}</span>
                    {a.amount != null && (
                      <span className={`text-[10px] font-medium ${a.type === 'ingreso' ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${Number(a.amount).toLocaleString('es-AR')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
