import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
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
type Turno = { id: string; telefono_clave: string; fecha_consulta: string; hora_consulta: string | null; abogado_asignado: string | null; detalle_consulta: string | null; reserva_pagada: boolean | null };
type Conv = { id: string; conversation_id: string; telefono_clave: string; updated_at: string };
type Perfil = { id: string; nombre: string };
type Mensaje = { from: 'cliente' | 'agente'; texto: string };

const nombreCompleto = (l: Lead) => [l.nombre, l.apellido].filter(Boolean).join(' ') || l.telefono;
const fmtFecha = (d: string) => d.slice(0, 10).split('-').reverse().join('/');

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
  const [busqueda, setBusqueda] = useState('');
  const [fCampana, setFCampana] = useState('');
  const [fGrupo, setFGrupo] = useState<'' | 'agendaron' | 'solo_consultaron'>('');
  const [fEtapa, setFEtapa] = useState('');
  const [abierto, setAbierto] = useState<Lead | null>(null);

  const cargar = useCallback(async () => {
    const [l, t, c, p] = await Promise.all([
      supabase.from('leads').select('*').order('ultimo_contacto_at', { ascending: false }).limit(2000),
      supabase.from('consultas_agendadas').select('id, telefono_clave, fecha_consulta, hora_consulta, abogado_asignado, detalle_consulta, reserva_pagada').neq('telefono_clave', '').limit(2000),
      supabase.from('conversaciones_whatsapp').select('id, conversation_id, telefono_clave, updated_at').neq('telefono_clave', '').limit(2000),
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
    return m;
  }, [turnos]);
  const convsPor = useMemo(() => {
    const m = new Map<string, Conv[]>();
    for (const c of convs) m.set(c.telefono_clave, [...(m.get(c.telefono_clave) ?? []), c]);
    return m;
  }, [convs]);

  // "Se agendó" / "solo consultó" se calculan del calendario, no se guardan aparte.
  const agendo = (l: Lead) => (turnosPor.get(l.telefono_clave)?.length ?? 0) > 0;
  const campanas = useMemo(() => [...new Set(leads.map(l => l.campana).filter(Boolean) as string[])].sort(), [leads]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return leads.filter(l => {
      if (fCampana && l.campana !== fCampana) return false;
      if (fEtapa && l.etapa !== fEtapa) return false;
      if (fGrupo === 'agendaron' && !agendo(l)) return false;
      if (fGrupo === 'solo_consultaron' && agendo(l)) return false;
      if (!q) return true;
      return [l.nombre, l.apellido, l.telefono, l.email, l.dni_cuil, l.campana, l.rama].some(v => (v ?? '').toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, busqueda, fCampana, fEtapa, fGrupo, turnosPor]);

  const totales = useMemo(() => {
    const ag = leads.filter(agendo).length;
    return { total: leads.length, agendaron: ag, solo: leads.length - ag };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, turnosPor]);

  if (loading) return <div className="flex min-h-[400px] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-transparent" /></div>;
  if (error) return <div className="rounded-xl border border-red-700/40 bg-red-950/20 p-4 text-sm text-red-300">Error al cargar los leads: {error}</div>;

  const caja = 'rounded-lg border border-white/10 bg-[#0a0a0a] px-4 py-3';
  const sel = 'rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30';

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-blue-400">Centro Jurídico NOA · Campañas</p>
        <h1 className="mt-2 text-xl font-semibold text-white md:text-2xl">Leads de campañas</h1>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button className={`${caja} text-left`} onClick={() => setFGrupo('')}><div className="text-xs text-gray-500">Leads registrados</div><div className="text-2xl font-semibold text-white">{totales.total}</div></button>
        <button className={`${caja} text-left`} onClick={() => setFGrupo('agendaron')}><div className="text-xs text-gray-500">Se agendaron</div><div className="text-2xl font-semibold text-emerald-300">{totales.agendaron}</div></button>
        <button className={`${caja} text-left`} onClick={() => setFGrupo('solo_consultaron')}><div className="text-xs text-gray-500">Solo consultaron (sin turno)</div><div className="text-2xl font-semibold text-amber-300">{totales.solo}</div></button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar nombre, teléfono, DNI…" className={`${sel} pl-9 w-64`} />
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
        <select value={fEtapa} onChange={e => setFEtapa(e.target.value)} className={sel}>
          <option value="">Todas las etapas</option>
          {ETAPAS_LEAD.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
        <span className="text-xs text-gray-500">{filtrados.length} de {leads.length}</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-gray-500">
            <tr>{['Lead', 'Campaña', 'Rama', 'Etapa', 'Turno', 'Último contacto'].map(h => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">{leads.length === 0 ? 'Todavía no se registró ningún lead.' : 'Ningún lead coincide con los filtros.'}</td></tr>}
            {filtrados.map(l => {
              const t = turnosPor.get(l.telefono_clave)?.[0];
              const et = etapaDe(l.etapa);
              return (
                <tr key={l.id} onClick={() => setAbierto(l)} className="cursor-pointer border-t border-white/10 hover:bg-white/[0.03]">
                  <td className="px-4 py-3"><div className="font-medium text-white">{nombreCompleto(l)}</div><div className="text-xs text-gray-500">{l.telefono}</div></td>
                  <td className="px-4 py-3 text-gray-300">{l.campana || <span className="text-gray-600">—</span>}</td>
                  <td className="px-4 py-3 text-gray-300">{l.rama || <span className="text-gray-600">—</span>}</td>
                  <td className="px-4 py-3"><span className={`rounded-full border px-2 py-0.5 text-[11px] ${et.color}`}>{et.label}</span></td>
                  <td className="px-4 py-3 text-gray-300">{t ? `${fmtFecha(t.fecha_consulta)} ${t.hora_consulta?.slice(0, 5) ?? ''}` : <span className="text-gray-600">—</span>}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{relativo(l.ultimo_contacto_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {abierto && (
        <Ficha lead={abierto} turnos={turnosPor.get(abierto.telefono_clave) ?? []} convs={convsPor.get(abierto.telefono_clave) ?? []}
          perfiles={perfiles} onClose={() => setAbierto(null)} onGuardado={cargar} />
      )}
    </div>
  );
}

function Dato({ k, v }: { k: string; v: string | null | undefined }) {
  return <div><div className="text-[11px] uppercase tracking-wider text-gray-500">{k}</div><div className="text-sm text-gray-200">{v || <span className="text-gray-600">—</span>}</div></div>;
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
  const [chat, setChat] = useState<{ id: string; mensajes: Mensaje[] }[]>([]);

  useEffect(() => {
    let activo = true;
    if (!convs.length) { setChat([]); return; }
    supabase.from('conversaciones_whatsapp').select('id, mensajes, updated_at').in('id', convs.map(c => c.id)).order('updated_at', { ascending: true })
      .then(({ data }) => { if (activo) setChat(((data ?? []) as { id: string; mensajes: Mensaje[] }[])); });
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
  const campo = 'w-full mt-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#0a0a0a] p-5 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">{nombreCompleto(lead)}</h2>
            <p className="text-xs text-gray-500">Primer contacto {fmtFecha(lead.primer_contacto_at)} · último {relativo(lead.ultimo_contacto_at)}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="h-4 w-4" /></button>
        </div>

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
            <div className="rounded-md border border-white/10 divide-y divide-white/10">
              {datos.map(([k, v]) => <div key={k} className="flex justify-between gap-4 px-3 py-2 text-sm"><span className="text-gray-400">{k.replace(/_/g, ' ')}</span><span className="text-right text-gray-200">{String(v)}</span></div>)}
            </div>
          </section>
        )}

        {lead.resumen && <section><div className="mb-1 text-[11px] uppercase tracking-wider text-gray-500">Resumen del caso</div><p className="whitespace-pre-wrap rounded-md border border-white/10 bg-white/5 p-3 text-sm text-gray-200">{lead.resumen}</p></section>}

        <section>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-gray-500">Turnos</div>
          {turnos.length === 0 ? <p className="text-sm text-gray-500">Todavía no agendó turno.</p> : turnos.map(t => (
            <p key={t.id} className="text-sm text-gray-200">{fmtFecha(t.fecha_consulta)} {t.hora_consulta?.slice(0, 5)} con {t.abogado_asignado || '—'}{t.detalle_consulta ? ` · ${t.detalle_consulta}` : ''} · {t.reserva_pagada ? 'pagó' : 'no pagó'}</p>
          ))}
        </section>

        <section>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-gray-500">Conversaciones ({convs.length})</div>
          {chat.length === 0 ? <p className="text-sm text-gray-500">Sin conversaciones registradas.</p> : chat.map(c => (
            <div key={c.id} className="mb-3 max-h-64 space-y-1.5 overflow-y-auto rounded-md border border-white/10 bg-white/5 p-3">
              {c.mensajes.map((m, i) => <div key={i} className={`text-xs ${m.from === 'cliente' ? 'text-sky-200' : 'text-gray-200'}`}><span className="text-gray-500">{m.from === 'cliente' ? 'Cliente' : 'Agente'}: </span>{m.texto}</div>)}
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
