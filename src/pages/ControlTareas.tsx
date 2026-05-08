import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle, Clock, Search, Filter, RefreshCw, ListTodo,
  TrendingUp, Trophy, Hourglass, CalendarClock, User as UserIcon,
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { useAvatarUrl } from '../hooks/useAvatarUrl';
import { useAuth } from '../context/AuthContext';

interface ControlTarea {
  id: string;
  titulo: string;
  estado: string;
  prioridad: string | null;
  fecha_limite: string | null;
  cargo_hora: string | null;
  responsable_id: string | null;
  responsable_nombre: string | null;
  responsable_avatar: string | null;
  caso_general_id: string | null;
  caso_general_titulo: string | null;
  caso_general_expediente: string | null;
  cliente_nombre: string | null;
  expediente_caso: string | null;
  estado_tiempo: 'realizada' | 'sin_fecha' | 'vencida' | 'hoy' | 'proxima' | 'futura';
  dias_restantes: number | null;
  created_at: string;
  fecha_completada: string | null;
}

const COLOR = {
  realizada: '#34d399',  // emerald
  vencida:   '#f87171',  // red
  hoy:       '#fb923c',  // orange
  proxima:   '#facc15',  // yellow
  futura:    '#a3e635',  // lime
  sin_fecha: '#9ca3af',  // gray
};
const COLOR_ARR = ['#a3e635', '#34d399', '#facc15', '#fb923c', '#f87171', '#9ca3af', '#c084fc', '#60a5fa'];

function MiniAvatar({ path, nombre, size = 28 }: { path: string | null; nombre: string | null; size?: number }) {
  const url = useAvatarUrl(path);
  const initial = (nombre || '?').trim().charAt(0).toUpperCase();
  if (url) return <img src={url} alt={nombre || ''} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <div className="rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {initial}
    </div>
  );
}

