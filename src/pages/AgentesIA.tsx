import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Pause, ScrollText, ShieldCheck, RotateCcw, Eye, Save, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { usePermisos } from '../hooks/usePermisos';
import OficinaAgentes from '../components/agentes/OficinaAgentes';
import { llamarAgentes, hace, ORDEN_AGENTES, type EstadoAgente, type RegistroAgente } from '../lib/agentesApi';

type Config = { pausado: boolean; analizar_cada: number; max_ejecuciones_dia: number; ultimo_analisis_at: string | null; conversaciones_analizadas: number };
type Analisis = { id: string; creado_at: string; conversaciones: number; metricas: any; hallazgos: any; propuestas: { titulo: string }[] };
type Version = { id: string; version: number; estado: 'activa' | 'propuesta' | 'archivada' | 'rechazada'; origen: string; motivo: string | null; creado_por: string | null; creado_at: string; aplicada_at: string | null; aplicada_por: string | null };

const NOMBRE_ETAPA: Record<string, string> = {
  consulto: 'Consultó', datos: 'Dio sus datos', propuesta: 'Recibió el valor de la consulta', forma_pago: 'Eligió cómo pagar', reserva: 'Pagó la reserva', agendada: 'Cita agendada',
};
const NOMBRE_ERROR: Record<string, string> = {
  tuteo: 'Tutea (debe hablar de usted)', reproche: 'Reprocha o apura', pregunta_repetida: 'Repite preguntas', sin_valor: 'Pregunta cómo pagar sin decir el valor', no_enviado: 'Mensaje que no se pudo enviar',
  respuesta_generica: 'Respuesta genérica de emergencia', mensaje_no_leido: 'Mensajes que no pudo leer', dato_inventado: 'Inventó un dato', no_respondio_la_duda: 'No respondió una duda',
  demasiado_largo: 'Mensajes muy largos', tono_frio: 'Tono frío', salto_de_paso: 'Se salteó un paso', otro: 'Otro',
};
const ESTADO_VERSION: Record<Version['estado'], { t: string; c: string }> = {
  activa: { t: 'En uso', c: 'bg-emerald-500/15 text-emerald-300' },
  propuesta: { t: 'Propuesta', c: 'bg-blue-500/15 text-blue-300' },
  archivada: { t: 'Backup', c: 'bg-gray-500/15 text-gray-300' },
  rechazada: { t: 'Rechazada', c: 'bg-red-500/15 text-red-300' },
};

type Tab = 'vivo' | 'analisis' | 'prompt';

