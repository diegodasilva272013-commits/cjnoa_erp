import { useEffect, useState } from 'react';
import { X, Loader2, Briefcase, ExternalLink } from 'lucide-react';
import {
  ClienteFederal,
  PipelineFederal,
  PIPELINE_FEDERAL_ORDERED,
  PIPELINE_FEDERAL_LABELS,
  PIPELINE_FEDERAL_COLORS,
  TipoCasoFederal,
  TIPO_CASO_FEDERAL_ORDERED,
  TIPO_CASO_FEDERAL_LABELS,
} from '../../types/federales';

interface Props {
  ficha: ClienteFederal | null; // null = creación
  onClose: () => void;
  onSave: (data: Partial<ClienteFederal>, id?: string) => Promise<boolean>;
}

const SEXOS = ['HOMBRE', 'MUJER'] as const;

/**
 * Replica EXACTA del look del modal de Casos Provinciales
 * (CaseDetailModal dentro de pages/CasosGenerales.tsx).
 * Mismo header (badges + acciones + cerrar), mismos inputs (.inp/.sel),
 * mismas labels en uppercase tracking-widest, mismo grid 2-cols y toggles.
 * Contenido = campos federales (no se altera DB ni la vista principal).
 */
export default function FichaFederalModal({ ficha, onClose, onSave }: Props) {
  const isNew = !ficha;
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Partial<ClienteFederal>>(
    ficha ?? {
      apellido_nombre: '',
      cuil: '',
      clave_social: '',
      clave_fiscal: '',
      fecha_nacimiento: null,
      sexo: null,
      direccion: '',
      telefono: '',
      numero_expediente: '',
      tipo_caso: [],
      tipo_caso_otros: '',
      resumen_informe: '',
      conclusion: '',
      fecha_ultimo_contacto: null,
      situacion_actual: '',
      captado_por: '',
      pipeline: 'activo',
      cobro_total: 0,
      monto_cobrado: 0,
      url_drive: '',
    }
  );

  useEffect(() => {
    if (ficha) setEditing({ ...ficha });
  }, [ficha]);

  const set = <K extends keyof ClienteFederal>(key: K, val: ClienteFederal[K]) =>
    setEditing(p => ({ ...p, [key]: val }));

  const toggleTipo = (t: TipoCasoFederal) => {
    const current = (editing.tipo_caso || []) as TipoCasoFederal[];
    const has = current.includes(t);
    set('tipo_caso', has ? current.filter(x => x !== t) : [...current, t]);
  };

  async function handleSave() {
    if (!(editing.apellido_nombre || '').trim()) return;
    setSaving(true);
    const payload: Partial<ClienteFederal> = {
      ...editing,
      cuil: editing.cuil || null,
      clave_social: editing.clave_social || null,
      clave_fiscal: editing.clave_fiscal || null,
      sexo: editing.sexo || null,
      direccion: editing.direccion || null,
      telefono: editing.telefono || null,
      numero_expediente: editing.numero_expediente || null,
      tipo_caso_otros: editing.tipo_caso_otros || null,
      resumen_informe: editing.resumen_informe || null,
      conclusion: editing.conclusion || null,
      situacion_actual: editing.situacion_actual || null,
      captado_por: editing.captado_por || null,
      url_drive: editing.url_drive || null,
      cobro_total: Number(editing.cobro_total) || 0,
      monto_cobrado: Number(editing.monto_cobrado) || 0,
    };
    const ok = await onSave(payload, ficha?.id);
    setSaving(false);
    if (ok) onClose();
  }

  // Clases idénticas al modal provincial:
  const inp = 'bg-[#1a1a20] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/60 w-full';
  const sel = `${inp} [&>option]:bg-[#141418] [&>option]:text-white`;
  const lbl = 'text-[10px] text-gray-500 uppercase tracking-widest block mb-1';

  const pipeline = (editing.pipeline ?? 'activo') as PipelineFederal;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content sm:max-w-3xl">
        {/* ─── Header (igual al provincial) ─── */}
        <div className="shrink-0 px-5 sm:px-6 pt-4 pb-3 border-b border-white/[0.06] bg-gradient-to-br from-[#141418]/95 to-[#111115]/95">
          {/* Fila 1: badges + cerrar */}
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <span className={`badge border ${PIPELINE_FEDERAL_COLORS[pipeline]}`}>
                {PIPELINE_FEDERAL_LABELS[pipeline]}
              </span>
              <span className="badge border bg-blue-500/10 text-blue-300 border-blue-500/20 flex items-center gap-1">
                <Briefcase className="w-3 h-3" /> Federal
              </span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-300 text-gray-400 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* Fila 2: título + expediente */}
          <h2 className="text-base font-bold text-white leading-tight">
            {isNew ? (editing.apellido_nombre || 'Nuevo caso federal') : editing.apellido_nombre}
          </h2>
          {editing.numero_expediente && (
            <p className="text-xs text-gray-500 font-mono mt-0.5">Expte: {editing.numero_expediente}</p>
          )}
        </div>

        {/* ─── Body ─── */}
        <div className="px-5 sm:px-6 py-5 space-y-4">
          {/* Datos personales */}
          <div>
            <label className={lbl}>Apellido y Nombre *</label>
            <input
              className={inp}
              value={editing.apellido_nombre ?? ''}
              onChange={e => set('apellido_nombre', e.target.value)}
              placeholder="Ej: Pérez Juan"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>CUIL</label>
              <input
                className={inp}
                value={editing.cuil ?? ''}
                onChange={e => set('cuil', e.target.value || null)}
                placeholder="20-12345678-9"
              />
            </div>
            <div>
              <label className={lbl}>Número de expediente</label>
              <input
                className={inp}
                value={editing.numero_expediente ?? ''}
                onChange={e => set('numero_expediente', e.target.value || null)}
                placeholder="12345/2026"
              />
            </div>
            <div>
              <label className={lbl}>Fecha de nacimiento</label>
              <input
                type="date"
                className={inp}
                value={editing.fecha_nacimiento ?? ''}
                onChange={e => set('fecha_nacimiento', e.target.value || null)}
              />
            </div>
            <div>
              <label className={lbl}>Sexo</label>
              <select
                className={sel}
                value={editing.sexo ?? ''}
                onChange={e => set('sexo', (e.target.value || null) as ClienteFederal['sexo'])}
              >
                <option value="">—</option>
                {SEXOS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Teléfono</label>
              <input
                type="tel"
                className={inp}
                value={editing.telefono ?? ''}
                onChange={e => set('telefono', e.target.value || null)}
                placeholder="Ej: 388-4001234"
              />
            </div>
            <div>
              <label className={lbl}>Dirección</label>
              <input
                className={inp}
                value={editing.direccion ?? ''}
                onChange={e => set('direccion', e.target.value || null)}
                placeholder="Calle, número, ciudad"
              />
            </div>
          </div>

          {/* Credenciales */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Clave Social (mi.anses)</label>
              <input
                className={inp}
                value={editing.clave_social ?? ''}
                onChange={e => set('clave_social', e.target.value || null)}
              />
            </div>
            <div>
              <label className={lbl}>Clave Fiscal (AFIP)</label>
              <input
                className={inp}
                value={editing.clave_fiscal ?? ''}
                onChange={e => set('clave_fiscal', e.target.value || null)}
              />
            </div>
          </div>

          {/* Pipeline y captación */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Pipeline</label>
              <select
                className={sel}
                value={editing.pipeline ?? 'activo'}
                onChange={e => set('pipeline', e.target.value as PipelineFederal)}
              >
                {PIPELINE_FEDERAL_ORDERED.map(p => (
                  <option key={p} value={p}>{PIPELINE_FEDERAL_LABELS[p]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Captado por</label>
              <input
                className={inp}
                value={editing.captado_por ?? ''}
                onChange={e => set('captado_por', e.target.value || null)}
                placeholder="Nombre del captador"
              />
            </div>
            <div>
              <label className={lbl}>Fecha último contacto</label>
              <input
                type="date"
                className={inp}
                value={editing.fecha_ultimo_contacto ?? ''}
                onChange={e => set('fecha_ultimo_contacto', e.target.value || null)}
              />
            </div>
            <div>
              <label className={lbl}>URL Drive</label>
              <input
                className={inp}
                value={editing.url_drive ?? ''}
                onChange={e => set('url_drive', e.target.value || null)}
                placeholder="https://drive.google.com/..."
              />
            </div>
          </div>

          {/* Tipo de caso */}
          <div>
            <label className={lbl}>Tipo de caso (marcá los que apliquen)</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {TIPO_CASO_FEDERAL_ORDERED.map(t => {
                const checked = (editing.tipo_caso || []).includes(t);
                return (
                  <label
                    key={t}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors text-sm ${
                      checked
                        ? 'border-violet-500/60 bg-violet-500/10 text-violet-200'
                        : 'border-white/10 bg-white/[0.025] text-gray-300 hover:border-white/20'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTipo(t)}
                      className="accent-violet-500"
                    />
                    {TIPO_CASO_FEDERAL_LABELS[t]}
                  </label>
                );
              })}
            </div>
            {(editing.tipo_caso || []).includes('otros') && (
              <div className="mt-2">
                <label className={lbl}>Otros (especificar)</label>
                <input
                  className={inp}
                  value={editing.tipo_caso_otros ?? ''}
                  onChange={e => set('tipo_caso_otros', e.target.value || null)}
                  placeholder="Detalle"
                />
              </div>
            )}
          </div>

          {/* Honorarios */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Cobro total ($)</label>
              <input
                type="number"
                min={0}
                className={inp}
                value={editing.cobro_total ?? 0}
                onChange={e => set('cobro_total', Number(e.target.value))}
              />
            </div>
            <div>
              <label className={lbl}>Monto cobrado ($)</label>
              <input
                type="number"
                min={0}
                className={inp}
                value={editing.monto_cobrado ?? 0}
                onChange={e => set('monto_cobrado', Number(e.target.value))}
              />
            </div>
          </div>

          {/* Textos largos */}
          <div>
            <label className={lbl}>Resumen / informe</label>
            <textarea
              className={`${inp} resize-none`}
              rows={4}
              value={editing.resumen_informe ?? ''}
              onChange={e => set('resumen_informe', e.target.value || null)}
              placeholder="Síntesis del caso, antecedentes, posiciones, etc."
            />
          </div>
          <div>
            <label className={lbl}>Conclusión</label>
            <textarea
              className={`${inp} resize-none`}
              rows={3}
              value={editing.conclusion ?? ''}
              onChange={e => set('conclusion', e.target.value || null)}
              placeholder="Diagnóstico y estrategia"
            />
          </div>
          <div>
            <label className={lbl}>Situación actual</label>
            <textarea
              className={`${inp} resize-none`}
              rows={3}
              value={editing.situacion_actual ?? ''}
              onChange={e => set('situacion_actual', e.target.value || null)}
              placeholder="Dónde estamos hoy"
            />
          </div>

          {/* Drive link preview */}
          {editing.url_drive && (
            <a
              href={editing.url_drive}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] hover:bg-blue-500/20 transition-colors"
            >
              <ExternalLink className="w-3 h-3 shrink-0" /> Abrir carpeta en Drive
            </a>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.06]">
            <button onClick={onClose} className="btn-secondary text-sm px-4">Cerrar</button>
            <button
              onClick={handleSave}
              disabled={saving || !(editing.apellido_nombre || '').trim()}
              className="btn-primary text-sm px-4 flex items-center gap-2 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isNew ? 'Crear caso federal' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
