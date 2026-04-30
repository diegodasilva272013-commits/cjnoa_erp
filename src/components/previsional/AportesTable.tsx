import { useState } from 'react';
import { Plus, Trash2, Briefcase, Calendar, AlertCircle, CheckCircle, ClipboardPaste, Loader2 } from 'lucide-react';
import { AporteLaboral, calcularResumenAportes, SexoCliente, COSTO_MENSUAL_27705 } from '../../types/previsional';

interface Props {
  aportes: AporteLaboral[];
  loading: boolean;
  hijos: number;
  sexo: SexoCliente | null;
  onAdd: (a: Partial<AporteLaboral>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

export default function AportesTable({ aportes, loading, hijos, sexo, onAdd, onRemove }: Props) {
  const [adding, setAdding] = useState(false);
  const [newAporte, setNewAporte] = useState({
    empleador: '',
    fecha_desde: '',
    fecha_hasta: '',
    es_antes_0993: false,
    es_simultaneo: false,
    observaciones: '',
  });
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: number; err: number } | null>(null);

  // Parse pasted Excel data. Soporta:
  //   2 cols: fecha_desde \t fecha_hasta
  //   3 cols: empleador  \t fecha_desde \t fecha_hasta
  //   4 cols: empleador  \t CUIT        \t fecha_desde \t fecha_hasta
  // Reglas: si la fecha viene como MM/AAAA → fecha_desde = día 1, fecha_hasta = último día del mes.
  const parsePasteLines = (text: string): Array<Partial<AporteLaboral>> => {
    const lastDayOfMonth = (year: number, month1Based: number) =>
      new Date(year, month1Based, 0).getDate(); // month=next month, day 0 = last day of given month

    // mode: 'desde' fuerza día 1; 'hasta' fuerza último día del mes (solo cuando entra MM/AAAA o MM/AA)
    const normalizeDate = (s: string, mode: 'desde' | 'hasta'): string => {
      if (!s) return '';
      // Already ISO
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      // DD/MM/YYYY → tal cual
      const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
      // MM/YYYY
      const my = s.match(/^(\d{1,2})\/(\d{4})$/);
      if (my) {
        const m = parseInt(my[1], 10);
        const y = parseInt(my[2], 10);
        const day = mode === 'hasta' ? lastDayOfMonth(y, m) : 1;
        return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      // MM/YY
      const m2 = s.match(/^(\d{1,2})\/(\d{2})$/);
      if (m2) {
        const m = parseInt(m2[1], 10);
        const y = 2000 + parseInt(m2[2], 10);
        const day = mode === 'hasta' ? lastDayOfMonth(y, m) : 1;
        return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return '';
    };

    const looksLikeDate = (s: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(s) ||
      /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s) ||
      /^\d{1,2}\/\d{2,4}$/.test(s);

    const looksLikeCuit = (s: string) => {
      const digits = s.replace(/\D/g, '');
      return digits.length === 11 || digits.length === 8; // CUIT 11 o DNI 7-8
    };

    return text
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map<Partial<AporteLaboral>>(line => {
        // Separadores: tab, ; o 2+ espacios
        const parts = line.split(/\t|;|\s{2,}/).map(p => p.trim()).filter(p => p.length > 0);

        // 4+ columnas: Empleador | CUIT | desde | hasta
        if (parts.length >= 4 && looksLikeCuit(parts[1]) && looksLikeDate(parts[2]) && looksLikeDate(parts[3])) {
          return {
            empleador: parts[0] || null,
            fecha_desde: normalizeDate(parts[2], 'desde'),
            fecha_hasta: normalizeDate(parts[3], 'hasta'),
            observaciones: `CUIT: ${parts[1]}`,
          };
        }
        // 3 columnas: Empleador | desde | hasta
        if (parts.length >= 3 && looksLikeDate(parts[1]) && looksLikeDate(parts[2])) {
          return {
            empleador: parts[0] || null,
            fecha_desde: normalizeDate(parts[1], 'desde'),
            fecha_hasta: normalizeDate(parts[2], 'hasta'),
          };
        }
        // 2 columnas: desde | hasta
        if (parts.length === 2 && looksLikeDate(parts[0]) && looksLikeDate(parts[1])) {
          return {
            empleador: null,
            fecha_desde: normalizeDate(parts[0], 'desde'),
            fecha_hasta: normalizeDate(parts[1], 'hasta'),
          };
        }
        return {};
      })
      .filter(a => a.fecha_desde && a.fecha_hasta);
  };

  const handleBulkImport = async () => {
    const rows = parsePasteLines(pasteText);
    if (!rows.length) return;
    setImporting(true);
    let ok = 0; let err = 0;
    for (const row of rows) {
      const success = await onAdd(row);
      if (success) ok++; else err++;
    }
    setImporting(false);
    setImportResult({ ok, err });
    setPasteText('');
    setTimeout(() => { setImportResult(null); setShowPaste(false); }, 3000);
  };

  const resumen = sexo
    ? calcularResumenAportes(aportes, hijos, sexo, 0)
    : null;

  const handleAdd = async () => {
    if (!newAporte.fecha_desde || !newAporte.fecha_hasta) return;
    const ok = await onAdd(newAporte);
    if (ok) {
      setNewAporte({ empleador: '', fecha_desde: '', fecha_hasta: '', es_antes_0993: false, es_simultaneo: false, observaciones: '' });
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Historial de Aportes Laborales</h3>
          <span className="text-xs text-gray-500">({aportes.length})</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowPaste(!showPaste); setAdding(false); }}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
            title="Pegar lista desde Excel">
            <ClipboardPaste className="w-3 h-3" /> Pegar Excel
          </button>
          <button onClick={() => { setAdding(!adding); setShowPaste(false); }} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
            <Plus className="w-3 h-3" /> Agregar
          </button>
        </div>
      </div>

      {/* Importación masiva desde Excel */}
      {showPaste && (
        <div className="glass-card p-4 space-y-3 border border-cyan-500/20 bg-cyan-500/[0.03]">
          <p className="text-xs text-cyan-300 font-medium">Pegar historial laboral desde Excel</p>
          <p className="text-[10px] text-gray-500">
            Copiá las filas del Excel y pegálas acá. Formatos soportados:
            <br />· <span className="text-gray-400">Empleador | CUIT | Fecha Desde | Fecha Hasta</span> (4 columnas)
            <br />· <span className="text-gray-400">Empleador | Fecha Desde | Fecha Hasta</span> (3 columnas)
            <br />· <span className="text-gray-400">Fecha Desde | Fecha Hasta</span> (2 columnas)
            <br />Fechas: <span className="text-gray-400">MM/AAAA</span> · <span className="text-gray-400">DD/MM/AAAA</span> · <span className="text-gray-400">AAAA-MM-DD</span>
            <br />Cuando la fecha es <span className="text-gray-400">MM/AAAA</span>: <b>Desde</b> = día 1 del mes, <b>Hasta</b> = último día del mes.
          </p>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            className="input-dark text-xs font-mono w-full"
            rows={6}
            placeholder={'LEDESMA SOCIEDAD AN\t30-50125030-5\t06/2012\t10/2016\nAPRILE RAUL\t58831139\t01/1993\t02/1993'}
          />
          {pasteText && (
            <p className="text-[10px] text-gray-400">
              {parsePasteLines(pasteText).length} fila(s) válida(s) detectada(s)
            </p>
          )}
          {importResult && (
            <p className={`text-xs font-medium ${importResult.err > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              ✓ {importResult.ok} importado(s){importResult.err > 0 ? ` · ${importResult.err} con error` : ''}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowPaste(false)} className="btn-secondary text-xs px-3 py-1.5">Cancelar</button>
            <button
              onClick={handleBulkImport}
              disabled={importing || !parsePasteLines(pasteText).length}
              className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
            >
              {importing && <Loader2 className="w-3 h-3 animate-spin" />}
              Importar {parsePasteLines(pasteText).length > 0 ? `(${parsePasteLines(pasteText).length})` : ''}
            </button>
          </div>
        </div>
      )}

      {/* Formulario de nuevo aporte */}
      {adding && (
        <div className="glass-card p-4 space-y-3 border-blue-500/20">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-3">
              <input
                type="text"
                value={newAporte.empleador}
                onChange={e => setNewAporte({ ...newAporte, empleador: e.target.value })}
                className="input-dark text-sm"
                placeholder="Empleador / Empresa"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Desde</label>
              <input type="date" value={newAporte.fecha_desde} onChange={e => setNewAporte({ ...newAporte, fecha_desde: e.target.value })} className="input-dark text-sm" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Hasta</label>
              <input type="date" value={newAporte.fecha_hasta} onChange={e => setNewAporte({ ...newAporte, fecha_hasta: e.target.value })} className="input-dark text-sm" />
            </div>
            <div className="flex flex-col gap-2 justify-center">
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                <input type="checkbox" checked={newAporte.es_antes_0993} onChange={e => setNewAporte({ ...newAporte, es_antes_0993: e.target.checked })} className="accent-blue-500" />
                Antes 09/93
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                <input type="checkbox" checked={newAporte.es_simultaneo} onChange={e => setNewAporte({ ...newAporte, es_simultaneo: e.target.checked })} className="accent-amber-500" />
                Simultáneo
              </label>
            </div>
          </div>
          <input
            type="text"
            value={newAporte.observaciones}
            onChange={e => setNewAporte({ ...newAporte, observaciones: e.target.value })}
            className="input-dark text-sm"
            placeholder="Observaciones (opcional)"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="btn-secondary text-xs px-3 py-1.5">Cancelar</button>
            <button onClick={handleAdd} disabled={!newAporte.fecha_desde || !newAporte.fecha_hasta} className="btn-primary text-xs px-3 py-1.5">Guardar</button>
          </div>
        </div>
      )}

      {/* Tabla de aportes */}
      {aportes.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left text-[10px] text-gray-500 uppercase tracking-wider py-2 px-3">Empleador</th>
                <th className="text-left text-[10px] text-gray-500 uppercase tracking-wider py-2 px-3">Desde</th>
                <th className="text-left text-[10px] text-gray-500 uppercase tracking-wider py-2 px-3">Hasta</th>
                <th className="text-center text-[10px] text-gray-500 uppercase tracking-wider py-2 px-3">Meses</th>
                <th className="text-center text-[10px] text-gray-500 uppercase tracking-wider py-2 px-3">Antes 09/93</th>
                <th className="text-center text-[10px] text-gray-500 uppercase tracking-wider py-2 px-3">Simult.</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {aportes.map(a => (
                <tr key={a.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="py-2.5 px-3 text-white font-medium">{a.empleador || '—'}</td>
                  <td className="py-2.5 px-3 text-gray-400">{a.fecha_desde ? new Date(a.fecha_desde).toLocaleDateString('es-AR') : '—'}</td>
                  <td className="py-2.5 px-3 text-gray-400">{a.fecha_hasta ? new Date(a.fecha_hasta).toLocaleDateString('es-AR') : '—'}</td>
                  <td className="py-2.5 px-3 text-center text-white font-mono">{a.total_meses}</td>
                  <td className="py-2.5 px-3 text-center">
                    {a.es_antes_0993 ? <CheckCircle className="w-4 h-4 text-blue-400 mx-auto" /> : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {a.es_simultaneo ? <AlertCircle className="w-4 h-4 text-amber-400 mx-auto" /> : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="py-2.5 px-3">
                    <button onClick={() => onRemove(a.id)} className="p-1 hover:bg-red-500/10 rounded-lg text-gray-600 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8">
          <Briefcase className="w-8 h-8 text-gray-700 mx-auto mb-2" />
          <p className="text-xs text-gray-500">No hay aportes registrados</p>
        </div>
      )}

      {/* Resumen de aportes */}
      {resumen && aportes.length > 0 && (
        <div className="glass-card p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Resumen de Servicios</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
              <p className="text-lg font-bold text-white">{resumen.totalMeses}</p>
              <p className="text-[10px] text-gray-500">Total Meses</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 text-center">
              <p className="text-lg font-bold text-amber-400">-{resumen.mesesSimultaneos}</p>
              <p className="text-[10px] text-gray-500">Simultáneos</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 text-center">
              <p className="text-lg font-bold text-blue-400">{resumen.mesesAntes0993}</p>
              <p className="text-[10px] text-gray-500">Antes 09/93</p>
            </div>
            {sexo === 'MUJER' && (
              <div className="p-3 rounded-xl bg-pink-500/5 border border-pink-500/10 text-center">
                <p className="text-lg font-bold text-pink-400">+{resumen.mesesHijos}</p>
                <p className="text-[10px] text-gray-500">Por Hijos ({hijos})</p>
              </div>
            )}
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-center">
              <p className="text-lg font-bold text-emerald-400">{resumen.totalServicios}</p>
              <p className="text-[10px] text-gray-500">Total Servicios</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-center">
              <p className="text-lg font-bold text-emerald-400">{resumen.totalAniosServicios}a</p>
              <p className="text-[10px] text-gray-500">Años Servicios</p>
            </div>
            <div className={`p-3 rounded-xl text-center ${resumen.faltanMeses > 0 ? 'bg-red-500/5 border border-red-500/10' : 'bg-emerald-500/5 border border-emerald-500/10'}`}>
              <p className={`text-lg font-bold ${resumen.faltanMeses > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {resumen.faltanMeses > 0 ? resumen.faltanMeses : '✓'}
              </p>
              <p className="text-[10px] text-gray-500">{resumen.faltanMeses > 0 ? 'Faltan Meses' : 'Completo'}</p>
            </div>
            {resumen.faltanMeses > 0 && (
              <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/10 text-center">
                <p className="text-lg font-bold text-purple-400">${(resumen.costoTotal27705 / 1000000).toFixed(1)}M</p>
                <p className="text-[10px] text-gray-500">Costo 27.705</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
