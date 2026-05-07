import { useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  ListTodo, Play, Pause, CheckCircle2, Clock, AlertTriangle, GripVertical,
  RefreshCw, BarChart3, ChevronUp, ChevronDown, Calendar as CalendarIcon, Target, TrendingUp, Timer
} from 'lucide-react';

type Tarea = {
  id: string;
  titulo: string;
  descripcion: string | null;
  caso_id: string | null;
  cliente_nombre: string | null;
  expediente: string | null;
  prioridad: 'alta' | 'media' | 'sin_prioridad';
  fecha_limite: string | null;
  estado: 'en_curso' | 'completada';
  estado_dia: 'pendiente' | 'en_progreso' | 'pausada' | 'completada' | null;
  orden_dia: number | null;
  fecha_orden: string | null;
  tiempo_estimado_min: number | null;
  tiempo_real_min: number;
  started_at: string | null;
  fecha_completada: string | null;
  archivada: boolean;
  observaciones_demora: string | null;
  culminacion: string | null;
};

function fmtKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtDuracion(minutos: number) {
  if (minutos <= 0) return '0 min';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h}h ${m}m`;
}

function PrioridadBadge({ p }: { p: string }) {
  const map: Record<string, string> = {
    alta: 'bg-red-500/15 text-red-300 border-red-500/30',
    media: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    sin_prioridad: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase border ${map[p] || map.sin_prioridad}`}>
      {p === 'sin_prioridad' ? 'Normal' : p}
    </span>
  );
}

