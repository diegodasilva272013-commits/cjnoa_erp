import { useCallback, useEffect, useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarCheck, Headphones, LayoutGrid, BarChart3, Phone, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ETAPAS_LEAD, ETIQUETAS_CALIFICACION, etapaDe } from '../lib/leadsEtapas';

type Lead = {
  id: string; telefono: string; telefono_clave: string;
  nombre: string | null; apellido: string | null; email: string | null; dni_cuil: string | null; localidad: string | null;
  campana: string | null; mensaje_inicial: string | null; canal: string;
  rama: string | null; tipo_tramite: string | null; calificacion: string | null; datos: Record<string, unknown>;
  resumen: string | null; requiere_turno: boolean | null; motivo_descarte: string | null;
  etapa: string; asignado_a: string | null; proxima_accion_at: string | null; notas: string | null;
  primer_contacto_at: string; ultimo_contacto_at: string;
};
type Turno = {
  id: string; telefono_clave: string; fecha_consulta: string; hora_consulta: string | null; abogado_asignado: string | null;
  detalle_consulta: string | null; reserva_pagada: boolean | null; monto_reserva: number | null; fecha_carga: string | null; origen: string | null;
};
type Conv = { id: string; conversation_id: string; telefono_clave: string; updated_at: string; created_at: string; audio_path: string | null; resumen: string | null };
type Perfil = { id: string; nombre: string };
type Mensaje = { from: 'cliente' | 'agente'; texto: string };
type ConvDetalle = { id: string; mensajes: Mensaje[]; audio_path: string | null; resumen: string | null; created_at: string };

const nombreCompleto = (l: Lead) => [l.nombre, l.apellido].filter(Boolean).join(' ') || l.telefono;
const fmtFecha = (d: string) => d.slice(0, 10).split('-').reverse().join('/');
const fmtFechaHora = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtTurno = (t: Turno) => `${fmtFecha(t.fecha_consulta)}${t.hora_consulta ? ' ' + t.hora_consulta.slice(0, 5) : ''}`;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

function relativo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
}

