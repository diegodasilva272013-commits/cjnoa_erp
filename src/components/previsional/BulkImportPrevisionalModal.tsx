import { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, X, Folder } from 'lucide-react';
import Modal from '../Modal';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { parseFichaWorkbook, ParsedFicha } from '../../lib/previsionalImport';

interface Props {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}

interface FileResult {
  name: string;
  status: 'pending' | 'parsing' | 'inserting' | 'ok' | 'error';
  message?: string;
  parsed?: ParsedFicha;
}

function isExcelName(name: string) {
  const n = name.toLowerCase();
  return (n.endsWith('.xlsx') || n.endsWith('.xls')) && !n.startsWith('~$');
}

// Recorre recursivamente un FileSystemEntry (drag&drop de carpeta) y junta los .xlsx
async function readEntryRecursive(entry: any, out: File[]): Promise<void> {
  if (!entry) return;
  if (entry.isFile) {
    await new Promise<void>((resolve) => {
      entry.file((f: File) => {
        if (isExcelName(f.name)) out.push(f);
        resolve();
      }, () => resolve());
    });
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const readBatch = (): Promise<any[]> =>
      new Promise((resolve) => reader.readEntries((entries: any[]) => resolve(entries), () => resolve([])));
    let batch = await readBatch();
    while (batch.length) {
      for (const e of batch) await readEntryRecursive(e, out);
      batch = await readBatch();
    }
  }
}

