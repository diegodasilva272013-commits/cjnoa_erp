import { useEffect, useState } from 'react';
import { Save, User, Phone, MapPin, CreditCard, FileText, DollarSign, Briefcase } from 'lucide-react';
import Modal from '../Modal';
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

// Layout y look replicados del modal provincial (CaseModal) — distinto contenido (datos federales).
export default function FichaFederalModal({ ficha, onClose, onSave }: Props) {
  const [saving, setSaving] = useState(false);
  const isEditing = !!ficha;

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
    upd('tipo_caso', has ? current.filter(x => x !== t) : [...current, t]);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!(form.apellido_nombre || '').trim()) return;
    setSaving(true);
    const payload: Partial<ClienteFederal> = {
      ...form,
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
    <Modal
      open
      onClose={onClose}
      title={isEditing ? 'Editar Caso Federal' : 'Nuevo Caso Federal'}
      subtitle={
        isEditing && ficha
          ? `${ficha.apellido_nombre}${ficha.numero_expediente ? ` · Expte ${ficha.numero_expediente}` : ''}`
          : 'Registrar un nuevo caso federal'
      }
      maxWidth="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Datos del cliente */}
        <Section title="Datos del Cliente">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Apellido y Nombre" required>
              <input
                type="text"
                value={form.apellido_nombre || ''}
                onChange={e => upd('apellido_nombre', e.target.value)}
                className="input-dark"
                placeholder="Ej: Pérez Juan"
                required
              />
            </Field>
            <Field label="CUIL" icon={<CreditCard className="w-3.5 h-3.5" />}>
              <input
                type="text"
                value={form.cuil || ''}
                onChange={e => upd('cuil', e.target.value)}
                className="input-dark"
                placeholder="20-12345678-9"
              />
            </Field>
            <Field label="Fecha de nacimiento">
              <input
                type="date"
                value={form.fecha_nacimiento || ''}
                onChange={e => upd('fecha_nacimiento', e.target.value || null)}
                className="input-dark"
              />
            </Field>
            <Field label="Sexo">
              <select
                value={form.sexo || ''}
                onChange={e => upd('sexo', (e.target.value || null) as ClienteFederal['sexo'])}
                className="select-dark"
              >
                <option value="">—</option>
                {SEXOS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Teléfono" icon={<Phone className="w-3.5 h-3.5" />}>
              <input
                type="text"
                value={form.telefono || ''}
                onChange={e => upd('telefono', e.target.value)}
                className="input-dark"
                placeholder="Ej: 388-4001234"
              />
            </Field>
            <Field label="Dirección" icon={<MapPin className="w-3.5 h-3.5" />}>
              <input
                type="text"
                value={form.direccion || ''}
                onChange={e => upd('direccion', e.target.value)}
                className="input-dark"
                placeholder="Calle, número, ciudad"
              />
            </Field>
          </div>
        </Section>

        {/* Credenciales / accesos */}
        <Section title="Credenciales ANSES / AFIP">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Clave Social">
              <input
                type="text"
                value={form.clave_social || ''}
                onChange={e => upd('clave_social', e.target.value)}
                className="input-dark"
                placeholder="Clave para mi.anses"
              />
            </Field>
            <Field label="Clave Fiscal">
              <input
                type="text"
                value={form.clave_fiscal || ''}
                onChange={e => upd('clave_fiscal', e.target.value)}
                className="input-dark"
                placeholder="Clave fiscal AFIP"
              />
            </Field>
          </div>
        </Section>

        {/* Información del caso */}
        <Section title="Información del Caso">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Número de expediente" icon={<FileText className="w-3.5 h-3.5" />}>
              <input
                type="text"
                value={form.numero_expediente || ''}
                onChange={e => upd('numero_expediente', e.target.value)}
                className="input-dark"
                placeholder="Ej: 12345/2026"
              />
            </Field>
            <Field label="Pipeline" icon={<Briefcase className="w-3.5 h-3.5" />}>
              <select
                value={form.pipeline || 'activo'}
                onChange={e => upd('pipeline', e.target.value as PipelineFederal)}
                className="select-dark"
              >
                {PIPELINE_FEDERAL_ORDERED.map(p => (
                  <option key={p} value={p}>{PIPELINE_FEDERAL_LABELS[p]}</option>
                ))}
              </select>
            </Field>
            <Field label="Captado por" icon={<User className="w-3.5 h-3.5" />}>
              <input
                type="text"
                value={form.captado_por || ''}
                onChange={e => upd('captado_por', e.target.value)}
                className="input-dark"
                placeholder="Nombre del captador"
              />
            </Field>
            <Field label="Fecha último contacto">
              <input
                type="date"
                value={form.fecha_ultimo_contacto || ''}
                onChange={e => upd('fecha_ultimo_contacto', e.target.value || null)}
                className="input-dark"
              />
            </Field>
          </div>

          <div className="mt-4">
            <label className="block text-sm text-gray-400 mb-1.5">
              Tipo de caso <span className="text-gray-600">(marcá los que apliquen)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TIPO_CASO_FEDERAL_ORDERED.map(t => {
                const checked = (form.tipo_caso || []).includes(t);
                return (
                  <label
                    key={t}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors text-sm ${
                      checked
                        ? 'border-blue-400/60 bg-blue-500/10 text-blue-200'
                        : 'border-white/[0.08] bg-white/[0.03] text-gray-300 hover:border-white/20'
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
              <div className="mt-3">
                <Field label="Otros (especificar)">
                  <input
                    type="text"
                    value={form.tipo_caso_otros || ''}
                    onChange={e => upd('tipo_caso_otros', e.target.value)}
                    className="input-dark"
                    placeholder="Detalle"
                  />
                </Field>
              </div>
            )}
          </div>

          <div className="mt-4">
            <Field label="URL Drive del caso">
              <input
                type="url"
                value={form.url_drive || ''}
                onChange={e => upd('url_drive', e.target.value)}
                className="input-dark"
                placeholder="https://drive.google.com/..."
              />
            </Field>
          </div>
        </Section>

        {/* Honorarios / cobro */}
        <Section title="Honorarios">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Cobro total" icon={<DollarSign className="w-3.5 h-3.5" />}>
              <input
                type="number"
                value={form.cobro_total ?? 0}
                onChange={e => upd('cobro_total', Number(e.target.value))}
                className="input-dark"
                min={0}
                placeholder="0"
              />
            </Field>
            <Field label="Monto cobrado" icon={<DollarSign className="w-3.5 h-3.5" />}>
              <input
                type="number"
                value={form.monto_cobrado ?? 0}
                onChange={e => upd('monto_cobrado', Number(e.target.value))}
                className="input-dark"
                min={0}
                placeholder="0"
              />
            </Field>
          </div>
        </Section>

        {/* Resumen y conclusiones */}
        <Section title="Resumen y Seguimiento">
          <div className="space-y-4">
            <Field label="Resumen / informe">
              <textarea
                value={form.resumen_informe || ''}
                onChange={e => upd('resumen_informe', e.target.value)}
                className="input-dark min-h-[90px]"
                placeholder="Síntesis del caso, antecedentes, posiciones, etc."
              />
            </Field>
            <Field label="Conclusión">
              <textarea
                value={form.conclusion || ''}
                onChange={e => upd('conclusion', e.target.value)}
                className="input-dark min-h-[70px]"
                placeholder="Diagnóstico y estrategia"
              />
            </Field>
            <Field label="Situación actual">
              <textarea
                value={form.situacion_actual || ''}
                onChange={e => upd('situacion_actual', e.target.value)}
                className="input-dark min-h-[70px]"
                placeholder="Dónde estamos hoy"
              />
            </Field>
          </div>
        </Section>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-sm"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !(form.apellido_nombre || '').trim()}
            className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Crear caso federal'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Field({
  label, required, icon, children,
}: {
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1.5 flex items-center gap-1.5">
        {icon}
        <span>{label}{required && <span className="text-red-400 ml-0.5">*</span>}</span>
      </label>
      {children}
    </div>
  );
}