function aInputLocal(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function LeadsCampanas() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [vista, setVista] = useState<'tablero' | 'metricas'>('tablero');
  const [busqueda, setBusqueda] = useState('');
  const [fCampana, setFCampana] = useState('');
  const [fGrupo, setFGrupo] = useState<'' | 'agendaron' | 'solo_consultaron'>('');
  const [abierto, setAbierto] = useState<Lead | null>(null);
  const [arrastrando, setArrastrando] = useState<Lead | null>(null);

  const cargar = useCallback(async () => {
    const [l, t, c, p] = await Promise.all([
      supabase.from('leads').select('*').order('ultimo_contacto_at', { ascending: false }).limit(2000),
      supabase.from('consultas_agendadas').select('id, telefono_clave, fecha_consulta, hora_consulta, abogado_asignado, detalle_consulta, reserva_pagada, monto_reserva, fecha_carga, origen').neq('telefono_clave', '').limit(3000),
      supabase.from('conversaciones_whatsapp').select('id, conversation_id, telefono_clave, updated_at, created_at, audio_path, resumen').neq('telefono_clave', '').limit(3000),
      supabase.from('perfiles').select('id, nombre').order('nombre'),
    ]);
    if (l.error) { setError(l.error.message); return; }
    setError('');
    setLeads((l.data ?? []) as Lead[]);
    setTurnos((t.data ?? []) as Turno[]);
    setConvs((c.data ?? []) as Conv[]);
    setPerfiles((p.data ?? []) as Perfil[]);
    setAbierto(prev => (prev ? ((l.data ?? []) as Lead[]).find(x => x.id === prev.id) ?? null : prev));
  }, []);

  useEffect(() => {
    let activo = true;
    cargar().finally(() => activo && setLoading(false));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refrescar = () => { if (timer) clearTimeout(timer); timer = setTimeout(cargar, 300); };
    const canal = supabase.channel('leads-campanas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consultas_agendadas' }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversaciones_whatsapp' }, refrescar)
      .subscribe();
    const intervalo = setInterval(cargar, 20000);
    return () => { activo = false; if (timer) clearTimeout(timer); clearInterval(intervalo); supabase.removeChannel(canal); };
  }, [cargar]);

  const turnosPor = useMemo(() => {
    const m = new Map<string, Turno[]>();
    for (const t of turnos) m.set(t.telefono_clave, [...(m.get(t.telefono_clave) ?? []), t]);
    for (const arr of m.values()) arr.sort((a, b) => (b.fecha_consulta + (b.hora_consulta ?? '')).localeCompare(a.fecha_consulta + (a.hora_consulta ?? '')));
    return m;
  }, [turnos]);
  const convsPor = useMemo(() => {
    const m = new Map<string, Conv[]>();
    for (const c of convs) m.set(c.telefono_clave, [...(m.get(c.telefono_clave) ?? []), c]);
    return m;
  }, [convs]);

  // "Se agendó" / "solo consultó" se calculan del calendario, no se guardan aparte.
  const agendo = useCallback((l: Lead) => (turnosPor.get(l.telefono_clave)?.length ?? 0) > 0, [turnosPor]);
  const tieneAudio = useCallback((l: Lead) => (convsPor.get(l.telefono_clave) ?? []).some(c => !!c.audio_path), [convsPor]);
  const campanas = useMemo(() => [...new Set(leads.map(l => l.campana).filter(Boolean) as string[])].sort(), [leads]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return leads.filter(l => {
      if (fCampana && l.campana !== fCampana) return false;
      if (fGrupo === 'agendaron' && !agendo(l)) return false;
      if (fGrupo === 'solo_consultaron' && agendo(l)) return false;
      if (!q) return true;
      return [l.nombre, l.apellido, l.telefono, l.email, l.dni_cuil, l.campana, l.rama, l.resumen].some(v => (v ?? '').toLowerCase().includes(q));
    });
  }, [leads, busqueda, fCampana, fGrupo, agendo]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function moverA(leadId: string, etapa: string) {
    const lead = leads.find(l => l.id === leadId);
    if (!lead || lead.etapa === etapa) return;
    setAviso('');
    setLeads(prev => prev.map(l => (l.id === leadId ? { ...l, etapa } : l)));
    const { error: e } = await supabase.from('leads').update({ etapa }).eq('id', leadId);
    if (e) { setAviso('No se pudo mover el lead: ' + e.message); await cargar(); }
  }

  function alSoltar(ev: DragEndEvent) {
    setArrastrando(null);
    if (ev.over) void moverA(String(ev.active.id), String(ev.over.id));
  }
  function alArrastrar(ev: DragStartEvent) {
    setArrastrando(leads.find(l => l.id === ev.active.id) ?? null);
  }

  if (loading) return <div className="flex min-h-[400px] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-transparent" /></div>;
  if (error) return <div className="rounded-xl border border-red-700/40 bg-red-950/20 p-4 text-sm text-red-300">Error al cargar los leads: {error}</div>;

  const sel = 'rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30';
  const tab = (activa: boolean) => `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${activa ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`;

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-blue-400">Centro Jurídico NOA · Campañas</p>
          <h1 className="mt-2 text-xl font-semibold text-white md:text-2xl">Leads de campañas</h1>
        </div>
        <div className="flex gap-1 rounded-lg border border-white/10 p-1">
          <button className={tab(vista === 'tablero')} onClick={() => setVista('tablero')}><LayoutGrid className="h-4 w-4" />Tablero</button>
          <button className={tab(vista === 'metricas')} onClick={() => setVista('metricas')}><BarChart3 className="h-4 w-4" />Métricas</button>
        </div>
      </header>

      <Resumen leads={filtrados} agendo={agendo} turnosPor={turnosPor} convsPor={convsPor} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar nombre, teléfono, DNI, mail…" className={`${sel} pl-9 w-72`} />
        </div>
        <select value={fCampana} onChange={e => setFCampana(e.target.value)} className={sel}>
          <option value="">Todas las campañas</option>
          {campanas.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fGrupo} onChange={e => setFGrupo(e.target.value as typeof fGrupo)} className={sel}>
          <option value="">Agendaron y no</option>
          <option value="agendaron">Se agendaron</option>
          <option value="solo_consultaron">Solo consultaron</option>
        </select>
        <span className="text-xs text-gray-500">{filtrados.length} de {leads.length}</span>
      </div>

      {aviso && <div className="rounded-md border border-red-700/40 bg-red-950/20 px-3 py-2 text-sm text-red-300">{aviso}</div>}

      {vista === 'tablero' ? (
        <DndContext sensors={sensors} onDragStart={alArrastrar} onDragEnd={alSoltar} onDragCancel={() => setArrastrando(null)}>
          <div className="flex gap-3 overflow-x-auto pb-3">
            {ETAPAS_LEAD.map(e => {
              const items = filtrados.filter(l => l.etapa === e.id);
              return (
                <Columna key={e.id} id={e.id} titulo={e.label} color={e.color} cantidad={items.length}>
                  {items.map(l => (
                    <TarjetaArrastrable key={l.id} lead={l} turno={turnosPor.get(l.telefono_clave)?.[0]} audio={tieneAudio(l)}
                      oculta={arrastrando?.id === l.id} onAbrir={() => setAbierto(l)} />
                  ))}
                  {items.length === 0 && <p className="px-2 py-6 text-center text-xs text-gray-600">Sin leads</p>}
                </Columna>
              );
            })}
            {/* Etapas viejas que ya no están en la lista: no se pierden, quedan en su propia columna. */}
            {[...new Set(filtrados.map(l => l.etapa))].filter(id => !ETAPAS_LEAD.some(e => e.id === id)).map(id => {
              const items = filtrados.filter(l => l.etapa === id);
              const e = etapaDe(id);
              return (
                <Columna key={id} id={id} titulo={e.label} color={e.color} cantidad={items.length}>
                  {items.map(l => <TarjetaArrastrable key={l.id} lead={l} turno={turnosPor.get(l.telefono_clave)?.[0]} audio={tieneAudio(l)} oculta={arrastrando?.id === l.id} onAbrir={() => setAbierto(l)} />)}
                </Columna>
              );
            })}
          </div>
          <DragOverlay>{arrastrando && <Tarjeta lead={arrastrando} turno={turnosPor.get(arrastrando.telefono_clave)?.[0]} audio={tieneAudio(arrastrando)} flotando />}</DragOverlay>
        </DndContext>
      ) : (
        <Metricas leads={filtrados} turnos={turnos} agendo={agendo} convsPor={convsPor} turnosPor={turnosPor} />
      )}

      {abierto && (
        <Ficha lead={abierto} turnos={turnosPor.get(abierto.telefono_clave) ?? []} convs={convsPor.get(abierto.telefono_clave) ?? []}
          perfiles={perfiles} onClose={() => setAbierto(null)} onGuardado={cargar} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ resumen superior

function Resumen({ leads, agendo, turnosPor, convsPor }: {
  leads: Lead[]; agendo: (l: Lead) => boolean; turnosPor: Map<string, Turno[]>; convsPor: Map<string, Conv[]>;
}) {
  const ag = leads.filter(agendo).length;
  const hoy = new Date().toISOString().slice(0, 10);
  const proximos = leads.filter(l => (turnosPor.get(l.telefono_clave) ?? []).some(t => t.fecha_consulta >= hoy)).length;
  const conAudio = leads.filter(l => (convsPor.get(l.telefono_clave) ?? []).some(c => c.audio_path)).length;
  const caja = 'rounded-lg border border-white/10 bg-[#0a0a0a] px-4 py-3';
  const items = [
    { k: 'Leads', v: String(leads.length), c: 'text-white' },
    { k: 'Se agendaron', v: String(ag), c: 'text-emerald-300' },
    { k: 'Conversión a turno', v: pct(ag, leads.length), c: 'text-sky-300' },
    { k: 'Solo consultaron', v: String(leads.length - ag), c: 'text-amber-300' },
    { k: 'Turnos próximos', v: String(proximos), c: 'text-violet-300' },
    { k: 'Con audio', v: String(conAudio), c: 'text-gray-200' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {items.map(i => <div key={i.k} className={caja}><div className="text-xs text-gray-500">{i.k}</div><div className={`text-2xl font-semibold ${i.c}`}>{i.v}</div></div>)}
    </div>
  );
}

// ------------------------------------------------------------------ tablero

function Columna({ id, titulo, color, cantidad, children }: { id: string; titulo: string; color: string; cantidad: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`flex w-72 shrink-0 flex-col rounded-lg border bg-[#080808] ${isOver ? 'border-emerald-500/60' : 'border-white/10'}`}>
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${color}`}>{titulo}</span>
        <span className="text-xs text-gray-500">{cantidad}</span>
      </div>
      <div className="flex max-h-[68vh] min-h-[120px] flex-col gap-2 overflow-y-auto px-2 pb-2">{children}</div>
    </div>
  );
}

function TarjetaArrastrable({ lead, turno, audio, oculta, onAbrir }: { lead: Lead; turno?: Turno; audio: boolean; oculta: boolean; onAbrir: () => void }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: lead.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onAbrir} className={oculta ? 'opacity-30' : ''} style={{ touchAction: 'none' }}>
      <Tarjeta lead={lead} turno={turno} audio={audio} />
    </div>
  );
}

function Tarjeta({ lead, turno, audio, flotando }: { lead: Lead; turno?: Turno; audio: boolean; flotando?: boolean }) {
  const resumen = lead.resumen?.trim();
  return (
    <div className={`cursor-grab rounded-lg border border-white/10 bg-[#101010] p-3 text-left hover:border-white/25 ${flotando ? 'shadow-2xl ring-1 ring-emerald-500/40' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-white">{nombreCompleto(lead)}</div>
          <div className="flex items-center gap-1 text-xs text-gray-500"><Phone className="h-3 w-3" />{lead.telefono}</div>
        </div>
        {audio && <Headphones className="h-4 w-4 shrink-0 text-sky-400" aria-label="Tiene audio" />}
      </div>

      {turno && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md border border-emerald-700/40 bg-emerald-900/20 px-2 py-1 text-xs text-emerald-300">
          <CalendarCheck className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{fmtTurno(turno)}{turno.abogado_asignado ? ` · ${turno.abogado_asignado}` : ''}</span>
        </div>
      )}

      {lead.email && <div className="mt-2 truncate text-xs text-gray-400">{lead.email}</div>}
      {resumen && <p className="mt-2 line-clamp-3 text-xs text-gray-400">{resumen}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        {lead.campana && <span className="rounded bg-blue-900/30 px-1.5 py-0.5 text-blue-300">{lead.campana}</span>}
        {lead.rama && <span className="rounded bg-white/5 px-1.5 py-0.5 text-gray-300">{lead.rama}</span>}
        {lead.calificacion && <span className="rounded bg-white/5 px-1.5 py-0.5 text-gray-300">{ETIQUETAS_CALIFICACION[lead.calificacion] ?? lead.calificacion}</span>}
        <span className="ml-auto text-gray-600">{relativo(lead.ultimo_contacto_at)}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ métricas

function Barra({ etiqueta, valor, max, extra }: { etiqueta: string; valor: number; max: number; extra?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs"><span className="truncate text-gray-300">{etiqueta}</span><span className="text-gray-500">{valor}{extra ? ` · ${extra}` : ''}</span></div>
      <div className="h-1.5 rounded bg-white/5"><div className="h-1.5 rounded bg-emerald-500/70" style={{ width: `${max ? Math.max(3, (valor / max) * 100) : 0}%` }} /></div>
    </div>
  );
}

function Metricas({ leads, turnos, agendo, convsPor, turnosPor }: {
  leads: Lead[]; turnos: Turno[]; agendo: (l: Lead) => boolean; convsPor: Map<string, Conv[]>; turnosPor: Map<string, Turno[]>;
}) {
  const claves = useMemo(() => new Set(leads.map(l => l.telefono_clave)), [leads]);
  const turnosLeads = useMemo(() => turnos.filter(t => claves.has(t.telefono_clave)), [turnos, claves]);

  const agrupar = (clave: (l: Lead) => string | null) => {
    const m = new Map<string, { total: number; ag: number }>();
    for (const l of leads) {
      const k = clave(l) || 'Sin dato';
      const x = m.get(k) ?? { total: 0, ag: 0 };
      x.total++; if (agendo(l)) x.ag++;
      m.set(k, x);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  };
  const porCampana = useMemo(() => agrupar(l => l.campana), [leads, agendo]); // eslint-disable-line react-hooks/exhaustive-deps
  const porRama = useMemo(() => agrupar(l => l.rama), [leads, agendo]); // eslint-disable-line react-hooks/exhaustive-deps
  const porCalificacion = useMemo(() => agrupar(l => (l.calificacion ? ETIQUETAS_CALIFICACION[l.calificacion] ?? l.calificacion : null)), [leads, agendo]); // eslint-disable-line react-hooks/exhaustive-deps
  const porAbogado = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of turnosLeads) m.set(t.abogado_asignado || 'Sin asignar', (m.get(t.abogado_asignado || 'Sin asignar') ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [turnosLeads]);

  const porDia = useMemo(() => {
    const dias: { dia: string; leads: number; agendados: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      dias.push({ dia: d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }), leads: 0, agendados: 0 });
    }
    for (const l of leads) {
      const idx = 13 - Math.floor((Date.now() - new Date(l.primer_contacto_at).getTime()) / 86400000);
      if (idx >= 0 && idx < 14) { dias[idx].leads++; if (agendo(l)) dias[idx].agendados++; }
    }
    return dias;
  }, [leads, agendo]);

  const diasHastaConsulta = useMemo(() => {
    const v: number[] = [];
    for (const l of leads) {
      const t = turnosPor.get(l.telefono_clave)?.[0];
      if (t) v.push(Math.max(0, Math.round((new Date(t.fecha_consulta + 'T12:00:00').getTime() - new Date(l.primer_contacto_at).getTime()) / 86400000)));
    }
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  }, [leads, turnosPor]);

  const pagaron = turnosLeads.filter(t => t.reserva_pagada).length;
  const montoReservas = turnosLeads.filter(t => t.reserva_pagada).reduce((s, t) => s + Number(t.monto_reserva ?? 0), 0);
  const convsTotal = leads.reduce((s, l) => s + (convsPor.get(l.telefono_clave)?.length ?? 0), 0);
  const audios = leads.reduce((s, l) => s + (convsPor.get(l.telefono_clave) ?? []).filter(c => c.audio_path).length, 0);
  const conEmail = leads.filter(l => l.email).length;
  const conDni = leads.filter(l => l.dni_cuil).length;

  const panel = 'rounded-lg border border-white/10 bg-[#0a0a0a] p-4';
  const titulo = 'mb-3 text-[11px] uppercase tracking-wider text-gray-500';
  const lista = (rows: [string, { total: number; ag: number }][]) => {
    const max = Math.max(1, ...rows.map(r => r[1].total));
    return <div className="space-y-3">{rows.slice(0, 8).map(([k, v]) => <Barra key={k} etiqueta={k} valor={v.total} max={max} extra={`${v.ag} agendaron (${pct(v.ag, v.total)})`} />)}</div>;
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className={`${panel} lg:col-span-2`}>
        <div className={titulo}>Leads por día (últimos 14 días)</div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={porDia}>
              <XAxis dataKey="dia" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={24} />
              <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="leads" name="Leads" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="agendados" name="Agendaron" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={panel}><div className={titulo}>Por campaña</div>{lista(porCampana)}</div>
      <div className={panel}><div className={titulo}>Por rama de consulta</div>{lista(porRama)}</div>
      <div className={panel}><div className={titulo}>Por calificación</div>{lista(porCalificacion)}</div>

      <div className={panel}>
        <div className={titulo}>Embudo por etapa</div>
        <div className="space-y-3">
          {(() => {
            const max = Math.max(1, ...ETAPAS_LEAD.map(e => leads.filter(l => l.etapa === e.id).length));
            return ETAPAS_LEAD.map(e => { const n = leads.filter(l => l.etapa === e.id).length; return <Barra key={e.id} etiqueta={e.label} valor={n} max={max} extra={pct(n, leads.length)} />; });
          })()}
        </div>
      </div>

      <div className={panel}>
        <div className={titulo}>Turnos agendados</div>
        {porAbogado.length === 0 ? <p className="text-sm text-gray-500">Todavía no hay turnos.</p> : (
          <div className="space-y-3">{porAbogado.map(([k, n]) => <Barra key={k} etiqueta={k} valor={n} max={porAbogado[0][1]} />)}</div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-3 text-sm">
          <div><div className="text-xs text-gray-500">Reserva pagada</div><div className="text-white">{pagaron} de {turnosLeads.length}</div></div>
          <div><div className="text-xs text-gray-500">Monto de reservas</div><div className="text-white">${montoReservas.toLocaleString('es-AR')}</div></div>
          <div><div className="text-xs text-gray-500">Días del primer contacto a la consulta</div><div className="text-white">{diasHastaConsulta === null ? '—' : `${diasHastaConsulta} (promedio)`}</div></div>
        </div>
      </div>

      <div className={panel}>
        <div className={titulo}>Calidad de los datos y conversaciones</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><div className="text-xs text-gray-500">Conversaciones</div><div className="text-white">{convsTotal}</div></div>
          <div><div className="text-xs text-gray-500">Con audio</div><div className="text-white">{audios}</div></div>
          <div><div className="text-xs text-gray-500">Leads con email</div><div className="text-white">{conEmail} ({pct(conEmail, leads.length)})</div></div>
          <div><div className="text-xs text-gray-500">Leads con DNI/CUIL</div><div className="text-white">{conDni} ({pct(conDni, leads.length)})</div></div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ ficha

function Dato({ k, v }: { k: string; v: string | null | undefined }) {
  return <div><div className="text-[11px] uppercase tracking-wider text-gray-500">{k}</div><div className="break-words text-sm text-gray-200">{v || <span className="text-gray-600">—</span>}</div></div>;
}

function Audio({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let activo = true;
    supabase.storage.from('conversaciones-audio').createSignedUrl(path, 3600).then(({ data }) => { if (activo) setUrl(data?.signedUrl ?? null); });
    return () => { activo = false; };
  }, [path]);
  return url ? <audio controls src={url} className="h-8 w-full" /> : <p className="text-xs text-gray-600">Cargando audio…</p>;
}

function Ficha({ lead, turnos, convs, perfiles, onClose, onGuardado }: {
  lead: Lead; turnos: Turno[]; convs: Conv[]; perfiles: Perfil[]; onClose: () => void; onGuardado: () => Promise<void>;
}) {
  const [etapa, setEtapa] = useState(lead.etapa);
  const [asignado, setAsignado] = useState(lead.asignado_a ?? '');
  const [proxima, setProxima] = useState(aInputLocal(lead.proxima_accion_at));
  const [notas, setNotas] = useState(lead.notas ?? '');
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');
  const [chat, setChat] = useState<ConvDetalle[]>([]);

  useEffect(() => {
    let activo = true;
    if (!convs.length) { setChat([]); return; }
    supabase.from('conversaciones_whatsapp').select('id, mensajes, audio_path, resumen, created_at').in('id', convs.map(c => c.id)).order('created_at', { ascending: true })
      .then(({ data }) => { if (activo) setChat((data ?? []) as ConvDetalle[]); });
    return () => { activo = false; };
  }, [convs]);

  async function guardar() {
    setGuardando(true); setMsg('');
    const { error } = await supabase.from('leads').update({
      etapa, asignado_a: asignado || null, notas: notas.trim() || null,
      proxima_accion_at: proxima ? new Date(proxima).toISOString() : null,
    }).eq('id', lead.id);
    setGuardando(false);
    if (error) return setMsg('No se pudo guardar: ' + error.message);
    setMsg('Guardado'); await onGuardado();
  }

  const datos = Object.entries(lead.datos ?? {});
  const resumenes = chat.map(c => c.resumen).filter((r): r is string => !!r && r !== lead.resumen);
  const turno = turnos[0];
  const campo = 'w-full mt-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#0a0a0a] p-5 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">{nombreCompleto(lead)}</h2>
            <p className="text-xs text-gray-500">Contactó el {fmtFechaHora(lead.primer_contacto_at)} · último mensaje {relativo(lead.ultimo_contacto_at)}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        {turno && (
          <section className="rounded-lg border border-emerald-700/40 bg-emerald-900/15 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300"><CalendarCheck className="h-4 w-4" />Consulta agendada</div>
            <div className="grid grid-cols-2 gap-3">
              <Dato k="Fecha y hora de la consulta" v={fmtTurno(turno)} />
              <Dato k="Abogado" v={turno.abogado_asignado} />
              <Dato k="Se agendó el" v={turno.fecha_carga ? fmtFecha(turno.fecha_carga) : null} />
              <Dato k="Reserva" v={turno.reserva_pagada ? `Pagada${turno.monto_reserva ? ` ($${Number(turno.monto_reserva).toLocaleString('es-AR')})` : ''}` : 'Sin pagar'} />
              <div className="col-span-2"><Dato k="Tema" v={turno.detalle_consulta} /></div>
            </div>
            {turnos.length > 1 && <p className="mt-2 text-xs text-gray-400">Otros turnos: {turnos.slice(1).map(fmtTurno).join(' · ')}</p>}
          </section>
        )}

        <section className="grid grid-cols-2 gap-3">
          <Dato k="Nombre" v={lead.nombre} /><Dato k="Apellido" v={lead.apellido} />
          <Dato k="Teléfono" v={lead.telefono} /><Dato k="Email" v={lead.email} />
          <Dato k="DNI / CUIL" v={lead.dni_cuil} /><Dato k="Localidad" v={lead.localidad} />
          <Dato k="Campaña" v={lead.campana} /><Dato k="Mensaje inicial" v={lead.mensaje_inicial} />
          <Dato k="Rama" v={lead.rama} /><Dato k="Trámite" v={lead.tipo_tramite} />
          <Dato k="Calificación" v={lead.calificacion ? ETIQUETAS_CALIFICACION[lead.calificacion] ?? lead.calificacion : null} />
          <Dato k="Pidió turno" v={lead.requiere_turno === null ? null : lead.requiere_turno ? 'Sí' : 'No'} />
        </section>

        {datos.length > 0 && (
          <section>
            <div className="mb-1 text-[11px] uppercase tracking-wider text-gray-500">Datos que juntó el agente</div>
            <div className="divide-y divide-white/10 rounded-md border border-white/10">
              {datos.map(([k, v]) => <div key={k} className="flex justify-between gap-4 px-3 py-2 text-sm"><span className="text-gray-400">{k.replace(/_/g, ' ')}</span><span className="text-right text-gray-200">{String(v)}</span></div>)}
            </div>
          </section>
        )}

        {(lead.resumen || resumenes.length > 0) && (
          <section>
            <div className="mb-1 text-[11px] uppercase tracking-wider text-gray-500">Resumen de la conversación</div>
            <div className="space-y-2">
              {lead.resumen && <p className="whitespace-pre-wrap rounded-md border border-white/10 bg-white/5 p-3 text-sm text-gray-200">{lead.resumen}</p>}
              {resumenes.map((r, i) => <p key={i} className="whitespace-pre-wrap rounded-md border border-white/10 bg-white/5 p-3 text-sm text-gray-300">{r}</p>)}
            </div>
          </section>
        )}

        <section>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-gray-500">Conversaciones y audios ({convs.length})</div>
          {chat.length === 0 ? <p className="text-sm text-gray-500">Sin conversaciones registradas.</p> : chat.map(c => (
            <div key={c.id} className="mb-3 space-y-2 rounded-md border border-white/10 bg-white/5 p-3">
              <div className="text-[11px] text-gray-500">{fmtFechaHora(c.created_at)}</div>
              {c.audio_path && <Audio path={c.audio_path} />}
              <div className="max-h-64 space-y-1.5 overflow-y-auto">
                {c.mensajes.map((m, i) => <div key={i} className={`text-xs ${m.from === 'cliente' ? 'text-sky-200' : 'text-gray-200'}`}><span className="text-gray-500">{m.from === 'cliente' ? 'Cliente' : 'Agente'}: </span>{m.texto}</div>)}
              </div>
            </div>
          ))}
        </section>

        <section className="space-y-3 border-t border-white/10 pt-4">
          <div className="text-[11px] uppercase tracking-wider text-gray-500">Gestión</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-400">Etapa
              <select value={etapa} onChange={e => setEtapa(e.target.value)} className={campo}>
                {ETAPAS_LEAD.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                {!ETAPAS_LEAD.some(e => e.id === lead.etapa) && <option value={lead.etapa}>{lead.etapa}</option>}
              </select>
            </label>
            <label className="text-xs text-gray-400">Asignado a
              <select value={asignado} onChange={e => setAsignado(e.target.value)} className={campo}>
                <option value="">Sin asignar</option>
                {perfiles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </label>
            <label className="col-span-2 text-xs text-gray-400">Próxima acción
              <input type="datetime-local" value={proxima} onChange={e => setProxima(e.target.value)} className={campo} />
            </label>
            <label className="col-span-2 text-xs text-gray-400">Notas
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3} className={campo} />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={guardar} disabled={guardando} className="rounded-md bg-emerald-500 px-3 py-2 text-xs font-medium text-black hover:bg-emerald-400 disabled:opacity-50">Guardar</button>
            {msg && <span className="text-xs text-gray-400">{msg}</span>}
          </div>
        </section>
      </div>
    </div>
  );
}
