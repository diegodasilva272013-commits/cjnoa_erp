import { useEffect, useMemo, useState } from 'react';
import { Calculator, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useIngresosOperativos } from '../hooks/useIngresosOperativos';
import {
  SOCIOS_FINANZAS, RAMAS,
  type IngresoOperativo, type SocioFinanzas, type RamaLegal,
  type RepartoCalculo,
} from '../types/finanzas';
import { useToast } from '../context/ToastContext';
import { formatMoney } from '../lib/financeFormat';
import Modal from '../components/Modal';

const periodoActual = () => new Date().toISOString().slice(0, 7); // YYYY-MM

export default function FlujoCaja() {
  const { items, loading } = useIngresosOperativos();
  const { showToast } = useToast();
  const [periodo, setPeriodo] = useState(periodoActual());
  const [meta, setMeta] = useState<number>(0);
  const [calculandoReparto, setCalculandoReparto] = useState(false);
  const [reparto, setReparto] = useState<RepartoCalculo | null>(null);
  const [modalReparto, setModalReparto] = useState(false);

  // Cargar meta del periodo
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('metas_finanzas')
        .select('meta_recaudacion')
        .eq('periodo', periodo)
        .maybeSingle();
      setMeta(Number(data?.meta_recaudacion || 0));
    })();
  }, [periodo]);

  const ingresosPeriodo = useMemo(
    () => items.filter((i: IngresoOperativo) => i.fecha.startsWith(periodo)),
    [items, periodo],
  );

  const totales = useMemo(() => {
    const total = ingresosPeriodo.reduce((s, i) => s + Number(i.monto || 0), 0);
    const porSocio: Record<SocioFinanzas, number> = { Rodri: 0, Noe: 0, Ale: 0, Fabri: 0 };
    const porRama: Record<string, number> = {};
    ingresosPeriodo.forEach(i => {
      porSocio[i.doctor_cobra] = (porSocio[i.doctor_cobra] || 0) + Number(i.monto || 0);
      porRama[i.rama] = (porRama[i.rama] || 0) + Number(i.monto || 0);
    });
    return { total, porSocio, porRama };
  }, [ingresosPeriodo]);

  const cumplimiento = meta > 0 ? (totales.total / meta) * 100 : 0;
  const semaforo: 'rojo' | 'amarillo' | 'verde' =
    cumplimiento >= 100 ? 'verde' : cumplimiento >= 60 ? 'amarillo' : 'rojo';
  const colorSem =
    semaforo === 'verde' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
    : semaforo === 'amarillo' ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
    : 'bg-rose-500/20 border-rose-500/40 text-rose-300';

  async function guardarMeta(nueva: number) {
    const { error } = await supabase.from('metas_finanzas').upsert({
      periodo, meta_recaudacion: nueva,
    }, { onConflict: 'periodo' });
    if (error) showToast(error.message, 'error');
    else { setMeta(nueva); showToast('Meta actualizada', 'success'); }
  }

  async function calcularReparto() {
    setCalculandoReparto(true);
    try {
      const { data, error } = await supabase.rpc('calcular_reparto_periodo', { p_periodo: periodo });
      if (error) throw error;
      setReparto(data as RepartoCalculo);
      setModalReparto(true);
    } catch (err: any) {
      showToast(err?.message || 'Error al calcular reparto', 'error');
    } finally {
      setCalculandoReparto(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Tablero financiero</h1>
          <p className="text-sm text-zinc-400 mt-1">Resumen del periodo y reparto sugerido entre los 4 socios.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={periodo}
            onChange={e => setPeriodo(e.target.value)}
            className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white"
          />
          <button
            onClick={calcularReparto}
            disabled={calculandoReparto}
            className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm text-white flex items-center gap-2 disabled:opacity-50"
          >
            {calculandoReparto ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            Calcular reparto
          </button>
        </div>
      </header>

      {/* Meta + semáforo */}
      <div className={`rounded-xl border p-4 ${colorSem}`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase opacity-80">Meta del periodo</div>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                value={meta || ''}
                onChange={e => setMeta(Number(e.target.value))}
                onBlur={e => guardarMeta(Number(e.target.value))}
                placeholder="Definí la meta"
                className="bg-black/30 px-2 py-1 rounded text-sm text-white w-40 outline-none border border-white/10"
              />
              <span className="text-sm">→ Recaudado: <strong>{formatMoney(totales.total)}</strong></span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{cumplimiento.toFixed(0)}%</div>
            <div className="text-xs uppercase opacity-80">cumplimiento</div>
          </div>
        </div>
      </div>

      {/* Cards por socio */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {SOCIOS_FINANZAS.map(s => (
          <div key={s} className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
            <div className="text-xs text-zinc-400">{s}</div>
            <div className="text-xl font-semibold text-white mt-1">{formatMoney(totales.porSocio[s])}</div>
          </div>
        ))}
      </div>

      {/* Por rama */}
      <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 text-sm text-zinc-300 font-medium">Por rama</div>
        {loading ? (
          <div className="p-6 text-sm text-zinc-400 text-center">Cargando…</div>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-white/5">
              {RAMAS.map((r: RamaLegal) => {
                const monto = totales.porRama[r] || 0;
                const pct = totales.total > 0 ? (monto / totales.total) * 100 : 0;
                return (
                  <tr key={r}>
                    <td className="px-4 py-2 text-zinc-300">{r}</td>
                    <td className="px-4 py-2 w-1/2">
                      <div className="h-2 bg-white/5 rounded">
                        <div className="h-2 bg-emerald-500/60 rounded" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-white font-medium whitespace-nowrap">{formatMoney(monto)}</td>
                    <td className="px-4 py-2 text-right text-zinc-400 w-16">{pct.toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal reparto */}
      <Modal open={modalReparto} onClose={() => setModalReparto(false)} title={`Reparto sugerido — ${reparto?.periodo || periodo}`}>
        {reparto && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Ingresos" value={formatMoney(reparto.ingresos_totales)} />
              <Stat label="Egresos" value={formatMoney(reparto.egresos_totales)} />
              <Stat label="Utilidad" value={formatMoney(reparto.utilidad)} highlight />
              <Stat label="Parte por socio (÷4)" value={formatMoney(reparto.parte_por_socio)} />
            </div>
            <div>
              <h4 className="text-sm text-zinc-300 font-medium mb-2">Saldos actuales en cuenta</h4>
              <div className="grid grid-cols-2 gap-2">
                {SOCIOS_FINANZAS.map(s => (
                  <div key={s} className="flex justify-between bg-black/30 rounded px-3 py-2 text-sm">
                    <span className="text-zinc-400">{s}</span>
                    <span className="text-white">{formatMoney(reparto.saldos?.[s]?.total ?? 0)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm text-zinc-300 font-medium mb-2">Transferencias sugeridas</h4>
              {(!reparto.transferencias_sugeridas || reparto.transferencias_sugeridas.length === 0) ? (
                <div className="text-xs text-zinc-500">Sin movimientos necesarios — ya está parejo.</div>
              ) : (
                <ul className="space-y-1">
                  {reparto.transferencias_sugeridas.map((t, idx) => (
                    <li key={idx} className="text-sm bg-emerald-500/5 border border-emerald-500/20 rounded px-3 py-2 text-emerald-200">
                      <strong>{t.from}</strong> → <strong>{t.to}</strong>: {formatMoney(t.monto)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 border ${highlight ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/[0.02] border-white/10'}`}>
      <div className="text-[10px] uppercase text-zinc-400">{label}</div>
      <div className={`text-base font-semibold mt-0.5 ${highlight ? 'text-emerald-300' : 'text-white'}`}>{value}</div>
    </div>
  );
}
