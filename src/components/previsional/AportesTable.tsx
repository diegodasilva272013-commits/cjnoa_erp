import { useState, useEffect } from 'react';
import { Plus, Trash2, Briefcase, AlertCircle, CheckCircle, ClipboardPaste, Loader2, Pencil, X } from 'lucide-react';
import { AporteLaboral, calcularResumenAportes, SexoCliente, COSTO_MENSUAL_27705, formatFechaLocal } from '../../types/previsional';

interface Props {
  aportes: AporteLaboral[];
  loading: boolean;
  hijos: number;
  sexo: SexoCliente | null;
  meses24476?: number;
  onAdd: (a: Partial<AporteLaboral>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  onUpdate: (id: string, a: Partial<AporteLaboral>) => Promise<boolean>;
  onRemoveAll: () => Promise<void>;
}

// Calcula cuántos meses de un período caen antes del 30/09/1993
function calcMesesAntes0993(desde: string, hasta: string): number {
  if (!desde || !hasta) return 0;
  const limite = new Date(1993, 8, 30); // 30/09/1993
  const d = new Date(desde);
  const h = new Date(hasta);
  if (d > limite) return 0;
  const hEfectivo = h < limite ? h : limite;
  return Math.max(0, (hEfectivo.getFullYear() - d.getFullYear()) * 12 + (hEfectivo.getMonth() - d.getMonth()) + (hEfectivo.getDate() - d.getDate() > 15 ? 1 : 0));
}

export default function AportesTable({ aportes, loading, hijos, sexo, meses24476 = 0, onAdd, onRemove, onUpdate, onRemoveAll }: Props) {
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
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // Edición inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<AporteLaboral>>({});

  const startEdit = (a: AporteLaboral) => {
    const mesesAntes = calcMesesAntes0993(a.fecha_desde, a.fecha_hasta);
    const esSimultCalc = aportes.some(
      o => o.id !== a.id && o.fecha_desde <= a.fecha_hasta && o.fecha_hasta >= a.fecha_desde
    );
    setEditingId(a.id);
    setEditForm({
      empleador: a.empleador || '',
      fecha_desde: a.fecha_desde,
      fecha_hasta: a.fecha_hasta,
      es_antes_0993: a.meses_antes_0993 != null ? a.es_antes_0993 : (mesesAntes > 0),
      es_simultaneo: a.meses_simultaneo != null ? a.es_simultaneo : esSimultCalc,
      meses_antes_0993: a.meses_antes_0993 ?? null,
      meses_simultaneo: a.meses_simultaneo ?? null,
      observaciones: a.observaciones || '',
    });
  };
  const cancelEdit = () => { setEditingId(null); setEditForm({}); };
  const saveEdit = async () => {
    if (!editingId) return;
    // Cuando el toggle es NO, guardar 0 explícito para que calcularResumenAportes
    // no caiga en el fallback automático (que detectaría superposición de todas formas).
    // Cuando el toggle es SÍ sin override manual, guardar null (usa cálculo automático).
    const payload: Partial<AporteLaboral> = {
      ...editForm,
      meses_antes_0993: editForm.es_antes_0993
        ? (editForm.meses_antes_0993 ?? null)
        : 0,
      meses_simultaneo: editForm.es_simultaneo
        ? (editForm.meses_simultaneo ?? null)
        : 0,
    };
    const ok = await onUpdate(editingId, payload);
    if (ok) { setEditingId(null); setEditForm({}); }
  };

  const handleDeleteAll = async () => {
    if (!confirmDeleteAll) { setConfirmDeleteAll(true); setTimeout(() => setConfirmDeleteAll(false), 3000); return; }
    setDeletingAll(true);
    await onRemoveAll();
    setDeletingAll(false);
    setConfirmDeleteAll(false);
  };

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
      .filter(a => a.fecha_desde && a.fecha_hasta)
      .map(a => ({
        ...a,
        es_antes_0993: a.fecha_desde! < '1993-09-30',
      }));
  };

  const handleBulkImport = async () => {
    const rows = parsePasteLines(pasteText);
    if (!rows.length) return;
    setImporting(true);

    // Detectar simultáneos: un período es simultáneo si se superpone con otro
    // (dentro del batch O con aportes ya existentes)
    const todos = [
      ...aportes.map(a => ({ desde: a.fecha_desde, hasta: a.fecha_hasta })),
      ...rows.map(r => ({ desde: r.fecha_desde!, hasta: r.fecha_hasta! })),
    ];
    const overlaps = (d1: string, h1: string, d2: string, h2: string) => d1 <= h2 && h1 >= d2;
    const rowsConSimult = rows.map(r => ({
      ...r,
      es_simultaneo: todos.some(
        other =>
          other.desde !== r.fecha_desde || other.hasta !== r.fecha_hasta
            ? overlaps(r.fecha_desde!, r.fecha_hasta!, other.desde, other.hasta)
            : false
      ),
    }));

    let ok = 0; let err = 0;
    for (const row of rowsConSimult) {
      const success = await onAdd(row);
      if (success) ok++; else err++;
    }
    setImporting(false);
    setImportResult({ ok, err });
    setPasteText('');
    setTimeout(() => { setImportResult(null); setShowPaste(false); }, 3000);
  };