export default function ControlTareas() {
  const { user, perfil } = useAuth();
  const esAdmin = perfil?.rol === 'admin' || perfil?.rol === 'socio';
  const [tareas, setTareas] = useState<ControlTarea[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstadoTiempo, setFilterEstadoTiempo] = useState<string>('all');
  const [filterResp, setFilterResp] = useState<string>('all');

  async function load() {
    setLoading(true);
    // Disparar revisión de recordatorios (idempotente)
    try { await supabase.rpc('revisar_recordatorios_tareas'); } catch { /* noop si la migration aún no se aplicó */ }

    // Estrategia: leer SIEMPRE de tareas_completas_v2 (que ya existe y trae todas las tareas
    // con joins a casos / casos_generales / perfiles) y computar estado_tiempo en cliente.
    // Esto evita depender de la vista control_tareas_v.
    const [{ data, error }, prevRes] = await Promise.all([
      supabase
        .from('tareas_completas_v2')
        .select('*')
        .eq('archivada', false)
        .order('fecha_limite', { ascending: true, nullsFirst: false }),
      // Tareas previsionales (lectura directa por si el trigger de sync no fue aplicado)
      supabase
        .from('tareas_previsional')
        .select('id, titulo, descripcion, estado, prioridad, fecha_limite, cargo_hora, responsable_id, responsable_nombre, fecha_completada, created_at, cliente_prev_id, clientes_prev:cliente_prev_id(apellido_nombre)')
        .order('fecha_limite', { ascending: true, nullsFirst: false }),
    ]);

    if (error) {
      console.error('[ControlTareas] error cargando tareas_completas_v2', error);
      setTareas([]);
      setLoading(false);
      return;
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const computeEstadoTiempo = (estado: string, fecha_limite: string | null): { et: ControlTarea['estado_tiempo']; dr: number | null } => {
      if (estado === 'completada' || estado === 'finalizada') return { et: 'realizada', dr: null };
      if (!fecha_limite) return { et: 'sin_fecha', dr: null };
      const fl = new Date(fecha_limite); fl.setHours(0, 0, 0, 0);
      const diff = Math.round((fl.getTime() - today.getTime()) / 86400000);
      if (diff < 0) return { et: 'vencida', dr: diff };
      if (diff === 0) return { et: 'hoy', dr: diff };
      if (diff <= 2) return { et: 'proxima', dr: diff };
      return { et: 'futura', dr: diff };
    };

    const mapped: ControlTarea[] = (data || []).map((t: any) => {
      const { et, dr } = computeEstadoTiempo(t.estado, t.fecha_limite);
      return {
        id: t.id,
        titulo: t.titulo,
        estado: t.estado,
        prioridad: t.prioridad,
        fecha_limite: t.fecha_limite,
        cargo_hora: t.cargo_hora,
        responsable_id: t.responsable_id,
        responsable_nombre: t.responsable_nombre,
        responsable_avatar: t.responsable_avatar,
        caso_general_id: t.caso_general_id,
        caso_general_titulo: t.caso_general_titulo,
        caso_general_expediente: t.caso_general_expediente,
        cliente_nombre: t.cliente_nombre,
        expediente_caso: t.expediente_caso ?? t.expediente,
        estado_tiempo: et,
        dias_restantes: dr,
        created_at: t.created_at,
        fecha_completada: t.fecha_completada,
      };
    });

    // Mergear tareas previsionales (evitando duplicados si el trigger SQL ya las clonó)
    const prevsRaw = (prevRes?.data as any[]) || [];
    const previsionalIdsYaSincronizados = new Set(
      (data || []).map((t: any) => t.previsional_id).filter(Boolean)
    );
    // Dedupe extra por título (por si PostgREST cacheó la vista sin la columna previsional_id)
    const titulosYaPresentes = new Set(
      (data || []).map((t: any) => (t.titulo || '').trim().toLowerCase())
    );
    const previsionalesMapped: ControlTarea[] = prevsRaw
      .filter(p => {
        if (previsionalIdsYaSincronizados.has(p.id)) return false;
        const tituloEsperado = `[previsional] ${(p.titulo || '').trim().toLowerCase()}`;
        if (titulosYaPresentes.has(tituloEsperado)) return false;
        return true;
      })
      .map(p => {
        const { et, dr } = computeEstadoTiempo(p.estado, p.fecha_limite);
        const clienteNombre = (p as any).clientes_prev?.apellido_nombre || null;
        return {
          id: `prev-${p.id}`,
          titulo: `[Previsional] ${p.titulo}`,
          estado: p.estado === 'completada' ? 'completada' : 'en_curso',
          prioridad: p.prioridad,
          fecha_limite: p.fecha_limite,
          cargo_hora: p.cargo_hora,
          responsable_id: p.responsable_id,
          responsable_nombre: p.responsable_nombre,
          responsable_avatar: null,
          caso_general_id: null,
          caso_general_titulo: null,
          caso_general_expediente: null,
          cliente_nombre: clienteNombre,
          expediente_caso: null,
          estado_tiempo: et,
          dias_restantes: dr,
          created_at: p.created_at,
          fecha_completada: p.fecha_completada,
        };
      });

    setTareas([...mapped, ...previsionalesMapped]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // realtime: refrescar al cambiar tareas
    const ch = supabase.channel('control-tareas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas_previsional' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    return tareas.filter(t => {
      if (!esAdmin && user?.id && t.responsable_id !== user.id) return false;
      if (search && !`${t.titulo} ${t.cargo_hora} ${t.responsable_nombre} ${t.caso_general_titulo} ${t.cliente_nombre}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterEstadoTiempo !== 'all' && t.estado_tiempo !== filterEstadoTiempo) return false;
      if (filterResp !== 'all' && t.responsable_id !== filterResp) return false;
      return true;
    });
  }, [tareas, search, filterEstadoTiempo, filterResp, esAdmin, user?.id]);

  // === Métricas (basadas en lo que el usuario realmente puede ver) ===
  const stats = useMemo(() => {
    const visibles = !esAdmin && user?.id ? tareas.filter(t => t.responsable_id === user.id) : tareas;
    const total = visibles.length;
    const realizadas = visibles.filter(t => t.estado_tiempo === 'realizada').length;
    const vencidas = visibles.filter(t => t.estado_tiempo === 'vencida').length;
    const hoy = visibles.filter(t => t.estado_tiempo === 'hoy').length;
    const proximas = visibles.filter(t => t.estado_tiempo === 'proxima').length;
    return { total, realizadas, vencidas, hoy, proximas, pct_realizadas: total ? Math.round(realizadas * 100 / total) : 0 };
  }, [tareas, esAdmin, user?.id]);

  // Tarta por estado_tiempo
  const pieData = useMemo(() => {
    const map: Record<string, number> = {};
    tareas.forEach(t => { map[t.estado_tiempo] = (map[t.estado_tiempo] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [tareas]);

  // Barras: tareas por responsable
  const responsablesArr = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; avatar: string | null; total: number; realizadas: number; vencidas: number }>();
    tareas.forEach(t => {
      const id = t.responsable_id || 'sin';
      const nombre = t.responsable_nombre || 'Sin asignar';
      const cur = map.get(id) || { id, nombre, avatar: t.responsable_avatar, total: 0, realizadas: 0, vencidas: 0 };
      cur.total++;
      if (t.estado_tiempo === 'realizada') cur.realizadas++;
      if (t.estado_tiempo === 'vencida') cur.vencidas++;
      map.set(id, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.realizadas - a.realizadas);
  }, [tareas]);

  // Línea: tareas creadas y completadas por mes (últimos 6 meses)
  const lineData = useMemo(() => {
    const months: { key: string; label: string; creadas: number; realizadas: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ key, label: d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }), creadas: 0, realizadas: 0 });
    }
    const idx = (key: string) => months.findIndex(m => m.key === key);
    tareas.forEach(t => {
      if (t.created_at) {
        const k = t.created_at.slice(0, 7);
        const i = idx(k); if (i >= 0) months[i].creadas++;
      }
      if (t.fecha_completada) {
        const k = t.fecha_completada.slice(0, 7);
        const i = idx(k); if (i >= 0) months[i].realizadas++;
      }
    });
    return months;
  }, [tareas]);

  const top = responsablesArr[0];

  return (
    <div className="p-6 max-w-[1500px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Hourglass className="w-6 h-6 text-lime-300" />
            Control de Tareas
          </h1>
          <p className="text-sm text-gray-500">Tareas con cargo de hora — recordatorios automáticos 2 días antes del vencimiento.</p>
        </div>
        <button onClick={load} className="px-3 py-2 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-gray-300 flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refrescar
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI title="Total" value={stats.total} icon={<ListTodo className="w-4 h-4" />} color="bg-violet-500/15 text-violet-300 border-violet-500/30" />
        <KPI title="Realizadas" value={stats.realizadas} icon={<CheckCircle className="w-4 h-4" />} color="bg-emerald-500/15 text-emerald-300 border-emerald-500/30" />
        <KPI title="Vencidas" value={stats.vencidas} icon={<AlertTriangle className="w-4 h-4" />} color="bg-red-500/15 text-red-300 border-red-500/30" />
        <KPI title="Hoy" value={stats.hoy} icon={<CalendarClock className="w-4 h-4" />} color="bg-orange-500/15 text-orange-300 border-orange-500/30" />
        <KPI title="Próximas (≤2d)" value={stats.proximas} icon={<Clock className="w-4 h-4" />} color="bg-yellow-500/15 text-yellow-300 border-yellow-500/30" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="glass-card p-4">
          <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
            <Filter className="w-4 h-4 text-violet-300" /> Distribución por estado
          </h3>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={90} label>
                  {pieData.map((entry, i) => (
                    <Cell key={entry.name} fill={(COLOR as any)[entry.name] || COLOR_ARR[i % COLOR_ARR.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid #333' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card p-4 lg:col-span-2">
          <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-300" /> Tareas por responsable
            {top && <span className="text-[10px] text-gray-500 ml-1">— top: <b className="text-amber-300">{top.nombre}</b> ({top.realizadas} realizadas)</span>}
          </h3>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={responsablesArr.map(r => ({ name: r.nombre, Realizadas: r.realizadas, Vencidas: r.vencidas, Total: r.total }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid #333' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Realizadas" stackId="a" fill="#34d399" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Vencidas" stackId="a" fill="#f87171" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card p-4 lg:col-span-3">
          <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-lime-300" /> Evolución mensual (creadas vs realizadas)
          </h3>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid #333' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="creadas" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="realizadas" stroke="#34d399" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Filtros + tabla */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tarea / cargo / caso / persona..."
              className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white" />
          </div>
          <select value={filterEstadoTiempo} onChange={e => setFilterEstadoTiempo(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white">
            <option value="all">Todos los estados</option>
            <option value="vencida">Vencidas</option>
            <option value="hoy">Hoy</option>
            <option value="proxima">Próximas (≤ 2 días)</option>
            <option value="futura">Futuras</option>
            <option value="realizada">Realizadas</option>
            <option value="sin_fecha">Sin fecha</option>
          </select>
          <select value={filterResp} onChange={e => setFilterResp(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white">
            <option value="all">Todos los responsables</option>
            {responsablesArr.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </div>

        {loading ? (
          <p className="text-center text-gray-500 py-6 text-sm">Cargando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-gray-600 italic py-8 text-sm">Sin tareas que coincidan con los filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-white/[0.06]">
                <tr>
                  <th className="text-left px-2 py-2">Tarea</th>
                  <th className="text-left px-2 py-2">Caso</th>
                  <th className="text-left px-2 py-2">Cargo de hora</th>
                  <th className="text-left px-2 py-2">Responsable</th>
                  <th className="text-left px-2 py-2">Fecha límite</th>
                  <th className="text-left px-2 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-2 py-2 text-white font-medium max-w-[260px] truncate">{t.titulo}</td>
                    <td className="px-2 py-2 text-gray-300 max-w-[200px] truncate">
                      {t.caso_general_titulo || t.cliente_nombre || '—'}
                      {(t.caso_general_expediente || t.expediente_caso) && (
                        <div className="text-[9px] text-gray-600 font-mono">{t.caso_general_expediente || t.expediente_caso}</div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-amber-300">{t.cargo_hora}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        {t.responsable_id ? <MiniAvatar path={t.responsable_avatar} nombre={t.responsable_nombre} size={20} /> : <UserIcon className="w-4 h-4 text-gray-600" />}
                        <span className="text-gray-200">{t.responsable_nombre || '—'}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-gray-300">
                      {t.fecha_limite ? new Date(t.fecha_limite + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      {t.dias_restantes != null && t.estado_tiempo !== 'realizada' && (
                        <div className={`text-[9px] ${t.dias_restantes < 0 ? 'text-red-400' : t.dias_restantes <= 2 ? 'text-orange-300' : 'text-gray-500'}`}>
                          {t.dias_restantes < 0 ? `vencida hace ${Math.abs(t.dias_restantes)}d` : t.dias_restantes === 0 ? 'vence HOY' : `${t.dias_restantes}d restantes`}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <EstadoBadge estado={t.estado_tiempo} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KPI({ title, value, icon, color }: { title: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className={`glass-card p-3 border ${color}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider opacity-80">{title}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: ControlTarea['estado_tiempo'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    realizada: { label: 'Realizada', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
    vencida:   { label: 'Vencida',   cls: 'bg-red-500/15 text-red-300 border-red-500/40' },
    hoy:       { label: 'Hoy',       cls: 'bg-orange-500/15 text-orange-300 border-orange-500/40' },
    proxima:   { label: 'Próxima',   cls: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40' },
    futura:    { label: 'Futura',    cls: 'bg-lime-400/15 text-lime-300 border-lime-400/40' },
    sin_fecha: { label: 'Sin fecha', cls: 'bg-white/10 text-gray-400 border-white/10' },
  };
  const m = map[estado] || map.sin_fecha;
  return <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${m.cls}`}>{m.label}</span>;
}
