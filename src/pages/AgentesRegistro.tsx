import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { hace, type RegistroAgente } from '../lib/agentesApi';

const PAGINA = 100;
const COLOR_AGENTE: Record<string, string> = {
  analista: 'bg-blue-500/15 text-blue-300', redactor: 'bg-violet-500/15 text-violet-300', tester: 'bg-emerald-500/15 text-emerald-300', auditor: 'bg-amber-500/15 text-amber-300',
};
const COLOR_NIVEL: Record<string, string> = { info: 'bg-emerald-400', aviso: 'bg-amber-400', error: 'bg-red-400' };

function csvSeguro(v: unknown) {
  const t = String(v ?? '');
  // Una celda que empieza con = + - @ se interpretaría como fórmula al abrirla en una planilla.
  const limpio = /^[=+\-@]/.test(t) ? `'${t}` : t;
  return `"${limpio.replace(/"/g, '""')}"`;
}

export default function AgentesRegistro() {
  const [filas, setFilas] = useState<RegistroAgente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [hayMas, setHayMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agente, setAgente] = useState('');
  const [nivel, setNivel] = useState('');
  const [texto, setTexto] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());

  const pasaFiltro = useCallback((r: RegistroAgente) => {
    if (agente && r.agente !== agente) return false;
    if (nivel && r.nivel !== nivel) return false;
    if (desde && r.at < `${desde}T00:00:00`) return false;
    if (hasta && r.at > `${hasta}T23:59:59.999`) return false;
    return true;
  }, [agente, nivel, desde, hasta]);

  const cargar = useCallback(async (antesDe?: number) => {
    let q = supabase.from('agentes_registro').select('id, at, agente, run_id, nivel, accion, detalle').order('id', { ascending: false }).limit(PAGINA);
    if (agente) q = q.eq('agente', agente);
    if (nivel) q = q.eq('nivel', nivel);
    if (desde) q = q.gte('at', `${desde}T00:00:00`);
    if (hasta) q = q.lte('at', `${hasta}T23:59:59.999`);
    if (antesDe) q = q.lt('id', antesDe);
    const { data, error: e } = await q;
    if (e) { setError('No se pudo leer el registro. ¿Se corrió la migración de los agentes?'); setCargando(false); return; }
    setError(null);
    const nuevas = (data ?? []) as RegistroAgente[];
    setFilas(prev => antesDe ? [...prev, ...nuevas] : nuevas);
    setHayMas(nuevas.length === PAGINA);
    setCargando(false);
  }, [agente, nivel, desde, hasta]);

  useEffect(() => { setCargando(true); void cargar(); }, [cargar]);

  // En vivo: cada línea nueva aparece arriba sola.
  useEffect(() => {
    const canal = supabase.channel('agentes-registro')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agentes_registro' }, (p) => {
        const r = p.new as RegistroAgente;
        if (pasaFiltro(r)) setFilas(prev => [r, ...prev.filter(x => x.id !== r.id)]);
      })
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [pasaFiltro]);

  const visibles = useMemo(() => {
    const t = texto.trim().toLowerCase();
    if (!t) return filas;
    return filas.filter(r => r.accion.toLowerCase().includes(t) || JSON.stringify(r.detalle ?? {}).toLowerCase().includes(t));
  }, [filas, texto]);

  const alternar = (id: number) => setAbiertos(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const exportar = () => {
    const cab = ['fecha', 'agente', 'nivel', 'accion', 'detalle', 'corrida'];
    const lineas = visibles.map(r => [r.at, r.agente, r.nivel, r.accion, JSON.stringify(r.detalle ?? {}), r.run_id ?? ''].map(csvSeguro).join(','));
    const blob = new Blob(['﻿' + [cab.join(','), ...lineas].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `registro-agentes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <Link to="/agentes" className="mb-3 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300"><ArrowLeft className="size-3.5" /> Volver a los agentes</Link>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-blue-400">Centro Jurídico NOA · Agentes IA</p>
      <h1 className="mt-2 mb-2 text-xl font-semibold text-white md:text-2xl">Registro de los agentes</h1>
      <p className="mb-5 flex items-center gap-1.5 text-xs text-gray-500"><Lock className="size-3.5" /> Todo lo que hacen queda guardado acá. Los registros no se pueden editar ni borrar.</p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Campo etiqueta="Agente">
          <select value={agente} onChange={e => setAgente(e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-gray-200">
            <option value="">Todos</option><option value="analista">Analista</option><option value="redactor">Redactor</option><option value="tester">Tester</option><option value="auditor">Auditor</option>
          </select>
        </Campo>
        <Campo etiqueta="Tipo">
          <select value={nivel} onChange={e => setNivel(e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-gray-200">
            <option value="">Todos</option><option value="info">Información</option><option value="aviso">Avisos</option><option value="error">Errores</option>
          </select>
        </Campo>
        <Campo etiqueta="Desde"><input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-gray-200" /></Campo>
        <Campo etiqueta="Hasta"><input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-gray-200" /></Campo>
        <Campo etiqueta="Buscar"><input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Texto…" className="w-48 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" /></Campo>
        <button onClick={exportar} disabled={!visibles.length} className="ml-auto inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm text-gray-200 hover:bg-white/5 disabled:opacity-40"><Download className="size-4" /> Exportar CSV</button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-700/40 bg-red-950/20 px-4 py-3 text-sm text-red-300">{error}</div>}

      {cargando ? (
        <div className="flex min-h-[200px] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-transparent" /></div>
      ) : visibles.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-[#0a0a0a] p-6 text-sm text-gray-500">No hay registros con esos filtros.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <ul className="divide-y divide-white/5 bg-[#0a0a0a]">
            {visibles.map(r => {
              const abierto = abiertos.has(r.id);
              const tieneDetalle = r.detalle && Object.keys(r.detalle).length > 0;
              return (
                <li key={r.id} className="px-4 py-2.5">
                  <button onClick={() => tieneDetalle && alternar(r.id)} className={`flex w-full items-start gap-3 text-left ${tieneDetalle ? 'cursor-pointer' : 'cursor-default'}`}>
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${COLOR_NIVEL[r.nivel] ?? 'bg-gray-400'}`} title={r.nivel} />
                    <span className="w-[132px] shrink-0 text-xs text-gray-500" title={r.at}>{new Date(r.at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'medium' })}</span>
                    <span className={`w-[74px] shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] capitalize ${COLOR_AGENTE[r.agente] ?? 'bg-gray-500/15 text-gray-300'}`}>{r.agente}</span>
                    <span className="min-w-0 flex-1 text-sm text-gray-200">{r.accion}</span>
                    <span className="hidden shrink-0 text-[11px] text-gray-600 sm:block">{hace(r.at)}</span>
                    {tieneDetalle ? (abierto ? <ChevronDown className="mt-0.5 size-4 shrink-0 text-gray-500" /> : <ChevronRight className="mt-0.5 size-4 shrink-0 text-gray-500" />) : <span className="size-4 shrink-0" />}
                  </button>
                  {abierto && tieneDetalle && (
                    <pre className="mt-2 ml-5 overflow-x-auto rounded-lg bg-black/50 p-3 text-[11px] leading-relaxed text-gray-400">{JSON.stringify(r.detalle, null, 2)}{r.run_id ? `\n\ncorrida: ${r.run_id}` : ''}</pre>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {hayMas && !cargando && (
        <div className="mt-4 text-center">
          <button onClick={() => void cargar(filas[filas.length - 1]?.id)} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-gray-300 hover:bg-white/5">Cargar más</button>
        </div>
      )}
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-gray-500">
      {etiqueta}
      {children}
    </label>
  );
}
