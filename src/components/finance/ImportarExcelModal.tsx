import { useState } from 'react';
import { Download, Upload, FileSpreadsheet, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatMoney } from '../../lib/financeFormat';
import {
  leerExcel, parsearFilasIngresos, parsearFilasEgresos,
  descargarPlantillaIngresos, descargarPlantillaEgresos,
  type FilaError, type IngresoImportado, type EgresoImportado,
} from '../../lib/financeImportV2';
import Modal from '../Modal';

type Target = 'ingresos' | 'egresos';
type Fase = 'elegir' | 'validando' | 'preview' | 'importando' | 'listo';

const TAMANO_LOTE = 200;

export default function ImportarExcelModal({ target, open, onClose, onImportado }: {
  target: Target; open: boolean; onClose: () => void; onImportado: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [fase, setFase] = useState<Fase>('elegir');
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [validas, setValidas] = useState<(IngresoImportado | EgresoImportado)[]>([]);
  const [errores, setErrores] = useState<FilaError[]>([]);
  const [progreso, setProgreso] = useState({ ok: 0, fail: 0, total: 0 });
  const [erroresInsert, setErroresInsert] = useState<string[]>([]);

  function reset() {
    setFase('elegir'); setNombreArchivo(''); setValidas([]); setErrores([]);
    setProgreso({ ok: 0, fail: 0, total: 0 }); setErroresInsert([]);
  }
  function cerrar() { reset(); onClose(); }

  async function onFileSelected(file: File | null) {
    if (!file) return;
    setNombreArchivo(file.name);
    setFase('validando');
    try {
      const rows = await leerExcel(file);
      const { validas: v, errores: e } = target === 'ingresos' ? parsearFilasIngresos(rows) : parsearFilasEgresos(rows);
      setValidas(v); setErrores(e); setFase('preview');
    } catch (err: any) {
      showToast('No se pudo leer el archivo: ' + (err?.message || 'error'), 'error');
      setFase('elegir');
    }
  }

  async function confirmarImportacion() {
    if (validas.length === 0) return;
    setFase('importando');
    setProgreso({ ok: 0, fail: 0, total: validas.length });
    const fallos: string[] = [];
    let ok = 0, fail = 0;

    for (let i = 0; i < validas.length; i += TAMANO_LOTE) {
      const lote = validas.slice(i, i + TAMANO_LOTE);
      const payload = lote.map(r => ({ ...r, created_by: user?.id, updated_by: user?.id }));
      const tabla = target === 'ingresos' ? 'ingresos_operativos' : 'egresos_v2';
      const { error } = await supabase.from(tabla).insert(payload);
      if (error) {
        fail += lote.length;
        fallos.push(`Filas ${i + 1}-${i + lote.length}: ${error.message}`);
      } else {
        ok += lote.length;
      }
      setProgreso({ ok, fail, total: validas.length });
    }
    setErroresInsert(fallos);
    setFase('listo');
    if (ok > 0) { onImportado(); showToast(`${ok} registro(s) importado(s)`, 'success'); }
  }

  const totalMonto = validas.reduce((s, r: any) => s + Number(r.monto || 0), 0);

  return (
    <Modal open={open} onClose={() => { if (fase !== 'importando') cerrar(); }} title={`Importar ${target === 'ingresos' ? 'ingresos' : 'egresos'} desde Excel`} maxWidth="max-w-3xl">
      <div className="space-y-4">
        {fase === 'elegir' && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              Para cargar datos de meses anteriores (o cualquier volumen grande) sin tipearlos uno por uno:
              descargá la plantilla, completala con tus datos históricos y subila acá. Se valida todo
              ANTES de tocar la base — no se importa nada hasta que confirmes el preview.
            </p>
            <button
              onClick={() => (target === 'ingresos' ? descargarPlantillaIngresos() : descargarPlantillaEgresos())}
              className="w-full px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> 1. Descargar plantilla Excel
            </button>
            <label className="block border-2 border-dashed border-white/15 hover:border-emerald-400/40 rounded-xl p-8 text-center cursor-pointer transition">
              <Upload className="w-8 h-8 text-gray-500 mx-auto mb-2" />
              <div className="text-sm text-gray-300">2. Hacé click para elegir el Excel ya completado</div>
              <div className="text-[11px] text-gray-500 mt-1">.xlsx</div>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => onFileSelected(e.target.files?.[0] || null)} />
            </label>
          </div>
        )}

        {fase === 'validando' && (
          <div className="py-10 flex flex-col items-center gap-3 text-gray-300">
            <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
            <div className="text-sm">Leyendo y validando {nombreArchivo}…</div>
          </div>
        )}

        {fase === 'preview' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2.5 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> {validas.length} fila(s) válida(s) — total {formatMoney(totalMonto)}
              </span>
              {errores.length > 0 && (
                <span className="px-2.5 py-1.5 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> {errores.length} fila(s) con error (no se importan)
                </span>
              )}
            </div>

            {errores.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-rose-500/20 bg-rose-500/5 divide-y divide-rose-500/10">
                {errores.map((e, i) => (
                  <div key={i} className="px-3 py-1.5 text-xs text-rose-200">Fila {e.fila}: {e.mensaje}</div>
                ))}
              </div>
            )}

            {validas.length > 0 && (
              <div className="rounded-lg border border-white/10 overflow-hidden">
                <div className="px-3 py-2 bg-white/[0.03] text-xs text-zinc-400 border-b border-white/10">Vista previa (primeras 8 filas)</div>
                <div className="overflow-auto max-h-56">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-white/5">
                      {validas.slice(0, 8).map((r: any, i) => (
                        <tr key={i} className="text-zinc-300">
                          <td className="px-2 py-1 whitespace-nowrap">{r.fecha}</td>
                          <td className="px-2 py-1 whitespace-nowrap">{r.cliente_nombre || r.concepto}</td>
                          <td className="px-2 py-1 whitespace-nowrap text-right text-white font-medium">{formatMoney(r.monto)}</td>
                          <td className="px-2 py-1 whitespace-nowrap">{r.modalidad}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center gap-2 pt-2">
              <button onClick={reset} className="px-3 py-2 text-xs rounded-md bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10">
                ← Elegir otro archivo
              </button>
              <button
                onClick={confirmarImportacion}
                disabled={validas.length === 0}
                className="px-4 py-2 text-sm rounded-md bg-emerald-500 hover:bg-emerald-400 text-black font-medium disabled:opacity-40 flex items-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" /> Importar {validas.length} registro(s)
              </button>
            </div>
          </div>
        )}

        {fase === 'importando' && (
          <div className="py-10 flex flex-col items-center gap-3 text-gray-300">
            <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
            <div className="text-sm">Importando… {progreso.ok + progreso.fail} / {progreso.total}</div>
          </div>
        )}

        {fase === 'listo' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-sm">{progreso.ok} registro(s) importado(s) correctamente.</span>
            </div>
            {progreso.fail > 0 && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 space-y-1">
                <div className="text-xs text-rose-200 font-medium">{progreso.fail} registro(s) fallaron al guardar:</div>
                {erroresInsert.map((m, i) => <div key={i} className="text-xs text-rose-300">{m}</div>)}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={reset} className="px-3 py-2 text-xs rounded-md bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10">
                Importar otro archivo
              </button>
              <button onClick={cerrar} className="px-4 py-2 text-sm rounded-md bg-emerald-500 hover:bg-emerald-400 text-black font-medium">
                Listo
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