  const resumen = sexo
    ? calcularResumenAportes(aportes, hijos, sexo, 0, meses24476)
    : null;

  // Formato años + meses: "17a 0m"
  const fmtAM = (m: number): string => {
    const a = Math.floor(Math.abs(m) / 12);
    const mes = Math.abs(m) % 12;
    return `${a}a ${mes}m`;
  };

  // Barra de progreso animada
  const pct = resumen ? Math.min(100, (resumen.totalServicios / 360) * 100) : 0;
  const [barWidth, setBarWidth] = useState(0);
  useEffect(() => {
    if (!resumen) return;
    const t = setTimeout(() => setBarWidth(pct), 200);
    return () => clearTimeout(t);
  }, [pct, resumen]);

  // Gauge SVG
  const gaugeR = 68;
  const gaugeCirc = 2 * Math.PI * gaugeR;
  const gaugeArcLen = gaugeCirc * barWidth / 100;

  // Filas del breakdown
  const conclusionRows: { label: string; meses: number; color: string; tw: string }[] = resumen ? [
    { label: 'Aportes', meses: resumen.totalMeses - resumen.mesesSimultaneos, color: '#60a5fa', tw: 'from-blue-500 to-blue-400' },
    { label: 'Moratoria 24.476', meses: meses24476, color: '#fbbf24', tw: 'from-amber-500 to-amber-400' },
    ...(sexo === 'MUJER' && hijos > 0 ? [{ label: `Hijos (${hijos})`, meses: resumen.mesesHijos, color: '#f472b6', tw: 'from-pink-500 to-pink-400' }] : []),
  ] : [];

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
          {aportes.length > 0 && (
            <button
              onClick={handleDeleteAll}
              disabled={deletingAll}
              className={`text-xs px-3 py-1.5 flex items-center gap-1.5 rounded-lg border transition-colors ${
                confirmDeleteAll
                  ? 'bg-red-500/20 border-red-500/40 text-red-400'
                  : 'bg-white/[0.03] border-white/10 text-gray-500 hover:text-red-400 hover:border-red-500/20'
              }`}
              title="Eliminar todos los aportes"
            >
              {deletingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              {confirmDeleteAll ? 'Confirmar' : 'Eliminar todos'}
            </button>
          )}
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
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {aportes.map(a => {
                // Siempre calcular desde fechas; meses_antes_0993/meses_simultaneo son overrides manuales
                const mesesAntesCalc = calcMesesAntes0993(a.fecha_desde, a.fecha_hasta);
                const esSimultCalc = aportes.some(o => o.id !== a.id && o.fecha_desde <= a.fecha_hasta && o.fecha_hasta >= a.fecha_desde);
                const mesesAntes = a.meses_antes_0993 ?? mesesAntesCalc;
                const esSimult = a.meses_simultaneo != null ? a.es_simultaneo : esSimultCalc;
                const mesesSimult = a.meses_simultaneo ?? (esSimult ? a.total_meses : 0);
                return editingId === a.id ? (
                  <tr key={a.id} className="border-b border-blue-500/20 bg-blue-500/[0.03]">
                    <td colSpan={7} className="py-2 px-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="sm:col-span-3">
                          <input type="text" value={editForm.empleador as string} onChange={e => setEditForm({ ...editForm, empleador: e.target.value })} className="input-dark text-sm w-full" placeholder="Empleador" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Desde</label>
                          <input type="date" value={editForm.fecha_desde} onChange={e => setEditForm({ ...editForm, fecha_desde: e.target.value })} className="input-dark text-sm w-full" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Hasta</label>
                          <input type="date" value={editForm.fecha_hasta} onChange={e => setEditForm({ ...editForm, fecha_hasta: e.target.value })} className="input-dark text-sm w-full" />
                        </div>
                        <div className="flex flex-col gap-1.5 justify-center">
                          <button
                            type="button"
                            onClick={() => setEditForm(f => ({ ...f, es_antes_0993: !f.es_antes_0993 }))}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition-colors w-full ${
                              editForm.es_antes_0993
                                ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                                : 'bg-white/[0.03] border-white/10 text-gray-500'
                            }`}
                          >
                            <span>Antes 09/93</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${editForm.es_antes_0993 ? 'bg-blue-500/30 text-blue-200' : 'bg-white/5 text-gray-600'}`}>
                              {editForm.es_antes_0993 ? 'SÍ' : 'NO'}
                            </span>
                          </button>
                          {editForm.es_antes_0993 && (
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] text-blue-400 whitespace-nowrap">Meses ant. 09/93</label>
                              <input
                                type="number" min={0} max={600}
                                value={editForm.meses_antes_0993 ?? ''}
                                placeholder={String(calcMesesAntes0993(editForm.fecha_desde || '', editForm.fecha_hasta || ''))}
                                onChange={e => setEditForm(f => ({ ...f, meses_antes_0993: e.target.value === '' ? null : Number(e.target.value) }))}
                                className="input-dark text-sm w-full text-blue-300"
                              />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditForm(f => ({ ...f, es_simultaneo: !f.es_simultaneo }))}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition-colors w-full ${
                              editForm.es_simultaneo
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                : 'bg-white/[0.03] border-white/10 text-gray-500'
                            }`}
                          >
                            <span>Simultáneo</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${editForm.es_simultaneo ? 'bg-amber-500/30 text-amber-200' : 'bg-white/5 text-gray-600'}`}>
                              {editForm.es_simultaneo ? 'SÍ' : 'NO'}
                            </span>
                          </button>
                          {editForm.es_simultaneo && (
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] text-amber-400 whitespace-nowrap">Meses simult.</label>
                              <input
                                type="number" min={0} max={600}
                                value={editForm.meses_simultaneo ?? ''}
                                placeholder={String((editForm as any).total_meses || 0)}
                                onChange={e => setEditForm(f => ({ ...f, meses_simultaneo: e.target.value === '' ? null : Number(e.target.value) }))}
                                className="input-dark text-sm w-full text-amber-300"
                              />
                            </div>
                          )}
                        </div>
                        <div className="sm:col-span-2">
                          <input type="text" value={editForm.observaciones as string} onChange={e => setEditForm({ ...editForm, observaciones: e.target.value })} className="input-dark text-sm w-full" placeholder="Observaciones" />
                        </div>
                        <div className="flex gap-2 items-center justify-end sm:col-span-3">
                          <button onClick={cancelEdit} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"><X className="w-3 h-3" /> Cancelar</button>
                          <button onClick={saveEdit} className="btn-primary text-xs px-3 py-1.5">Guardar</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={a.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-3 text-white font-medium">{a.empleador || '—'}</td>
                    <td className="py-2.5 px-3 text-gray-400">{formatFechaLocal(a.fecha_desde)}</td>
                    <td className="py-2.5 px-3 text-gray-400">{formatFechaLocal(a.fecha_hasta)}</td>
                    <td className="py-2.5 px-3 text-center text-white font-mono">{a.total_meses}</td>
                    {/* Antes 09/93 — clic para toggle */}
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => onUpdate(a.id, { es_antes_0993: !a.es_antes_0993 })}
                        title={a.es_antes_0993 ? 'Quitar marca Antes 09/93' : 'Marcar como Antes 09/93'}
                        className={`px-2 py-0.5 rounded-md text-xs font-mono font-medium transition-colors ${
                          a.es_antes_0993
                            ? 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25'
                            : 'text-gray-600 hover:text-blue-400 hover:bg-blue-500/10'
                        }`}
                      >
                        {a.es_antes_0993 ? <>{mesesAntes}<span className="text-[10px] ml-0.5 opacity-70">m</span></> : '—'}
                      </button>
                    </td>
                    {/* Simultáneo — clic para toggle */}
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => onUpdate(a.id, { es_simultaneo: !a.es_simultaneo })}
                        title={a.es_simultaneo ? 'Quitar marca Simultáneo' : 'Marcar como Simultáneo'}
                        className={`px-2 py-0.5 rounded-md text-xs font-mono font-medium transition-colors ${
                          a.es_simultaneo
                            ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                            : 'text-gray-600 hover:text-amber-400 hover:bg-amber-500/10'
                        }`}
                      >
                        {a.es_simultaneo ? <>{mesesSimult}<span className="text-[10px] ml-0.5 opacity-70">m</span></> : '—'}
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(a)} className="p-1.5 hover:bg-blue-500/10 rounded-lg text-blue-500/60 hover:text-blue-400 transition-colors" title="Editar fila">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => onRemove(a.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-gray-600 hover:text-red-400 transition-colors" title="Eliminar">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8">
          <Briefcase className="w-8 h-8 text-gray-700 mx-auto mb-2" />
          <p className="text-xs text-gray-500">No hay aportes registrados</p>
        </div>
      )}

      {/* ── Conclusión animada ── */}
      {resumen && aportes.length > 0 && (
        <div className="glass-card overflow-hidden animate-slide-up">

          {/* Header */}
          <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2.5">
            <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-blue-400 to-emerald-500 shadow-lg shadow-emerald-500/30" />
            <h4 className="text-xs font-bold text-white/80 tracking-[0.15em] uppercase">Conclusión</h4>
          </div>

          <div className="p-4 space-y-2.5">

            {/* ── Grid 2 col: acumulados (izq) · correcciones/info (der) ── */}
            <div className="grid grid-cols-2 gap-2">

              {/* Aportes historial neto */}
              <div className="animate-slide-up p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 flex flex-col gap-0.5" style={{ animationDelay: '0ms' }}>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Aportes</p>
                <p className="text-base font-bold text-blue-300">{fmtAM(resumen.totalMeses - resumen.mesesSimultaneos)}</p>
              </div>

              {/* Simultáneos – informativos */}
              <div className="animate-slide-up p-3 rounded-xl bg-rose-500/5 border border-rose-500/10 flex flex-col gap-0.5" style={{ animationDelay: '40ms' }}>
                <p className="text-[10px] text-rose-400/70 uppercase tracking-wide">− Simultáneos</p>
                <p className="text-base font-bold text-rose-300">{fmtAM(resumen.mesesSimultaneos)}</p>
              </div>

              {/* Moratoria 24.476 */}
              <div className="animate-slide-up p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 flex flex-col gap-0.5" style={{ animationDelay: '80ms' }}>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                  <span className="text-amber-400 mr-0.5">+</span>Moratoria 24.476
                </p>
                <p className="text-base font-bold text-amber-300">{fmtAM(resumen.meses24476)}</p>
              </div>

              {/* Antes 09/93 – informativo */}
              <div className="animate-slide-up p-3 rounded-xl bg-rose-500/5 border border-rose-500/10 flex flex-col gap-0.5" style={{ animationDelay: '120ms' }}>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Antes 09/93</p>
                <p className="text-base font-bold text-rose-200/60">{fmtAM(resumen.mesesAntes0993)}</p>
              </div>

              {/* Hijos – solo MUJER */}
              {sexo === 'MUJER' && (
                <>
                  <div className="animate-slide-up p-3 rounded-xl bg-pink-500/5 border border-pink-500/10 flex flex-col gap-0.5" style={{ animationDelay: '160ms' }}>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                      <span className="text-pink-400 mr-0.5">+</span>Hijos ({hijos})
                    </p>
                    <p className="text-base font-bold text-pink-300">{fmtAM(resumen.mesesHijos)}</p>
                  </div>
                  <div />
                </>
              )}
            </div>

            {/* ── Total strip ── */}
            <div
              className="animate-scale-in rounded-xl bg-gradient-to-r from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 px-4 py-3 flex items-center justify-between"
              style={{ animationDelay: '200ms' }}
            >
              <div>
                <p className="text-[10px] text-emerald-400/60 font-medium uppercase tracking-widest mb-0.5">Total Aportes</p>
                <p className="text-2xl font-bold text-emerald-300">{fmtAM(resumen.totalServicios)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-600">de 30 años</p>
                <p className="text-xl font-bold text-white/70">
                  {pct.toFixed(0)}<span className="text-xs font-normal text-gray-500">%</span>
                </p>
              </div>
            </div>

            {/* ── Barra de progreso animada ── */}
            <div className="space-y-1 animate-fade-in" style={{ animationDelay: '240ms' }}>
              <div className="h-3 rounded-full bg-white/[0.04] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 via-emerald-400 to-teal-400"
                  style={{
                    width: `${barWidth}%`,
                    transition: 'width 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    boxShadow: '0 0 12px rgba(52,211,153,0.5)',
                  }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-gray-700 px-0.5 select-none">
                <span>0</span>
                <span>10a</span>
                <span>20a</span>
                <span>30a</span>
              </div>
            </div>

            {/* ── Falta / Completo ── */}
            {resumen.faltanMeses > 0 ? (
              <div
                className="rounded-xl border border-red-500/15 bg-red-500/5 px-4 py-3 animate-slide-up"
                style={{ animationDelay: '280ms' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-red-400/80 uppercase tracking-widest">Falta · Ley 27.705</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 font-medium">
                    {resumen.faltanMeses} cuotas
                  </span>
                </div>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xl font-bold text-red-300">{fmtAM(resumen.faltanMeses)}</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      ${resumen.costoMensual27705.toLocaleString('es-AR', { maximumFractionDigits: 2 })}/cuota
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-500 mb-0.5">Total estimado</p>
                    <p className="text-base font-bold text-white/80">
                      ${resumen.costoTotal27705.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-4 py-3 flex items-center gap-3 animate-scale-in"
                style={{ animationDelay: '280ms' }}
              >
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-300">¡Completo!</p>
                  <p className="text-[10px] text-gray-500">Alcanza los 30 años de aportes</p>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
