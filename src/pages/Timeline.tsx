import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Briefcase, DollarSign, ArrowDownCircle, CalendarDays, FileText, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface TimelineEvent {
  id: string;
  tipo: 'caso' | 'ingreso' | 'egreso' | 'audiencia' | 'tarea';
  titulo: string;
  subtitulo: string;
  fecha: string;
}

const TIPO_CONFIG = {
  caso:      { icon: Briefcase,       color: 'text-blue-400',    bg: 'bg-blue-500/10',    label: 'Caso' },
  ingreso:   { icon: DollarSign,      color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Ingreso' },
  egreso:    { icon: ArrowDownCircle, color: 'text-red-400',     bg: 'bg-red-500/10',     label: 'Egreso' },
  audiencia: { icon: CalendarDays,    color: 'text-amber-400',   bg: 'bg-amber-500/10',   label: 'Audiencia' },
  tarea:     { icon: FileText,        color: 'text-violet-400',  bg: 'bg-violet-500/10',  label: 'Tarea' },
};

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

export default function Timeline() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TimelineEvent['tipo'] | 'todos'>('todos');

  async function fetchEvents() {
    setLoading(true);
    try {
      const [casosRes, ingresosRes, egresosRes, audienciasRes, tareasRes] = await Promise.all([
        supabase.from('casos_completos').select('id,nombre_apellido,materia,estado,created_at').order('created_at', { ascending: false }).limit(20),
        supabase.from('ingresos').select('id,cliente_nombre,concepto,monto_cj_noa,created_at').order('created_at', { ascending: false }).limit(20),
        supabase.from('egresos').select('id,concepto,concepto_detalle,monto,created_at').order('created_at', { ascending: false }).limit(20),
        supabase.from('audiencias').select('id,tipo,fecha,hora,juzgado,notas,created_at').order('created_at', { ascending: false }).limit(20),
        supabase.from('tareas_previsional').select('id,titulo,estado,prioridad,created_at').order('created_at', { ascending: false }).limit(20),
      ]);

      const all: TimelineEvent[] = [
        ...(casosRes.data || []).map((c: any) => ({
          id: `caso-${c.id}`,
          tipo: 'caso' as const,
          titulo: c.nombre_apellido,
          subtitulo: `${c.materia} · ${c.estado}`,
          fecha: c.created_at,
        })),
        ...(ingresosRes.data || []).map((i: any) => ({
          id: `ingreso-${i.id}`,
          tipo: 'ingreso' as const,
          titulo: i.cliente_nombre || i.concepto || 'Ingreso',
          subtitulo: `${i.concepto || ''} · ${fmt(i.monto_cj_noa || 0)}`,
          fecha: i.created_at,
        })),
        ...(egresosRes.data || []).map((e: any) => ({
          id: `egreso-${e.id}`,
          tipo: 'egreso' as const,
          titulo: e.concepto,
          subtitulo: `${e.concepto_detalle || ''} · ${fmt(e.monto || 0)}`,
          fecha: e.created_at,
        })),
        ...(audienciasRes.data || []).map((a: any) => ({
          id: `audiencia-${a.id}`,
          tipo: 'audiencia' as const,
          titulo: a.tipo || 'Audiencia',
          subtitulo: [a.juzgado, a.hora, a.notas].filter(Boolean).join(' · ') || a.fecha || '',
          fecha: a.created_at,
        })),
        ...(tareasRes.data || []).map((t: any) => ({
          id: `tarea-${t.id}`,
          tipo: 'tarea' as const,
          titulo: t.titulo || 'Tarea',
          subtitulo: `${t.prioridad} · ${t.estado}`,
          fecha: t.created_at,
        })),
      ];

      all.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      setEvents(all);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchEvents(); }, []);

  const filtered = filter === 'todos' ? events : events.filter(e => e.tipo === filter);

  const FILTERS: { key: TimelineEvent['tipo'] | 'todos'; label: string }[] = [
    { key: 'todos', label: 'Todo' },
    { key: 'caso', label: 'Casos' },
    { key: 'ingreso', label: 'Ingresos' },
    { key: 'egreso', label: 'Egresos' },
    { key: 'audiencia', label: 'Audiencias' },
    { key: 'tarea', label: 'Tareas' },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Timeline del estudio</h1>
          <p className="text-sm text-gray-500 mt-1">Actividad reciente de todos los módulos</p>
        </div>
        <button onClick={fetchEvents} disabled={loading} className="p-2 text-gray-500 hover:text-white transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              filter === f.key
                ? 'bg-white/10 text-white border border-white/20'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-gray-500 py-16">Sin actividad reciente</p>
      ) : (
        <div className="space-y-0 relative">
          <div className="absolute left-6 top-0 bottom-0 w-px bg-white/[0.06]" />
          {filtered.map((event, idx) => {
            const cfg = TIPO_CONFIG[event.tipo];
            const Icon = cfg.icon;
            return (
              <div key={event.id} className="flex gap-4 relative animate-fade-in" style={{ animationDelay: `${idx * 20}ms` }}>
                <div className={`w-12 h-12 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0 z-10 my-1`}>
                  <Icon className={`w-5 h-5 ${cfg.color}`} />
                </div>
                <div className="glass-card flex-1 p-4 mb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className={`text-[10px] font-semibold uppercase tracking-wide ${cfg.color}`}>{cfg.label}</span>
                      <p className="text-sm font-medium text-white mt-0.5 truncate">{event.titulo}</p>
                      {event.subtitulo && <p className="text-xs text-gray-500 mt-0.5 truncate">{event.subtitulo}</p>}
                    </div>
                    <span className="text-[10px] text-gray-600 flex-shrink-0">
                      {formatDistanceToNow(new Date(event.fecha), { addSuffix: true, locale: es })}
                    </span>
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