export default function AgentesIA() {
  const { rol } = usePermisos();
  const esAdmin = rol === 'admin';
  const [tab, setTab] = useState<Tab>('vivo');
  const [estados, setEstados] = useState<EstadoAgente[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [faltanTablas, setFaltanTablas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [ticker, setTicker] = useState<RegistroAgente[]>([]);
  const [analisis, setAnalisis] = useState<Analisis[]>([]);
  const [elegido, setElegido] = useState<string | null>(null);
  const [versiones, setVersiones] = useState<Version[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error' | 'info'; texto: string } | null>(null);
  const [confirmar, setConfirmar] = useState<Version | null>(null);
  const [verContenido, setVerContenido] = useState<{ version: number; texto: string } | null>(null);
  const [borrador, setBorrador] = useState('');
  const [motivo, setMotivo] = useState('');

  const cargarEstados = useCallback(async () => {
    const [e, c] = await Promise.all([
      supabase.from('agentes_estado').select('agente, nombre, rol, estado, tarea, progreso, actualizado_at'),
      supabase.from('agentes_config').select('*').eq('id', 1).maybeSingle(),
    ]);
    if (e.error) { setFaltanTablas(true); setCargando(false); return; }
    setFaltanTablas(false);
    const filas = ((e.data ?? []) as EstadoAgente[]).sort((a, b) => ORDEN_AGENTES.indexOf(a.agente) - ORDEN_AGENTES.indexOf(b.agente));
    setEstados(filas);
    if (c.data) setConfig(c.data as Config);
    setCargando(false);
  }, []);

  const cargarAnalisis = useCallback(async () => {
    const { data } = await supabase.from('agentes_analisis').select('id, creado_at, conversaciones, metricas, hallazgos, propuestas').order('creado_at', { ascending: false }).limit(10);
    setAnalisis((data ?? []) as Analisis[]);
  }, []);

  const cargarTicker = useCallback(async () => {
    const { data } = await supabase.from('agentes_registro').select('id, at, agente, run_id, nivel, accion, detalle').order('id', { ascending: false }).limit(8);
    setTicker((data ?? []) as RegistroAgente[]);
  }, []);

  const cargarVersiones = useCallback(async () => {
    if (!esAdmin) return;
    const { data } = await supabase.from('agente_prompt_versiones').select('id, version, estado, origen, motivo, creado_por, creado_at, aplicada_at, aplicada_por').order('version', { ascending: false });
    setVersiones((data ?? []) as Version[]);
  }, [esAdmin]);

  useEffect(() => {
    void cargarEstados(); void cargarAnalisis(); void cargarTicker(); void cargarVersiones();
    // En vivo: cada cambio de estado y cada línea del registro llegan solos; el refresco cada 15 s es solo un respaldo.
    const canal = supabase.channel('agentes-en-vivo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agentes_estado' }, () => { void cargarEstados(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agentes_registro' }, (p) => setTicker(prev => [p.new as RegistroAgente, ...prev].slice(0, 8)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agentes_analisis' }, () => { void cargarAnalisis(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agente_prompt_versiones' }, () => { void cargarVersiones(); })
      .subscribe();
    const t = setInterval(() => { void cargarEstados(); }, 15000);
    return () => { clearInterval(t); void supabase.removeChannel(canal); };
  }, [cargarEstados, cargarAnalisis, cargarTicker, cargarVersiones]);

  const ejecutar = async (clave: string, fn: () => Promise<void>) => {
    setOcupado(clave); setAviso(null);
    try { await fn(); } catch (e) { setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo completar la acción' }); }
    finally { setOcupado(null); }
  };

  const analizarAhora = () => ejecutar('analizar', async () => {
    const r = await llamarAgentes<{ ok: boolean; estado: string; motivo?: string; conversaciones?: number; pct_cierre?: number }>('analizar');
    setAviso(r.estado === 'ok'
      ? { tipo: 'ok', texto: `Análisis listo: ${r.conversaciones} conversaciones, ${r.pct_cierre}% llegó a la cita.` }
      : { tipo: r.estado === 'error' ? 'error' : 'info', texto: r.motivo || 'No se pudo analizar ahora.' });
    await Promise.all([cargarEstados(), cargarAnalisis()]);
  });

  const pausar = (pausado: boolean) => ejecutar('pausa', async () => {
    await llamarAgentes('pausar', { pausado });
    setAviso({ tipo: 'info', texto: pausado ? 'Todos los agentes quedaron en pausa.' : 'Los agentes volvieron a trabajar.' });
    await cargarEstados();
  });

  const importarPrompt = () => ejecutar('importar', async () => {
    await llamarAgentes('prompt_importar');
    setAviso({ tipo: 'ok', texto: 'Listo: el prompt actual quedó guardado en la base como versión 1.' });
    await cargarVersiones();
  });

  const aplicar = (v: Version) => ejecutar(`aplicar-${v.id}`, async () => {
    await llamarAgentes('prompt_activar', { id: v.id });
    setConfirmar(null);
    setAviso({ tipo: 'ok', texto: v.estado === 'archivada' ? `Se volvió a la versión ${v.version}. La que estaba en uso quedó guardada como backup.` : `La versión ${v.version} ya está en uso. La anterior quedó guardada como backup.` });
    await cargarVersiones();
  });

  const verPrompt = (v: Version) => ejecutar(`ver-${v.id}`, async () => {
    const { data, error } = await supabase.from('agente_prompt_versiones').select('contenido').eq('id', v.id).maybeSingle();
    if (error || !data) throw new Error('No se pudo leer esa versión');
    setVerContenido({ version: v.version, texto: (data as any).contenido });
  });

  const cargarEnEditor = () => ejecutar('editor', async () => {
    const activa = versiones.find(v => v.estado === 'activa');
    if (!activa) throw new Error('Todavía no hay una versión en uso: primero importá el prompt actual.');
    const { data } = await supabase.from('agente_prompt_versiones').select('contenido').eq('id', activa.id).maybeSingle();
    setBorrador(String((data as any)?.contenido ?? ''));
  });

  const guardarPropuesta = () => ejecutar('proponer', async () => {
    await llamarAgentes('prompt_proponer', { contenido: borrador, motivo });
    setAviso({ tipo: 'ok', texto: 'Quedó guardada como propuesta. No cambia nada hasta que la apliques.' });
    setBorrador(''); setMotivo('');
    await cargarVersiones();
  });

  const ultimo = useMemo(() => analisis.find(a => a.id === elegido) ?? analisis[0] ?? null, [analisis, elegido]);
  const algunoTrabajando = estados.some(e => e.estado === 'trabajando');

  if (cargando) {
    return <div className="flex min-h-[400px] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-transparent" /></div>;
  }

  if (faltanTablas) {
    return (
      <div>
        <Encabezado />
        <div className="rounded-xl border border-amber-600/40 bg-amber-950/20 p-5 text-sm text-amber-100">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" /> Falta crear las tablas de los agentes</p>
          <p className="mt-2 text-amber-200/80">Abrí el SQL Editor de Supabase, pegá el contenido del archivo <code className="rounded bg-black/40 px-1.5 py-0.5">supabase/migration_agentes_maestros.sql</code> y ejecutalo. Solo crea tablas nuevas: no toca ningún dato existente. Después recargá esta pantalla.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Encabezado />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button onClick={analizarAhora} disabled={!!ocupado || algunoTrabajando || config?.pausado} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
          <Play className="size-4" /> {ocupado === 'analizar' ? 'Analizando…' : 'Ejecutar análisis ahora'}
        </button>
        <button onClick={() => pausar(!config?.pausado)} disabled={!!ocupado} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm text-gray-200 transition hover:bg-white/5 disabled:opacity-40">
          {config?.pausado ? <><Play className="size-4" /> Reanudar a todos</> : <><Pause className="size-4" /> Pausar a todos</>}
        </button>
        <Link to="/agentes/registro" className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm text-gray-200 transition hover:bg-white/5">
          <ScrollText className="size-4" /> Ver el registro completo
        </Link>
        {config && (
          <span className="ml-auto text-xs text-gray-500">
            Análisis automático cada {config.analizar_cada} conversaciones nuevas · último {config.ultimo_analisis_at ? hace(config.ultimo_analisis_at) : 'nunca'}
          </span>
        )}
      </div>

      {aviso && (
        <div className={`mb-5 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${aviso.tipo === 'ok' ? 'border-emerald-600/40 bg-emerald-950/20 text-emerald-200' : aviso.tipo === 'error' ? 'border-red-700/40 bg-red-950/20 text-red-200' : 'border-blue-600/40 bg-blue-950/20 text-blue-200'}`}>
          {aviso.tipo === 'ok' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : aviso.tipo === 'error' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0" />}
          <span>{aviso.texto}</span>
        </div>
      )}

      <div className="mb-5 flex gap-1 border-b border-white/10">
        {([['vivo', 'En vivo'], ['analisis', 'Análisis'], ...(esAdmin ? [['prompt', 'Prompt del agente']] : [])] as [Tab, string][]).map(([k, n]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${tab === k ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>{n}</button>
        ))}
      </div>

      {tab === 'vivo' && (
        <div className="space-y-6">
          <OficinaAgentes agentes={estados} />
          <section className="rounded-xl border border-white/10 bg-[#0a0a0a] p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">Lo último que hicieron</h2>
            {ticker.length === 0 ? <p className="text-sm text-gray-500">Todavía no hicieron nada.</p> : (
              <ul className="divide-y divide-white/5">
                {ticker.map(r => (
                  <li key={r.id} className="flex items-start gap-3 py-2 text-sm">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${r.nivel === 'error' ? 'bg-red-400' : r.nivel === 'aviso' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                    <span className="w-20 shrink-0 text-xs capitalize text-gray-400">{r.agente}</span>
                    <span className="min-w-0 flex-1 text-gray-200">{r.accion}</span>
                    <span className="shrink-0 text-xs text-gray-600">{hace(r.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="text-xs text-gray-600">Hoy trabaja el Analista. El Redactor, el Tester y el Auditor se suman en las próximas etapas: ninguno cambia el agente de WhatsApp sin tu aprobación.</p>
        </div>
      )}

      {tab === 'analisis' && <PanelAnalisis ultimo={ultimo} historial={analisis} elegido={elegido} onElegir={setElegido} />}

      {tab === 'prompt' && esAdmin && (
        <div className="space-y-6">
          <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#0a0a0a] p-4 text-sm text-gray-300">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-400" />
            <p>El prompt vive <b>solo en la base de datos</b> y únicamente los administradores pueden leerlo. Cada vez que aplicás una versión, la que estaba en uso queda archivada como backup y podés volver a ella con un botón. Nada se borra.</p>
          </div>

          {versiones.length === 0 ? (
            <div className="rounded-xl border border-amber-600/40 bg-amber-950/20 p-5 text-sm text-amber-100">
              <p>Todavía no hay ninguna versión guardada en la base. El agente usa hoy el prompt que trae el código.</p>
              <button onClick={importarPrompt} disabled={!!ocupado} className="mt-3 rounded-lg bg-amber-600 px-4 py-2 font-medium text-black hover:bg-amber-500 disabled:opacity-40">{ocupado === 'importar' ? 'Importando…' : 'Importar prompt actual'}</button>
            </div>
          ) : (
            <section className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 text-xs uppercase tracking-wide text-gray-500">
                  <tr><th className="px-4 py-2">Versión</th><th className="px-4 py-2">Estado</th><th className="hidden px-4 py-2 md:table-cell">Origen</th><th className="hidden px-4 py-2 lg:table-cell">Motivo</th><th className="px-4 py-2">Creada</th><th className="px-4 py-2 text-right">Acciones</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {versiones.map(v => (
                    <tr key={v.id} className="bg-[#0a0a0a]">
                      <td className="px-4 py-3 font-medium text-white">v{v.version}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] ${ESTADO_VERSION[v.estado].c}`}>{ESTADO_VERSION[v.estado].t}</span></td>
                      <td className="hidden px-4 py-3 text-gray-400 md:table-cell">{v.origen.replace('_', ' ')}{v.creado_por ? ` · ${v.creado_por}` : ''}</td>
                      <td className="hidden max-w-[260px] truncate px-4 py-3 text-gray-500 lg:table-cell" title={v.motivo ?? ''}>{v.motivo || '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{hace(v.creado_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => verPrompt(v)} disabled={!!ocupado} className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2.5 py-1 text-xs text-gray-300 hover:bg-white/5 disabled:opacity-40"><Eye className="size-3.5" /> Ver</button>
                          {v.estado !== 'activa' && v.estado !== 'rechazada' && (
                            <button onClick={() => setConfirmar(v)} disabled={!!ocupado} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40">
                              {v.estado === 'archivada' ? <><RotateCcw className="size-3.5" /> Volver a esta</> : <><Play className="size-3.5" /> Aplicar</>}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {versiones.length > 0 && (
            <section className="rounded-xl border border-white/10 bg-[#0a0a0a] p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-white">Proponer una versión nueva</h2>
                <button onClick={cargarEnEditor} disabled={!!ocupado} className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-40">Partir del prompt en uso</button>
              </div>
              <textarea value={borrador} onChange={e => setBorrador(e.target.value)} rows={10} placeholder="Escribí o pegá el prompt completo…" className="w-full rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs text-gray-200 outline-none focus:border-blue-500" />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo del cambio (opcional)" className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
                <button onClick={guardarPropuesta} disabled={!!ocupado || borrador.length < 200} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm text-gray-200 hover:bg-white/5 disabled:opacity-40"><Save className="size-4" /> Guardar como propuesta</button>
              </div>
              <p className="mt-2 text-xs text-gray-600">Guardar no cambia nada: la propuesta queda en la lista y recién se usa cuando apretás “Aplicar”.</p>
            </section>
          )}
        </div>
      )}

      {confirmar && (
        <Modal onCerrar={() => setConfirmar(null)} titulo={confirmar.estado === 'archivada' ? `¿Volver a la versión ${confirmar.version}?` : `¿Aplicar la versión ${confirmar.version}?`}>
          <p className="text-sm text-gray-300">El agente de WhatsApp pasará a usar esta versión en el próximo mensaje (hasta 1 minuto). La versión que está en uso quedará archivada como backup y podrás volver a ella cuando quieras.</p>
          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => setConfirmar(null)} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-gray-300 hover:bg-white/5">Cancelar</button>
            <button onClick={() => aplicar(confirmar)} disabled={!!ocupado} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40">{ocupado ? 'Aplicando…' : 'Sí, aplicar'}</button>
          </div>
        </Modal>
      )}

      {verContenido && (
        <Modal onCerrar={() => setVerContenido(null)} titulo={`Prompt · versión ${verContenido.version}`} ancho>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-black/50 p-4 text-xs leading-relaxed text-gray-300">{verContenido.texto}</pre>
        </Modal>
      )}
    </div>
  );
}

function Encabezado() {
  return (
    <>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-blue-400">Centro Jurídico NOA · Agentes IA</p>
      <h1 className="mt-2 mb-5 text-xl font-semibold text-white md:text-2xl">Equipo de agentes</h1>
    </>
  );
}

function Modal({ titulo, children, onCerrar, ancho }: { titulo: string; children: React.ReactNode; onCerrar: () => void; ancho?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCerrar}>
      <div className={`w-full ${ancho ? 'max-w-3xl' : 'max-w-md'} rounded-xl border border-white/10 bg-[#0f0f0f] p-5`} onClick={e => e.stopPropagation()}>
        <h3 className="mb-3 text-base font-semibold text-white">{titulo}</h3>
        {children}
      </div>
    </div>
  );
}

function PanelAnalisis({ ultimo, historial, elegido, onElegir }: { ultimo: Analisis | null; historial: Analisis[]; elegido: string | null; onElegir: (id: string) => void }) {
  if (!ultimo) {
    return <div className="rounded-xl border border-white/10 bg-[#0a0a0a] p-6 text-sm text-gray-400">Todavía no hay ningún análisis. Se hace solo cuando llegan 10 conversaciones nuevas, o podés pedirlo con “Ejecutar análisis ahora”.</div>;
  }
  const k = ultimo.metricas ?? {};
  const embudo: { etapa: string; alcanzaron: number; pct_del_total: number; pct_del_paso_anterior: number }[] = k.embudo ?? [];
  const errores: Record<string, number> = { ...(k.errores_automaticos ?? {}) };
  const erroresIA: Record<string, number> = ultimo.hallazgos?.errores_ia ?? {};
  const todos = Object.entries({ ...errores, ...Object.fromEntries(Object.entries(erroresIA).map(([c, n]) => [c, Math.max(n, errores[c] ?? 0)])) }).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-6">
      {k.confianza === 'baja' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-600/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>Son pocas conversaciones ({k.total}): estos porcentajes todavía no son confiables. Con 30 o más empiezan a servir para sacar conclusiones.</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titulo="Conversaciones analizadas" valor={String(k.total ?? 0)} />
        <Kpi titulo="Llegaron a la cita" valor={`${k.agendadas ?? 0}`} detalle={`${k.pct_cierre ?? 0}% del total`} destacado />
        <Kpi titulo="Sin respuesta del agente" valor={String(k.sin_respuesta ?? 0)} />
        <Kpi titulo="Mensajes hasta cerrar" valor={k.mensajes_promedio_hasta_cierre == null ? '—' : String(k.mensajes_promedio_hasta_cierre)} detalle="promedio del cliente" />
      </div>

      <section className="rounded-xl border border-white/10 bg-[#0a0a0a] p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Embudo hasta la cita</h2>
        <div className="space-y-2">
          {embudo.map((e, i) => (
            <div key={e.etapa}>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="text-gray-300">{NOMBRE_ETAPA[e.etapa] ?? e.etapa}</span>
                <span className="text-gray-500">{e.alcanzaron} · {e.pct_del_total}%{i > 0 ? ` · pasa ${e.pct_del_paso_anterior}% del paso anterior` : ''}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-blue-500" style={{ width: `${e.pct_del_total}%` }} /></div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-white/10 bg-[#0a0a0a] p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Dónde se queda la gente</h2>
          <ul className="space-y-1.5 text-sm">
            {(k.se_quedaron_en ?? []).map((x: { etapa: string; cantidad: number }) => (
              <li key={x.etapa} className="flex justify-between text-gray-300"><span>{NOMBRE_ETAPA[x.etapa] ?? x.etapa}</span><span className="text-gray-500">{x.cantidad}</span></li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-white/10 bg-[#0a0a0a] p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Errores detectados</h2>
          {todos.length === 0 ? <p className="text-sm text-gray-500">No se detectaron errores.</p> : (
            <ul className="space-y-1.5 text-sm">
              {todos.map(([c, n]) => <li key={c} className="flex justify-between text-gray-300"><span>{NOMBRE_ERROR[c] ?? c}</span><span className="text-red-300">{n}</span></li>)}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-gray-600">Revisadas con IA: {ultimo.hallazgos?.revisadas_con_ia ?? 0} conversaciones (primero las que no cerraron).</p>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-white/10 bg-[#0a0a0a] p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Por campaña</h2>
          <ul className="space-y-1.5 text-sm">
            {Object.entries(k.por_campana ?? {}).map(([n, v]: [string, any]) => (
              <li key={n} className="flex justify-between text-gray-300"><span className="truncate pr-3">{n}</span><span className="shrink-0 text-gray-500">{v.agendadas}/{v.total} · {v.pct_cierre}%</span></li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-white/10 bg-[#0a0a0a] p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Mejoras que propone el Analista</h2>
          {(ultimo.propuestas ?? []).length === 0 ? <p className="text-sm text-gray-500">Sin propuestas en este análisis.</p> : (
            <ul className="list-inside list-disc space-y-1.5 text-sm text-gray-300">
              {ultimo.propuestas.map((p, i) => <li key={i}>{p.titulo}</li>)}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-gray-600">Son ideas, no cambios: nada se aplica sin tu aprobación.</p>
        </section>
      </div>

      <section className="rounded-xl border border-white/10 bg-[#0a0a0a] p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Análisis anteriores</h2>
        <div className="flex flex-wrap gap-2">
          {historial.map(a => (
            <button key={a.id} onClick={() => onElegir(a.id)} className={`rounded-lg border px-3 py-1.5 text-xs transition ${(elegido ?? historial[0]?.id) === a.id ? 'border-blue-500 bg-blue-500/10 text-blue-200' : 'border-white/10 text-gray-400 hover:bg-white/5'}`}>
              {hace(a.creado_at)} · {a.conversaciones} conv. · {a.metricas?.pct_cierre ?? 0}%
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Kpi({ titulo, valor, detalle, destacado }: { titulo: string; valor: string; detalle?: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${destacado ? 'border-blue-500/40 bg-blue-500/5' : 'border-white/10 bg-[#0a0a0a]'}`}>
      <p className="text-xs text-gray-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{valor}</p>
      {detalle && <p className="mt-0.5 text-[11px] text-gray-500">{detalle}</p>}
    </div>
  );
}
