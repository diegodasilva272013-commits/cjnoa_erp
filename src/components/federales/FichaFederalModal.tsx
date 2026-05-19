import { useEffect, useState } from 'react';
import { X, Save, User, FileText, Phone, MapPin, CreditCard, Briefcase } from 'lucide-react';
import {
  ClienteFederal,
  PipelineFederal,
  PIPELINE_FEDERAL_ORDERED,
  PIPELINE_FEDERAL_LABELS,
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

export default function FichaFederalModal({ ficha, onClose, onSave }: Props) {
  const [tab, setTab] = useState<'datos' | 'cobro'>('datos');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<ClienteFederal>>({
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
  });

  useEffect(() => {
    if (ficha) setForm({ ...ficha });
  }, [ficha]);

  const upd = <K extends keyof ClienteFederal>(k: K, v: ClienteFederal[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const toggleTipo = (t: TipoCasoFederal) => {
    const current = (form.tipo_caso || []) as TipoCasoFederal[];
    const has = current.includes(t);
    const next = has ? current.filter(x => x !== t) : [...current, t];
    upd('tipo_caso', next);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!(form.apellido_nombre || '').trim()) return;
    setSaving(true);
    const payload: Partial<ClienteFederal> = {
      ...form,
      // sanitiza vacíos a null para campos opcionales
      cuil: form.cuil || null,
      clave_social: form.clave_social || null,
      clave_fiscal: form.clave_fiscal || null,
      sexo: form.sexo || null,
      direccion: form.direccion || null,
      telefono: form.telefono || null,
      numero_expediente: form.numero_expediente || null,
      tipo_caso_otros: form.tipo_caso_otros || null,
      resumen_informe: form.resumen_informe || null,
      conclusion: form.conclusion || null,
      situacion_actual: form.situacion_actual || null,
      captado_por: form.captado_por || null,
      url_drive: form.url_drive || null,
      cobro_total: Number(form.cobro_total) || 0,
      monto_cobrado: Number(form.monto_cobrado) || 0,
    };
    const ok = await onSave(payload, ficha?.id);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">
              {ficha ? 'Editar caso federal' : 'Nuevo caso federal'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 px-5">
          <button
            type="button"
            onClick={() => setTab('datos')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'datos' ? 'border-blue-400 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <User className="w-4 h-4 inline mr-1" />
            Datos personales
          </button>
          <button
            type="button"
            onClick={() => setTab('cobro')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'cobro' ? 'border-blue-400 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-1" />
            Pipeline y cobro
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'datos' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Apellido y Nombre *" required>
                  <input
                    value={form.apellido_nombre || ''}
                    onChange={e => upd('apellido_nombre', e.target.value)}
                    className="input"
                    required
                  />
                </Field>
                <Field label="CUIL" icon={<CreditCard className="w-3.5 h-3.5" />}>
                  <input
                    value={form.cuil || ''}
                    onChange={e => upd('cuil', e.target.value)}
                    className="input"
                    placeholder="20-12345678-9"
                  />
                </Field>
                <Field label="Clave Social">
                  <input value={form.clave_social || ''} onChange={e => upd('clave_social', e.target.value)} className="input" />
                </Field>
                <Field label="Clave Fiscal">
                  <input value={form.clave_fiscal || ''} onChange={e => upd('clave_fiscal', e.target.value)} className="input" />
                </Field>
                <Field label="Fecha nacimiento">
                  <input
                    type="date"
                    value={form.fecha_nacimiento || ''}
                    onChange={e => upd('fecha_nacimiento', e.target.value || null)}
                    className="input"
                  />
                </Field>
                <Field label="Sexo">
                  <select
                    value={form.sexo || ''}
                    onChange={e => upd('sexo', (e.target.value || null) as ClienteFederal['sexo'])}
                    className="input"
                  >
                    <option value="">—</option>
                    {SEXOS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Teléfono" icon={<Phone className="w-3.5 h-3.5" />}>
                  <input value={form.telefono || ''} onChange={e => upd('telefono', e.target.value)} className="input" />
                </Field>
                <Field label="Dirección" icon={<MapPin className="w-3.5 h-3.5" />}>
                  <input value={form.direccion || ''} onChange={e => upd('direccion', e.target.value)} className="input" />
                </Field>
              </div>

              {/* Específicos federal */}
              <div className="border-t border-gray-700 pt-3 mt-2">
                <h3 className="text-xs uppercase tracking-wider text-blue-400 font-bold mb-2">Datos del caso</h3>
                <Field label="Número de expediente">
                  <input
                    value={form.numero_expediente || ''}
                    onChange={e => upd('numero_expediente', e.target.value)}
                    className="input"
                    placeholder="Ej: 12345/2026"
                  />
                </Field>

                <label className="block text-xs font-semibold text-gray-400 mt-3 mb-1">Tipo de caso (marcar los que apliquen)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {TIPO_CASO_FEDERAL_ORDERED.map(t => {
                    const checked = (form.tipo_caso || []).includes(t);
                    return (
                      <label
                        key={t}
                        className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer transition-colors text-sm ${
                          checked
                            ? 'border-blue-400/60 bg-blue-500/10 text-blue-200'
                            : 'border-gray-700 bg-gray-800/40 text-gray-300 hover:border-gray-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTipo(t)}
                          className="accent-blue-500"
                        />
                        {TIPO_CASO_FEDERAL_LABELS[t]}
                      </label>
                    );
                  })}
                </div>

                {(form.tipo_caso || []).includes('otros') && (
                  <div className="mt-2">
                    <Field label="Otros (especificar)">
                      <input
                        value={form.tipo_caso_otros || ''}
                        onChange={e => upd('tipo_caso_otros', e.target.value)}
                        className="input"
                      />
                    </Field>
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'cobro' && (
            <>
              <Field label="Pipeline">
                <select
                  value={form.pipeline || 'activo'}
                  onChange={e => upd('pipeline', e.target.value as PipelineFederal)}
                  className="input"
                >
                  {PIPELINE_FEDERAL_ORDERED.map(p => (
                    <option key={p} value={p}>{PIPELINE_FEDERAL_LABELS[p]}</option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Cobro total ($)">
                  <input
                    type="number"
                    value={form.cobro_total ?? 0}
                    onChange={e => upd('cobro_total', Number(e.target.value))}
                    className="input"
                    min={0}
                  />
                </Field>
                <Field label="Monto cobrado ($)">
                  <input
                    type="number"
                    value={form.monto_cobrado ?? 0}
                    onChange={e => upd('monto_cobrado', Number(e.target.value))}
                    className="input"
                    min={0}
                  />
                </Field>
                <Field label="Captado por">
                  <input value={form.captado_por || ''} onChange={e => upd('captado_por', e.target.value)} className="input" />
                </Field>
                <Field label="Fecha último contacto">
                  <input
                    type="date"
                    value={form.fecha_ultimo_contacto || ''}
                    onChange={e => upd('fecha_ultimo_contacto', e.target.value || null)}
                    className="input"
                  />
                </Field>
                <Field label="URL Drive">
                  <input value={form.url_drive || ''} onChange={e => upd('url_drive', e.target.value)} className="input" />
                </Field>
              </div>
              <Field label="Resumen / informe">
                <textarea
                  value={form.resumen_informe || ''}
                  onChange={e => upd('resumen_informe', e.target.value)}
                  className="input min-h-[80px]"
                />
              </Field>
              <Field label="Conclusión">
                <textarea
                  value={form.conclusion || ''}
                  onChange={e => upd('conclusion', e.target.value)}
                  className="input min-h-[60px]"
                />
              </Field>
              <Field label="Situación actual">
                <textarea
                  value={form.situacion_actual || ''}
                  onChange={e => upd('situacion_actual', e.target.value)}
                  className="input min-h-[60px]"
                />
              </Field>
            </>
          )}

          {/* Footer */}
          <div className="sticky bottom-0 -mx-5 -mb-5 px-5 py-3 bg-gray-900/95 border-t border-gray-700 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-gray-600 text-gray-300 hover:bg-gray-800">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !(form.apellido_nombre || '').trim()}
              className="px-4 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {ficha ? 'Guardar cambios' : 'Crear caso federal'}
            </button>
          </div>
        </form>
      </div>

      {/* helper styles (Tailwind escapes) */}
      <style>{`
        .input { width: 100%; padding: 6px 10px; background: rgba(31,41,55,0.6); border: 1px solid rgb(55 65 81); border-radius: 6px; color: #fff; font-size: 13px; outline: none; }
        .input:focus { border-color: rgb(59 130 246); }
      `}</style>
    </div>
  );
}

function Field({ label, children, required, icon }: { label: string; children: React.ReactNode; required?: boolean; icon?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-400 mb-1 flex items-center gap-1">
        {icon}{label}{required && <span className="text-red-400">*</span>}
      </span>
      {children}
    </label>
  );
}
