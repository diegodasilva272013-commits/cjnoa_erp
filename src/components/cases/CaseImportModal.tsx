import { useState } from 'react';
import { Upload, Download, X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';

interface CaseImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

// Plantilla / mapeo de columnas. Acepta variaciones (mayús, sin acentos, sinónimos).
const COLUMN_ALIASES: Record<string, string[]> = {
  cliente: ['cliente', 'nombre', 'nombre apellido', 'nombre y apellido', 'apellido y nombre', 'apellido nombre', 'titular'],
  telefono: ['telefono', 'teléfono', 'tel', 'celular', 'cel', 'whatsapp', 'wpp'],
  materia: ['materia', 'tema', 'fuero'],
  materia_otro: ['materia otro', 'detalle materia', 'otro', 'subtipo'],
  caratula: ['caratula', 'carátula', 'caso', 'titulo', 'título'],
  expediente: ['expediente', 'expte', 'nro expediente', 'numero de expediente'],
  radicado: ['radicado', 'juzgado', 'tribunal'],
  sistema: ['sistema'],
  personeria: ['personeria', 'personería', 'rol'],
  estado: ['estado', 'situacion', 'situación'],
  socio: ['socio', 'abogado', 'responsable'],
  fecha: ['fecha', 'fecha consulta', 'fecha apertura', 'fecha inicio'],
  prioridad: ['prioridad'],
  honorarios_monto: ['honorarios', 'honorarios monto', 'monto honorarios', 'monto', 'pactado', 'total acordado', 'total'],
  modalidad_pago: ['modalidad pago', 'modalidad', 'forma de pago', 'pago'],
  observaciones: ['observaciones', 'notas', 'comentarios', 'descripcion', 'descripción'],
  apoderado: ['apoderado'],
  url_drive: ['url drive', 'drive', 'link drive', 'carpeta'],
  estadisticas: ['estadisticas', 'estadísticas', 'estado general', 'resumen'],
};

const TEMPLATE_HEADERS = [
  'Cliente', 'Teléfono', 'Materia', 'Materia Otro',
  'Carátula', 'Expediente', 'Radicado', 'Sistema', 'Personería',
  'Estado', 'Socio', 'Fecha', 'Prioridad',
  'Honorarios', 'Modalidad Pago',
  'Observaciones', 'Apoderado', 'URL Drive', 'Estadísticas',
];

const VALID_MATERIAS = ['Jubilaciones', 'Sucesorios', 'Reajuste', 'Otro'];
const VALID_ESTADOS = ['Vino a consulta', 'Trámite no judicial', 'Cliente Judicial'];
const VALID_SOCIOS = ['Carlos', 'Diego', 'Joel', 'Otro'];
const VALID_PRIORIDADES = ['Alta', 'Media', 'Sin prioridad'];
const VALID_MODALIDADES = ['Único', 'En cuotas'];
const VALID_SISTEMAS = ['Provincial', 'Federal'];
const VALID_PERSONERIAS = ['Patrocinante', 'Apoderado', 'Personería de urgencia'];

function norm(s: string): string {
  return s.toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function findField(headers: string[], field: string): number {
  const aliases = COLUMN_ALIASES[field] || [];
  const normalizedHeaders = headers.map(h => norm(h || ''));
  for (const alias of aliases) {
    const idx = normalizedHeaders.indexOf(norm(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

function pickValid(value: string | null, valid: string[], fallback: string | null = null): string | null {
  if (!value) return fallback;
  const v = value.toString().trim();
  // case-insensitive match
  const found = valid.find(x => norm(x) === norm(v));
  return found || fallback;
}

function parseFecha(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'number') {
    // Excel serial date
    const utc = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(utc);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = v.toString().trim();
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseMonto(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = v.toString().replace(/[^\d,.\-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

interface RowResult {
  fila: number;
  cliente: string;
  ok: boolean;
  error?: string;
}

export default function CaseImportModal({ open, onClose, onImported }: CaseImportModalProps) {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  if (!open) return null;

  async function downloadTemplate() {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      TEMPLATE_HEADERS,
      [
        'ACHA SANJINES JAVIER', '3884123456', 'Otro', 'División de condominio',
        'Acha Sanjines Javier c/ ... s/ División de Condominio', '12345/2025', 'Juzgado Civil 1', 'Provincial', 'Patrocinante',
        'Cliente Judicial', 'Diego', '15/03/2025', 'Media',
        '500000', 'En cuotas',
        'Caso traído desde Notion', '', '', '',
      ],
    ]);
    ws['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Casos');
    XLSX.writeFile(wb, 'plantilla_casos_cjnoa.xlsx');
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setResults([]);
      setProgress({ done: 0, total: 0 });
    }
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setResults([]);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (rows.length < 2) {
        showToast('El archivo está vacío o no tiene datos', 'error');
        setImporting(false);
        return;
      }

      const headers = rows[0].map((h: any) => (h ?? '').toString());
      const idx = {
        cliente: findField(headers, 'cliente'),
        telefono: findField(headers, 'telefono'),
        materia: findField(headers, 'materia'),
        materia_otro: findField(headers, 'materia_otro'),
        caratula: findField(headers, 'caratula'),
        expediente: findField(headers, 'expediente'),
        radicado: findField(headers, 'radicado'),
        sistema: findField(headers, 'sistema'),
        personeria: findField(headers, 'personeria'),
        estado: findField(headers, 'estado'),
        socio: findField(headers, 'socio'),
        fecha: findField(headers, 'fecha'),
        prioridad: findField(headers, 'prioridad'),
        honorarios_monto: findField(headers, 'honorarios_monto'),
        modalidad_pago: findField(headers, 'modalidad_pago'),
        observaciones: findField(headers, 'observaciones'),
        apoderado: findField(headers, 'apoderado'),
        url_drive: findField(headers, 'url_drive'),
        estadisticas: findField(headers, 'estadisticas'),
      };

      if (idx.cliente < 0) {
        showToast('Falta la columna "Cliente" en el archivo', 'error');
        setImporting(false);
        return;
      }

      const dataRows = rows.slice(1).filter(r => (r[idx.cliente] || '').toString().trim());
      setProgress({ done: 0, total: dataRows.length });
      const localResults: RowResult[] = [];
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || null;

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const get = (k: keyof typeof idx) => idx[k] >= 0 ? (row[idx[k]] ?? '').toString().trim() : '';
        const cliente = get('cliente');
        const fila = i + 2; // +1 header, +1 base 1
        try {
          // 1) Cliente: buscar por nombre exacto, o crear
          const tel = get('telefono') || null;
          const { data: existing } = await supabase
            .from('clientes').select('id').ilike('nombre_apellido', cliente).maybeSingle();
          let clienteId: string;
          if (existing) {
            clienteId = existing.id;
          } else {
            const { data: created, error: cErr } = await supabase
              .from('clientes')
              .insert({ nombre_apellido: cliente, telefono: tel, created_by: userId })
              .select('id').single();
            if (cErr || !created) throw new Error(cErr?.message || 'No se pudo crear el cliente');
            clienteId = created.id;
          }

          // 2) Caso
          const materia = pickValid(get('materia'), VALID_MATERIAS, 'Otro') || 'Otro';
          const materiaOtro = materia === 'Otro' ? (get('materia_otro') || get('materia') || null) : null;
          const estado = pickValid(get('estado'), VALID_ESTADOS, 'Cliente Judicial') || 'Cliente Judicial';
          const socio = pickValid(get('socio'), VALID_SOCIOS, 'Diego') || 'Diego';
          const prioridad = pickValid(get('prioridad'), VALID_PRIORIDADES, 'Sin prioridad') || 'Sin prioridad';
          const sistema = pickValid(get('sistema'), VALID_SISTEMAS, null);
          const personeria = pickValid(get('personeria'), VALID_PERSONERIAS, null);
          const modalidad = pickValid(get('modalidad_pago'), VALID_MODALIDADES, null);
          const honorarios = parseMonto(get('honorarios_monto'));

          const casoData: Record<string, any> = {
            cliente_id: clienteId,
            materia,
            materia_otro: materiaOtro,
            estado,
            socio,
            fecha: parseFecha(get('fecha')),
            prioridad,
            honorarios_monto: honorarios,
            modalidad_pago: modalidad,
            sistema,
            personeria,
            caratula: get('caratula') || null,
            expediente: get('expediente') || null,
            radicado: get('radicado') || null,
            apoderado: get('apoderado') || null,
            url_drive: get('url_drive') || null,
            observaciones: get('observaciones') || null,
            estadisticas: get('estadisticas') || null,
            archivado: false,
            created_by: userId,
          };

          const { error: caseErr } = await supabase.from('casos').insert(casoData);
          if (caseErr) throw new Error(caseErr.message);

          localResults.push({ fila, cliente, ok: true });
        } catch (e: any) {
          localResults.push({ fila, cliente, ok: false, error: e?.message || 'Error desconocido' });
        }
        setProgress({ done: i + 1, total: dataRows.length });
        setResults([...localResults]);
      }

      const ok = localResults.filter(r => r.ok).length;
      const fail = localResults.length - ok;
      showToast(`${ok} caso(s) importado(s)${fail ? `, ${fail} con error` : ''}`, fail ? 'error' : 'success');
      onImported();
    } catch (e: any) {
      showToast(`Error al leer el archivo: ${e?.message || e}`, 'error');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-card w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white">Importar casos desde Excel</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-4">
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-sm text-blue-200">
            <p className="font-semibold mb-1">Cómo migrar desde Notion:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs text-blue-200/90">
              <li>Descargá la plantilla con el botón abajo.</li>
              <li>Abrila en Excel/Google Sheets.</li>
              <li>Copiá los datos desde Notion (o desde tu base de Notion exportada como CSV) y pegalos respetando las columnas.</li>
              <li>Guardá como .xlsx y subila acá.</li>
            </ol>
            <p className="mt-2 text-xs">
              <strong>Solo "Cliente" es obligatorio.</strong> Las demás columnas se completan si están; los valores inválidos toman defaults razonables.
            </p>
          </div>

          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
          >
            <Download className="w-4 h-4" /> Descargar plantilla
          </button>

          <label className="block">
            <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 cursor-pointer w-fit">
              <Upload className="w-4 h-4" />
              <span>{file ? file.name : 'Elegir archivo .xlsx'}</span>
            </div>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
          </label>

          {file && !importing && results.length === 0 && (
            <button
              onClick={handleImport}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              Importar
            </button>
          )}

          {importing && (
            <div className="flex items-center gap-2 text-sm text-violet-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              Importando {progress.done}/{progress.total}…
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1 text-emerald-300">
                  <CheckCircle2 className="w-4 h-4" />
                  {results.filter(r => r.ok).length} ok
                </span>
                {results.some(r => !r.ok) && (
                  <span className="flex items-center gap-1 text-red-300">
                    <AlertCircle className="w-4 h-4" />
                    {results.filter(r => !r.ok).length} con error
                  </span>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10">
                <table className="w-full text-xs">
                  <thead className="bg-white/5 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left text-gray-400">Fila</th>
                      <th className="px-2 py-1 text-left text-gray-400">Cliente</th>
                      <th className="px-2 py-1 text-left text-gray-400">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className="border-t border-white/5">
                        <td className="px-2 py-1 text-gray-300">{r.fila}</td>
                        <td className="px-2 py-1 text-gray-200">{r.cliente}</td>
                        <td className={`px-2 py-1 ${r.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                          {r.ok ? 'OK' : (r.error || 'Error')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={onClose} className="btn-secondary text-sm">Cerrar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