export default function BulkImportPrevisionalModal({ open, onClose, onImported }: Props) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function reset() {
    setFiles([]);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
    if (folderRef.current) folderRef.current.value = '';
  }

  function setSelected(list: File[]) {
    const filtered = list.filter(f => isExcelName(f.name));
    setFiles(filtered.map(f => ({ name: f.name, status: 'pending' })));
    (window as any).__pendingFichaFiles = filtered;
    if (list.length && !filtered.length) {
      showToast('No se encontraron archivos .xlsx en la selección', 'error');
    }
  }

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || []);
    if (!list.length) return;
    setSelected(list);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const items = e.dataTransfer?.items;
    const collected: File[] = [];
    if (items && items.length && (items[0] as any).webkitGetAsEntry) {
      const entries: any[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = (items[i] as any).webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }
      for (const entry of entries) await readEntryRecursive(entry, collected);
    } else {
      for (const f of Array.from(e.dataTransfer?.files || [])) collected.push(f);
    }
    setSelected(collected);
  }

  async function processAll() {
    const list: File[] = (window as any).__pendingFichaFiles || [];
    if (!list.length) return;
    setBusy(true);
    const results: FileResult[] = list.map(f => ({ name: f.name, status: 'pending' }));
    setFiles([...results]);

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      // Parse
      results[i] = { ...results[i], status: 'parsing' };
      setFiles([...results]);
      let parsed: ParsedFicha;
      try {
        const buf = await file.arrayBuffer();
        parsed = parseFichaWorkbook(buf);
      } catch (e: any) {
        results[i] = { ...results[i], status: 'error', message: 'Error leyendo archivo: ' + (e?.message || e) };
        setFiles([...results]);
        continue;
      }
      if (!parsed.cliente.apellido_nombre) {
        results[i] = { ...results[i], status: 'error', message: 'No se pudo extraer APELLIDO Y NOMBRE.' };
        setFiles([...results]);
        continue;
      }

      // Insert
      results[i] = { ...results[i], status: 'inserting', parsed };
      setFiles([...results]);

      // Detectar duplicado por CUIL si existe
      let existingId: string | null = null;
      if (parsed.cliente.cuil) {
        const { data: dup } = await supabase
          .from('clientes_previsional')
          .select('id')
          .eq('cuil', parsed.cliente.cuil)
          .maybeSingle();
        if (dup?.id) existingId = dup.id;
      }

      let clienteId: string | null = existingId;
      // Construir payload limpio: SIN columnas generadas ni metadatos.
      const FORBIDDEN = new Set([
        'id', 'created_at', 'created_by', 'updated_at', 'updated_by',
        'saldo_pendiente', 'tiempo_en_pipeline',
        'pipeline_fecha_ingreso', 'pipeline_fecha_cobro', 'pipeline_fecha_finalizado',
      ]);
      const ALLOWED_NUM = new Set(['hijos','meses_moratoria_24476','meses_moratoria_27705','cobro_total','monto_cobrado','score_probabilidad']);
      const safePayload: Record<string, any> = {};
      for (const [k, v] of Object.entries(parsed.cliente)) {
        if (FORBIDDEN.has(k)) continue;
        if (v === undefined) continue;
        if (ALLOWED_NUM.has(k)) {
          if (v == null || typeof v !== 'number' || !isFinite(v)) safePayload[k] = 0;
          else safePayload[k] = v;
        } else {
          safePayload[k] = v;
        }
      }
      if (existingId) {
        const { error } = await supabase
          .from('clientes_previsional')
          .update(safePayload)
          .eq('id', existingId);
        if (error) {
          const detail = [error.message, (error as any).details, (error as any).hint].filter(Boolean).join(' · ');
          results[i] = { ...results[i], status: 'error', message: 'Error al actualizar: ' + detail };
          setFiles([...results]);
          continue;
        }
      } else {
        const { data, error } = await supabase
          .from('clientes_previsional')
          .insert(safePayload)
          .select('id')
          .single();
        if (error || !data) {
          const detail = [error?.message, (error as any)?.details, (error as any)?.hint].filter(Boolean).join(' · ');
          results[i] = { ...results[i], status: 'error', message: 'Error al insertar: ' + (detail || 'sin id') };
          setFiles([...results]);
          continue;
        }
        clienteId = data.id;
      }

      // Aportes: si es nuevo, insertar todos. Si existía, reemplazar para evitar duplicados.
      if (clienteId && parsed.aportes.length > 0) {
        if (existingId) {
          await supabase.from('aportes_laborales').delete().eq('cliente_prev_id', clienteId);
        }
        const rows = parsed.aportes.map(a => ({ ...a, cliente_prev_id: clienteId }));
        const { error: aErr } = await supabase.from('aportes_laborales').insert(rows);
        if (aErr) {
          results[i] = { ...results[i], status: 'error', message: 'Cliente OK, pero aportes fallaron: ' + aErr.message };
          setFiles([...results]);
          continue;
        }
      }

      results[i] = {
        ...results[i],
        status: 'ok',
        message: existingId
          ? `Actualizado (${parsed.aportes.length} aportes)`
          : `Creado (${parsed.aportes.length} aportes)`,
      };
      setFiles([...results]);
    }

    setBusy(false);
    const okCount = results.filter(r => r.status === 'ok').length;
    const errCount = results.filter(r => r.status === 'error').length;
    showToast(`Importación finalizada: ${okCount} OK, ${errCount} errores`, errCount ? 'error' : 'success');
    onImported?.();
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Importar fichas desde Excel" subtitle="Cargá uno o más archivos, o una carpeta completa (formato FICHA ULTRA COMPLETA)" maxWidth="max-w-2xl">
      <div className="p-6 space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`rounded-xl border-2 border-dashed p-6 text-center transition-all ${dragOver ? 'border-violet-400 bg-violet-500/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            onChange={handleSelect}
            disabled={busy}
            className="hidden"
            id="bulk-ficha-input"
          />
          {/* @ts-expect-error webkitdirectory no está en los tipos pero funciona en Chromium/Firefox */}
          <input
            ref={folderRef}
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            onChange={handleSelect}
            disabled={busy}
            className="hidden"
            id="bulk-ficha-folder"
          />
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-gray-400" />
            <p className="text-sm text-white font-medium">Arrastrá una carpeta o archivos acá</p>
            <p className="text-xs text-gray-500">Solo se procesan archivos .xlsx / .xls (los demás se ignoran).</p>
            <div className="flex gap-2 mt-2">
              <label htmlFor="bulk-ficha-input" className="cursor-pointer text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5" /> Elegir archivos
              </label>
              <label htmlFor="bulk-ficha-folder" className="cursor-pointer text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5" /> Elegir carpeta
              </label>
            </div>
          </div>
        </div>

        {files.length > 0 && (
          <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <FileSpreadsheet className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-white truncate">{f.name}</p>
                  {f.message && <p className={`text-[10px] mt-0.5 ${f.status === 'error' ? 'text-red-400' : 'text-gray-500'}`}>{f.message}</p>}
                </div>
                <div className="flex-shrink-0">
                  {f.status === 'pending' && <span className="text-[10px] text-gray-500">En cola</span>}
                  {(f.status === 'parsing' || f.status === 'inserting') && <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />}
                  {f.status === 'ok' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {f.status === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="text-xs text-gray-500 hover:text-white px-3 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" /> {busy ? 'Procesando...' : 'Cerrar'}
          </button>
          <button
            type="button"
            onClick={processAll}
            disabled={busy || files.length === 0}
            className="btn-primary text-xs px-4 py-2 disabled:opacity-50 flex items-center gap-1.5"
          >
            {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importando…</> : <><Upload className="w-3.5 h-3.5" /> Importar {files.length > 0 ? `(${files.length})` : ''}</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}
