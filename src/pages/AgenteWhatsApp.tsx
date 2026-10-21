import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { llamarAgentes, type InformeMejoras, type MetricasAgente } from '../lib/agentesApi';
import TableroAgente from '../components/agente/TableroAgente';

type Aviso = { tipo: 'error' | 'info'; texto: string };

export default function AgenteWhatsApp() {
  const [dias, setDias] = useState<number | null>(30);
  const [m, setM] = useState<MetricasAgente | null>(null);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [informe, setInforme] = useState<InformeMejoras | null>(null);
  const [optimizando, setOptimizando] = useState(false);
  const [progreso, setProgreso] = useState<{ tarea: string; porcentaje: number } | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const diasRef = useRef(dias);
  diasRef.current = dias;

  const cargarMetricas = useCallback(async (d: number | null, silencioso = false) => {
    if (!silencioso) setCargando(true); else setActualizando(true);
    try {
      const r = await llamarAgentes<MetricasAgente>('metricas', { dias: d });
      if (diasRef.current === d) { setM(r); setError(null); }
    } catch (e) {
      if (!silencioso || !m) setError(e instanceof Error ? e.message : 'No se pudieron cargar las métricas');
    } finally { setCargando(false); setActualizando(false); }
  }, [m]);

  const cargarInforme = useCallback(async () => {
    const { data } = await supabase.from('agentes_analisis').select('id, creado_at, conversaciones, hallazgos, propuestas').eq('hallazgos->>tipo', 'optimizacion').order('creado_at', { ascending: false }).limit(1).maybeSingle();
    if (!data) return;
    const x = data as any;
    setInforme({ id: x.id, creado_at: x.creado_at, resumen: String(x.hallazgos?.resumen ?? ''), fuente: x.hallazgos?.fuente === 'ia' ? 'ia' : 'reglas', personas: Number(x.conversaciones ?? 0), mejoras: Array.isArray(x.propuestas) ? x.propuestas : [] });
  }, []);

  useEffect(() => { void cargarMetricas(dias); }, [dias]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void cargarInforme(); }, [cargarInforme]);

  // En vivo: cuando llega o se mueve una conversación, se vuelven a calcular los números (con un respiro para no recalcular a cada mensaje).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const refrescar = () => { if (t) clearTimeout(t); t = setTimeout(() => { void cargarMetricas(diasRef.current, true); }, 3000); };
    const canal = supabase.channel('tablero-agente-whatsapp')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversaciones_whatsapp' }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consultas_agendadas' }, refrescar)
      .subscribe();
    const intervalo = setInterval(() => { void cargarMetricas(diasRef.current, true); }, 60000);
    return () => { if (t) clearTimeout(t); clearInterval(intervalo); void supabase.removeChannel(canal); };
  }, [cargarMetricas]);

  const optimizar = async () => {
    setOptimizando(true); setAviso(null); setProgreso({ tarea: 'Arrancando el análisis…', porcentaje: 5 });
    // Mientras trabaja, se lee lo que va haciendo el Analista para mostrarlo.
    const sonda = setInterval(async () => {
      const { data } = await supabase.from('agentes_estado').select('tarea, progreso, estado').eq('agente', 'analista').maybeSingle();
      const e = data as any;
      if (e?.estado === 'trabajando') setProgreso({ tarea: String(e.tarea ?? 'Analizando…'), porcentaje: Number(e.progreso ?? 5) });
    }, 1200);
    try {
      const r = await llamarAgentes<{ ok: boolean; estado: string; motivo?: string; analisis_id?: string; conversaciones?: number; optimizaciones?: InformeMejoras['mejoras']; resumen?: string; fuente?: 'reglas' | 'ia' }>('optimizar', { dias });
      if (r.estado === 'ok') {
        setInforme({ id: r.analisis_id ?? 'nuevo', creado_at: new Date().toISOString(), resumen: r.resumen ?? '', fuente: r.fuente ?? 'reglas', personas: r.conversaciones ?? 0, mejoras: r.optimizaciones ?? [] });
      } else {
        setAviso({ tipo: r.estado === 'error' ? 'error' : 'info', texto: r.motivo || 'No se pudo analizar ahora.' });
      }
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo completar el análisis' });
    } finally { clearInterval(sonda); setOptimizando(false); setProgreso(null); }
  };

  return (
    <div>
      <Link to="/agentes" className="mb-4 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300"><ArrowLeft className="size-3.5" /> Equipo de agentes</Link>

      {aviso && (
        <div className={`mb-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${aviso.tipo === 'error' ? 'border-red-700/40 bg-red-950/20 text-red-200' : 'border-blue-600/40 bg-blue-950/20 text-blue-200'}`}>
          {aviso.tipo === 'error' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0" />}<span>{aviso.texto}</span>
        </div>
      )}

      {cargando && !m ? (
        <div className="flex min-h-[420px] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-transparent" /></div>
      ) : error && !m ? (
        <div className="rounded-xl border border-red-700/40 bg-red-950/20 p-5 text-sm text-red-200">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" /> No se pudieron cargar las métricas</p>
          <p className="mt-2 text-red-200/80">{error}</p>
          <button onClick={() => void cargarMetricas(dias)} className="mt-3 rounded-lg border border-red-400/40 px-3 py-1.5 text-xs hover:bg-red-500/10">Reintentar</button>
        </div>
      ) : m ? (
        <TableroAgente m={m} dias={dias} onDias={setDias} informe={informe} optimizando={optimizando} progreso={progreso} onOptimizar={optimizar} actualizando={actualizando} />
      ) : null}
    </div>
  );
}