function EstadoDiaBadge({ e }: { e: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    pendiente: { label: 'Pendiente', cls: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' },
    en_progreso: { label: 'En curso', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30 animate-pulse' },
    pausada: { label: 'Pausada', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    completada: { label: 'Completada', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  };
  const v = map[e || 'pendiente'];
  return <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${v.cls}`}>{v.label}</span>;
}

export default function MiDia() {
  const { user, perfil } = useAuth();
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroDia, setFiltroDia] = useState<'hoy' | 'todas' | 'atrasadas' | 'completadas'>('hoy');
  const [vencidas, setVencidas] = useState(false);
  const [tick, setTick] = useState(0); // forzar re-render para cronómetros
  const [historial, setHistorial] = useState<any[]>([]);
  const [showStats, setShowStats] = useState(true);
  const dragId = useRef<string | null>(null);

  // Admin/socio pueden ver el día de otros usuarios
  const esAdmin = perfil?.rol === 'admin' || perfil?.rol === 'socio';
  // 'TODOS' = ver tareas de todos los usuarios (solo admin/socio); '' = mi propio usuario; uuid = usuario específico
  const [viewUserId, setViewUserId] = useState<string>(esAdmin ? 'TODOS' : '');
  const [perfilesList, setPerfilesList] = useState<{id:string; nombre:string; rol?:string}[]>([]);
  const targetUserId = viewUserId === 'TODOS' ? 'TODOS' : (viewUserId || user?.id || '');
  const verTodos = targetUserId === 'TODOS';

  useEffect(() => {
    if (!esAdmin) return;
    supabase.from('perfiles').select('id, nombre, rol').order('nombre').then(({ data }) => {
      setPerfilesList((data || []) as any);
    });
  }, [esAdmin]);

  // Re-render cada segundo si hay tareas en curso (para cronómetros vivos)
  useEffect(() => {
    const hayActiva = tareas.some(t => t.estado_dia === 'en_progreso' && t.started_at);
    if (!hayActiva) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [tareas]);

  async function cargar() {
    if (!targetUserId) return;
    setLoading(true);
    // Intentar primero v2 (tiene todas las columnas nuevas), fallback a la vista vieja
    let q = supabase
      .from('tareas_completas_v2')
      .select('*')
      .eq('archivada', false);
    if (!verTodos) q = q.eq('responsable_id', targetUserId);
    let resp = await q
      .order('orden_dia', { ascending: true, nullsFirst: false })
      .order('prioridad', { ascending: true })
      .order('fecha_limite', { ascending: true, nullsFirst: false });
    if (resp.error) {
      let q2 = supabase
        .from('tareas_completas')
        .select('*')
        .eq('archivada', false);
      if (!verTodos) q2 = q2.eq('responsable_id', targetUserId);
      resp = await q2
        .order('prioridad', { ascending: true })
        .order('fecha_limite', { ascending: true, nullsFirst: false });
    }
    setTareas((resp.data || []) as Tarea[]);
    // historial de hoy
    const hoyKey = fmtKey(new Date());
    let qh = supabase
      .from('historial_tareas')
      .select('*')
      .gte('fecha_cierre', hoyKey + 'T00:00:00');
    if (!verTodos) qh = qh.eq('responsable_id', targetUserId);
    const { data: hist } = await qh
      .order('fecha_cierre', { ascending: false })
      .limit(50);
    setHistorial(hist || []);
    setLoading(false);
  }

  useEffect(() => { cargar(); }, [targetUserId]);

  // Realtime: si admin asigna una nueva tarea, aparece sola
  useEffect(() => {
    if (!targetUserId) return;
    const filter = verTodos ? undefined : `responsable_id=eq.${targetUserId}`;
    const ch = supabase.channel('mi_dia_' + targetUserId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tareas', ...(filter ? { filter } : {}) } as any,
        () => cargar())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [targetUserId]);

  const hoyKey = fmtKey(new Date());

  const tareasFiltradas = useMemo(() => {
    let arr = [...tareas];
    if (filtroDia === 'hoy') {
      arr = arr.filter(t =>
        t.estado !== 'completada' && (
          t.fecha_orden === hoyKey ||
          (t.fecha_limite && t.fecha_limite <= hoyKey) ||
          t.estado_dia === 'en_progreso' ||
          // pendientes asignadas sin fecha planificada: aparecen en "Hoy"
          (!t.fecha_orden && !t.fecha_limite)
        )
      );
    } else if (filtroDia === 'atrasadas') {
      arr = arr.filter(t => t.fecha_limite && t.fecha_limite < hoyKey && t.estado !== 'completada');
    } else if (filtroDia === 'completadas') {
      arr = arr.filter(t => t.estado === 'completada');
    }
    if (vencidas) arr = arr.filter(t => t.fecha_limite && t.fecha_limite < hoyKey);
    // ordenar por orden_dia, luego prioridad, luego fecha_limite
    const prioRank: Record<string, number> = { alta: 0, media: 1, sin_prioridad: 2 };
    arr.sort((a, b) => {
      if (a.orden_dia != null && b.orden_dia != null) return a.orden_dia - b.orden_dia;
      if (a.orden_dia != null) return -1;
      if (b.orden_dia != null) return 1;
      const pr = (prioRank[a.prioridad] ?? 9) - (prioRank[b.prioridad] ?? 9);
      if (pr !== 0) return pr;
      if (a.fecha_limite && b.fecha_limite) return a.fecha_limite.localeCompare(b.fecha_limite);
      return 0;
    });
    return arr;
  }, [tareas, filtroDia, vencidas, hoyKey]);

  const stats = useMemo(() => {
    const todas = tareas;
    const hoyArr = todas.filter(t => t.fecha_orden === hoyKey || (t.fecha_limite && t.fecha_limite === hoyKey));
    const completadasHoy = todas.filter(t =>
      t.estado === 'completada' && t.fecha_completada && t.fecha_completada.slice(0,10) === hoyKey);
    const enCurso = todas.filter(t => t.estado_dia === 'en_progreso').length;
    const atrasadas = todas.filter(t => t.fecha_limite && t.fecha_limite < hoyKey && t.estado !== 'completada').length;
    const minTrabajados = todas.reduce((acc, t) => {
      let extra = 0;
      if (t.estado_dia === 'en_progreso' && t.started_at) {
        extra = Math.floor((Date.now() - new Date(t.started_at).getTime()) / 60000);
      }
      return acc + (t.tiempo_real_min || 0) + extra;
    }, 0);
    const minEstimados = todas.reduce((acc, t) => acc + (t.tiempo_estimado_min || 0), 0);
    const minExcedidos = todas.reduce((acc, t) => {
      if (!t.tiempo_estimado_min) return acc;
      return acc + Math.max((t.tiempo_real_min || 0) - t.tiempo_estimado_min, 0);
    }, 0);
    return {
      total: todas.length,
      hoy: hoyArr.length,
      completadas: completadasHoy.length,
      enCurso,
      atrasadas,
      minTrabajados,
      minEstimados,
      minExcedidos,
    };
  }, [tareas, hoyKey, tick]);

  // ----- Acciones sobre tarea -----
  async function iniciar(t: Tarea) {
    // pausar otras en curso primero
    const otras = tareas.filter(x => x.estado_dia === 'en_progreso' && x.id !== t.id);
    for (const o of otras) await pausar(o, true);
    await supabase.from('tareas').update({
      estado_dia: 'en_progreso',
      started_at: new Date().toISOString(),
      fecha_orden: t.fecha_orden || hoyKey,
    }).eq('id', t.id);
    cargar();
  }

  async function pausar(t: Tarea, silent = false) {
    if (!t.started_at) return;
    const minTranscurridos = Math.floor((Date.now() - new Date(t.started_at).getTime()) / 60000);
    await supabase.from('tareas').update({
      estado_dia: 'pausada',
      started_at: null,
      tiempo_real_min: (t.tiempo_real_min || 0) + minTranscurridos,
    }).eq('id', t.id);
    if (!silent) cargar();
  }

  async function completar(t: Tarea) {
    let totalMin = t.tiempo_real_min || 0;
    if (t.estado_dia === 'en_progreso' && t.started_at) {
      totalMin += Math.floor((Date.now() - new Date(t.started_at).getTime()) / 60000);
    }
    const culm = prompt('¿Cómo culminó la tarea? (resumen breve, opcional)') || t.culminacion || '';
    await supabase.from('tareas').update({
      estado: 'completada',
      estado_dia: 'completada',
      tiempo_real_min: totalMin,
      started_at: null,
      culminacion: culm,
    }).eq('id', t.id);
    cargar();
  }

  async function setEstimado(t: Tarea) {
    const v = prompt('Tiempo estimado en minutos:', String(t.tiempo_estimado_min || 30));
    if (!v) return;
    const n = parseInt(v); if (isNaN(n) || n <= 0) return;
    await supabase.from('tareas').update({ tiempo_estimado_min: n }).eq('id', t.id);
    cargar();
  }

  async function moverArriba(t: Tarea) {
    const idx = tareasFiltradas.findIndex(x => x.id === t.id);
    if (idx <= 0) return;
    const otra = tareasFiltradas[idx - 1];
    await supabase.from('tareas').update({ orden_dia: idx - 1, fecha_orden: hoyKey }).eq('id', t.id);
    await supabase.from('tareas').update({ orden_dia: idx, fecha_orden: hoyKey }).eq('id', otra.id);
    cargar();
  }

  async function moverAbajo(t: Tarea) {
    const idx = tareasFiltradas.findIndex(x => x.id === t.id);
    if (idx >= tareasFiltradas.length - 1) return;
    const otra = tareasFiltradas[idx + 1];
    await supabase.from('tareas').update({ orden_dia: idx + 1, fecha_orden: hoyKey }).eq('id', t.id);
    await supabase.from('tareas').update({ orden_dia: idx, fecha_orden: hoyKey }).eq('id', otra.id);
    cargar();
  }

  // Drag & drop reordenamiento
  async function onDrop(targetId: string) {
    if (!dragId.current || dragId.current === targetId) return;
    const fromIdx = tareasFiltradas.findIndex(t => t.id === dragId.current);
    const toIdx = tareasFiltradas.findIndex(t => t.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reord = [...tareasFiltradas];
    const [moved] = reord.splice(fromIdx, 1);
    reord.splice(toIdx, 0, moved);
    // persistir nuevos orden_dia
    for (let i = 0; i < reord.length; i++) {
      await supabase.from('tareas').update({ orden_dia: i, fecha_orden: hoyKey }).eq('id', reord[i].id);
    }
    dragId.current = null;
    cargar();
  }

  function tiempoRealLive(t: Tarea) {
    let extra = 0;
    if (t.estado_dia === 'en_progreso' && t.started_at) {
      extra = Math.floor((Date.now() - new Date(t.started_at).getTime()) / 60000);
    }
    return (t.tiempo_real_min || 0) + extra;
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Target className="w-6 h-6 text-emerald-400" /> Mi Día
          </h1>
          <p className="text-sm text-gray-500">
            {(viewUserId && perfilesList.find(p => p.id === viewUserId)?.nombre) || perfil?.nombre || ''} · Tareas asignadas para gestionar y completar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {esAdmin && (
            <select
              value={viewUserId}
              onChange={(e) => setViewUserId(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10"
              title="Ver Mi Día de otro usuario"
            >
              <option value="">Mi día (yo)</option>
              <option value="TODOS">👥 Todos los usuarios</option>
              {perfilesList.filter(p => p.id !== user?.id).map(p => (
                <option key={p.id} value={p.id}>{p.nombre}{p.rol ? ` (${p.rol})` : ''}</option>
              ))}
            </select>
          )}
          <button onClick={cargar}
            className="px-3 py-2 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 flex items-center gap-2">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
          <button onClick={() => setShowStats(!showStats)}
            className="px-3 py-2 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5" /> {showStats ? 'Ocultar' : 'Mostrar'} stats
          </button>
        </div>
      </header>

      {showStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 border border-emerald-500/20 p-3">
            <div className="text-[11px] text-emerald-300 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Hoy completadas
            </div>
            <div className="text-2xl font-bold text-white mt-1">{stats.completadas}</div>
            <div className="text-[10px] text-gray-400">de {stats.hoy} programadas para hoy</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-blue-500/15 to-blue-500/5 border border-blue-500/20 p-3">
            <div className="text-[11px] text-blue-300 uppercase tracking-wider flex items-center gap-1">
              <Timer className="w-3.5 h-3.5" /> En curso
            </div>
            <div className="text-2xl font-bold text-white mt-1">{stats.enCurso}</div>
            <div className="text-[10px] text-gray-400">cronómetros activos</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-red-500/15 to-red-500/5 border border-red-500/20 p-3">
            <div className="text-[11px] text-red-300 uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Atrasadas
            </div>
            <div className="text-2xl font-bold text-white mt-1">{stats.atrasadas}</div>
            <div className="text-[10px] text-gray-400">vencieron sin completar</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-fuchsia-500/15 to-fuchsia-500/5 border border-fuchsia-500/20 p-3">
            <div className="text-[11px] text-fuchsia-300 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> Tiempo total
            </div>
            <div className="text-2xl font-bold text-white mt-1">{fmtDuracion(stats.minTrabajados)}</div>
            <div className="text-[10px] text-gray-400">
              estimado: {fmtDuracion(stats.minEstimados)}
              {stats.minExcedidos > 0 && (
                <span className="text-red-300"> · +{fmtDuracion(stats.minExcedidos)} de exceso</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          { k: 'hoy', label: 'Mi día (hoy)', icon: <CalendarIcon className="w-3 h-3" /> },
          { k: 'todas', label: 'Todas', icon: <ListTodo className="w-3 h-3" /> },
          { k: 'atrasadas', label: 'Atrasadas', icon: <AlertTriangle className="w-3 h-3" /> },
          { k: 'completadas', label: 'Completadas', icon: <CheckCircle2 className="w-3 h-3" /> },
        ] as const).map(f => (
          <button key={f.k} onClick={() => setFiltroDia(f.k as any)}
            className={`px-3 py-1.5 text-xs rounded-lg border flex items-center gap-1.5 transition ${
              filtroDia === f.k
                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'
            }`}>
            {f.icon} {f.label}
          </button>
        ))}
        <label className="ml-auto text-xs text-gray-400 flex items-center gap-1.5">
          <input type="checkbox" checked={vencidas} onChange={(e) => setVencidas(e.target.checked)} />
          solo vencidas
        </label>
      </div>

      {/* Lista de tareas */}
      <div className="space-y-2">
        {loading && tareasFiltradas.length === 0 && (
          <div className="text-sm text-gray-500 py-10 text-center">Cargando…</div>
        )}
        {!loading && tareasFiltradas.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-sm text-gray-500">
            {filtroDia === 'hoy' ? 'No tenés tareas para hoy. ¡A descansar!' : 'Sin tareas en este filtro.'}
          </div>
        )}

        {tareasFiltradas.map((t, idx) => {
          const live = tiempoRealLive(t);
          const exceso = t.tiempo_estimado_min ? Math.max(live - t.tiempo_estimado_min, 0) : 0;
          const enProgreso = t.estado_dia === 'en_progreso';
          const completada = t.estado === 'completada';
          const atrasada = t.fecha_limite && t.fecha_limite < hoyKey && !completada;

          return (
            <div key={t.id}
              draggable={!completada}
              onDragStart={() => { dragId.current = t.id; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(t.id)}
              className={`group rounded-xl border bg-[#0c0c0e] p-3 flex items-stretch gap-3 transition ${
                completada
                  ? 'border-emerald-500/30 opacity-60'
                  : enProgreso
                  ? 'border-blue-500/40 ring-2 ring-blue-500/20'
                  : atrasada
                  ? 'border-red-500/30'
                  : 'border-white/10 hover:border-white/20'
              }`}>
              <div className="flex flex-col items-center gap-1 text-gray-500">
                <span className="text-xs font-bold">{idx + 1}</span>
                {!completada && (
                  <button title="Arrastrar para reordenar" className="cursor-grab text-gray-600 hover:text-white">
                    <GripVertical className="w-4 h-4" />
                  </button>
                )}
                {!completada && (
                  <div className="flex flex-col">
                    <button onClick={() => moverArriba(t)} className="p-0.5 hover:text-white" title="Subir">
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button onClick={() => moverAbajo(t)} className="p-0.5 hover:text-white" title="Bajar">
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className={`font-semibold text-sm ${completada ? 'line-through text-gray-400' : 'text-white'}`}>
                    {t.titulo}
                  </h3>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <PrioridadBadge p={t.prioridad} />
                    <EstadoDiaBadge e={completada ? 'completada' : t.estado_dia} />
                  </div>
                </div>

                {(t.cliente_nombre || t.expediente) && (
                  <div className="text-[11px] text-gray-400 truncate">
                    {t.cliente_nombre}{t.expediente ? ` · ${t.expediente}` : ''}
                  </div>
                )}
                {verTodos && (t as any).responsable_nombre && (
                  <div className="text-[11px] text-emerald-300 truncate flex items-center gap-1">
                    👤 {(t as any).responsable_nombre}
                  </div>
                )}
                {t.descripcion && (
                  <div className="text-xs text-gray-300 line-clamp-2">{t.descripcion}</div>
                )}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400 pt-1">
                  {t.fecha_limite && (
                    <span className={`flex items-center gap-1 ${atrasada ? 'text-red-300' : ''}`}>
                      <CalendarIcon className="w-3 h-3" />
                      Límite: {new Date(t.fecha_limite + 'T00:00').toLocaleDateString('es-AR')}
                      {atrasada && ' · vencida'}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Trabajado: <strong className="text-white">{fmtDuracion(live)}</strong>
                  </span>
                  <button onClick={() => setEstimado(t)} className="flex items-center gap-1 hover:text-white">
                    <Target className="w-3 h-3" />
                    Estimado: {t.tiempo_estimado_min ? fmtDuracion(t.tiempo_estimado_min) : 'definir'}
                  </button>
                  {exceso > 0 && (
                    <span className="flex items-center gap-1 text-red-300">
                      <AlertTriangle className="w-3 h-3" />
                      +{fmtDuracion(exceso)} de exceso
                    </span>
                  )}
                  {completada && t.fecha_completada && (
                    <span className="text-emerald-300">
                      ✔ {new Date(t.fecha_completada).toLocaleString('es-AR')}
                    </span>
                  )}
                </div>

                {t.culminacion && completada && (
                  <div className="text-[11px] text-emerald-200/80 italic mt-1">"{t.culminacion}"</div>
                )}
              </div>

              {!completada && (
                <div className="flex flex-col gap-1.5 self-center">
                  {!enProgreso ? (
                    <button onClick={() => iniciar(t)}
                      className="px-3 py-1.5 text-xs rounded-md bg-blue-500 hover:bg-blue-400 text-white font-medium flex items-center gap-1.5">
                      <Play className="w-3 h-3" /> Iniciar
                    </button>
                  ) : (
                    <button onClick={() => pausar(t)}
                      className="px-3 py-1.5 text-xs rounded-md bg-amber-500 hover:bg-amber-400 text-black font-medium flex items-center gap-1.5">
                      <Pause className="w-3 h-3" /> Pausar
                    </button>
                  )}
                  <button onClick={() => completar(t)}
                    className="px-3 py-1.5 text-xs rounded-md bg-emerald-500 hover:bg-emerald-400 text-black font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3" /> Listo
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Historial del día */}
      {historial.length > 0 && (
        <details className="rounded-xl border border-white/10 bg-[#0c0c0e]">
          <summary className="cursor-pointer px-4 py-3 text-sm text-white font-semibold">
            📊 Historial de hoy ({historial.length})
          </summary>
          <div className="px-4 pb-4 space-y-1.5">
            {historial.map(h => (
              <div key={h.id} className="text-xs text-gray-300 flex items-center justify-between gap-2 border-b border-white/5 py-1.5">
                <span className="truncate">
                  <span className="text-emerald-300">●</span> {h.titulo}
                  {h.cliente_nombre && <span className="text-gray-500"> · {h.cliente_nombre}</span>}
                </span>
                <span className="text-gray-500 text-[10px] flex-shrink-0">
                  {h.estado_final} · {new Date(h.fecha_cierre).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
