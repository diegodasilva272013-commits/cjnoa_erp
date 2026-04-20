import { useState, useEffect } from 'react';
import {
  User, Hash, Key, Calendar, MapPin, Phone, Baby, FileText,
  DollarSign, ExternalLink, Save, Calculator, Clock
} from 'lucide-react';
import Modal from '../Modal';
import { ClientePrevisional, calcularMoratoria, SexoCliente, PipelinePrevisional, PIPELINE_LABELS, SubEstadoPrevisional, COSTO_MENSUAL_27705 } from '../../types/previsional';
import { useAuth } from '../../context/AuthContext';
import { SOCIOS } from '../../types/database';

interface Props {
  open: boolean;
  onClose: () => void;
  cliente: ClientePrevisional | null;
  onSave: (data: Partial<ClientePrevisional>, id?: string) => Promise<boolean>;
}

const PIPELINES: PipelinePrevisional[] = ['consulta', 'seguimiento', 'ingreso', 'cobro', 'finalizado', 'descartado'];
const SUB_ESTADOS: SubEstadoPrevisional[] = ['EN PROCESO', 'EN ESPERA', 'EN PROCESO - SEGUIMIENTO EXPTE', 'EN PROCESO - REALIZAR TAREA', 'FINALIZADO', 'COBRADO'];

export default function FichaModal({ open, onClose, cliente, onSave }: Props) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<'datos' | 'moratorias' | 'seguimiento' | 'cobro'>('datos');

  const [form, setForm] = useState({
    apellido_nombre: '',
    cuil: '',
    clave_social: '',
    clave_fiscal: '',
    fecha_nacimiento: '',
    sexo: '' as SexoCliente | '',
    direccion: '',
    telefono: '',
    hijos: 0,
    resumen_informe: '',
    conclusion: '',
    fecha_ultimo_contacto: '',
    situacion_actual: '',
    captado_por: '',
    pipeline: 'consulta' as PipelinePrevisional,
    sub_estado: '' as SubEstadoPrevisional | '',
    cobro_total: 0,
    monto_cobrado: 0,
    url_drive: '',
  });

  useEffect(() => {
    if (cliente) {
      setForm({
        apellido_nombre: cliente.apellido_nombre,
        cuil: cliente.cuil || '',
        clave_social: cliente.clave_social || '',
        clave_fiscal: cliente.clave_fiscal || '',
        fecha_nacimiento: cliente.fecha_nacimiento || '',
        sexo: cliente.sexo || '',
        direccion: cliente.direccion || '',
        telefono: cliente.telefono || '',
        hijos: cliente.hijos || 0,
        resumen_informe: cliente.resumen_informe || '',
        conclusion: cliente.conclusion || '',
        fecha_ultimo_contacto: cliente.fecha_ultimo_contacto || '',
        situacion_actual: cliente.situacion_actual || '',
        captado_por: cliente.captado_por || '',
        pipeline: cliente.pipeline,
        sub_estado: cliente.sub_estado || '',
        cobro_total: cliente.cobro_total || 0,
        monto_cobrado: cliente.monto_cobrado || 0,
        url_drive: cliente.url_drive || '',
      });
    } else {
      setForm({
        apellido_nombre: '', cuil: '', clave_social: '', clave_fiscal: '',
        fecha_nacimiento: '', sexo: '', direccion: '', telefono: '', hijos: 0,
        resumen_informe: '', conclusion: '', fecha_ultimo_contacto: '',
        situacion_actual: '', captado_por: '', pipeline: 'consulta', sub_estado: '',
        cobro_total: 0, monto_cobrado: 0, url_drive: '',
      });
      setSection('datos');
    }
  }, [cliente, open]);

  // Cálculos de moratoria en vivo
  const moratoria = form.fecha_nacimiento && form.sexo
    ? calcularMoratoria(form.fecha_nacimiento, form.sexo as SexoCliente)
    : null;

  const handleSave = async () => {
    if (!form.apellido_nombre.trim()) return;
    setSaving(true);
    const data: Partial<ClientePrevisional> = {
      ...form,
      sexo: form.sexo as SexoCliente || null,
      sub_estado: form.sub_estado as SubEstadoPrevisional || null,
      updated_by: user?.id,
      ...(cliente ? {} : { created_by: user?.id }),
    };
    const ok = await onSave(data, cliente?.id);
    setSaving(false);
    if (ok) onClose();
  };

  const tabs = [
    { id: 'datos', label: 'Datos Personales', icon: User },
    { id: 'moratorias', label: 'Moratorias', icon: Calculator },
    { id: 'seguimiento', label: 'Seguimiento', icon: Clock },
    { id: 'cobro', label: 'Cobro', icon: DollarSign },
  ] as const;

  return (
    <Modal open={open} onClose={onClose} title={cliente ? 'Editar Ficha' : 'Nueva Ficha'} subtitle="Módulo Previsional" maxWidth="max-w-4xl">
      {/* Tab navigation */}
      <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl mb-6 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSection(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex-1 justify-center ${
              section === t.id
                ? 'bg-white/10 text-white shadow-lg'
                : 'text-gray-500 hover:text-white hover:bg-white/5'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Datos Personales ── */}
      {section === 'datos' && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                <User className="w-3 h-3 inline mr-1" /> Apellido y Nombre *
              </label>
              <input
                type="text"
                value={form.apellido_nombre}
                onChange={e => setForm({ ...form, apellido_nombre: e.target.value })}
                className="input-dark text-base font-semibold"
                placeholder="PEREZ JUAN CARLOS"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                <Hash className="w-3 h-3 inline mr-1" /> CUIL
              </label>
              <input
                type="text"
                value={form.cuil}
                onChange={e => setForm({ ...form, cuil: e.target.value })}
                className="input-dark font-mono"
                placeholder="20-12345678-9"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                <Phone className="w-3 h-3 inline mr-1" /> Teléfono
              </label>
              <input
                type="text"
                value={form.telefono}
                onChange={e => setForm({ ...form, telefono: e.target.value })}
                className="input-dark"
                placeholder="3884123456"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                <Key className="w-3 h-3 inline mr-1" /> Clave Social (ANSES)
              </label>
              <input
                type="text"
                value={form.clave_social}
                onChange={e => setForm({ ...form, clave_social: e.target.value })}
                className="input-dark"
                placeholder="Clave Social"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                <Key className="w-3 h-3 inline mr-1" /> Clave Fiscal (ARCA)
              </label>
              <input
                type="text"
                value={form.clave_fiscal}
                onChange={e => setForm({ ...form, clave_fiscal: e.target.value })}
                className="input-dark"
                placeholder="Clave Fiscal"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                <Calendar className="w-3 h-3 inline mr-1" /> Fecha de Nacimiento
              </label>
              <input
                type="date"
                value={form.fecha_nacimiento}
                onChange={e => setForm({ ...form, fecha_nacimiento: e.target.value })}
                className="input-dark"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Sexo</label>
              <select
                value={form.sexo}
                onChange={e => setForm({ ...form, sexo: e.target.value as SexoCliente })}
                className="select-dark"
              >
                <option value="">Seleccionar</option>
                <option value="HOMBRE">Hombre</option>
                <option value="MUJER">Mujer</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                <MapPin className="w-3 h-3 inline mr-1" /> Dirección
              </label>
              <input
                type="text"
                value={form.direccion}
                onChange={e => setForm({ ...form, direccion: e.target.value })}
                className="input-dark"
                placeholder="Dirección"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                <Baby className="w-3 h-3 inline mr-1" /> Hijos {form.sexo === 'MUJER' && <span className="text-emerald-400">(+1 año c/u)</span>}
              </label>
              <input
                type="number"
                min={0}
                value={form.hijos}
                onChange={e => setForm({ ...form, hijos: parseInt(e.target.value) || 0 })}
                className="input-dark"
              />
            </div>
          </div>

          {/* Edad e info calculada */}
          {moratoria && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <p className="text-[10px] text-gray-500 uppercase">Edad Actual</p>
                <p className="text-lg font-bold text-white">{moratoria.edadActual} años</p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <p className="text-[10px] text-gray-500 uppercase">Edad Jubilatoria</p>
                <p className="text-lg font-bold text-white">{form.sexo === 'HOMBRE' ? '65' : '60'} años</p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <p className="text-[10px] text-gray-500 uppercase">Fecha Jubilatoria</p>
                <p className="text-sm font-bold text-white">
                  {moratoria.fechaEdadJubilatoria?.toLocaleDateString('es-AR')}
                </p>
              </div>
            </div>
          )}

          {/* URL Drive */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              <ExternalLink className="w-3 h-3 inline mr-1" /> Link Carpeta Google Drive
            </label>
            <input
              type="url"
              value={form.url_drive}
              onChange={e => setForm({ ...form, url_drive: e.target.value })}
              className="input-dark"
              placeholder="https://drive.google.com/drive/folders/..."
            />
          </div>
        </div>
      )}

      {/* ── Moratorias (solo lectura, calculado automáticamente) ── */}
      {section === 'moratorias' && (
        <div className="space-y-4 animate-fade-in">
          {!moratoria ? (
            <div className="text-center py-12">
              <Calculator className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">Completá la fecha de nacimiento y sexo para ver los cálculos</p>
            </div>
          ) : (
            <>
              {/* Ley 24.476 */}
              <div className="glass-card p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Moratoria Ley 24.476</h4>
                    <p className="text-[10px] text-gray-500">Desde los 18 años hasta 09/1993</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 text-center">
                    <p className="text-2xl font-bold text-blue-400">{moratoria.meses24476}</p>
                    <p className="text-[10px] text-gray-500">Meses comprables</p>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 text-center">
                    <p className="text-2xl font-bold text-blue-400">{moratoria.anios24476}</p>
                    <p className="text-[10px] text-gray-500">Años</p>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 text-center">
                    <p className="text-2xl font-bold text-blue-400">{moratoria.mesesRestantes24476}</p>
                    <p className="text-[10px] text-gray-500">Meses restantes</p>
                  </div>
                </div>
              </div>

              {/* Ley 27.705 */}
              <div className="glass-card p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Moratoria Ley 27.705</h4>
                    <p className="text-[10px] text-gray-500">Desde los 18 años hasta 03/2012</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/10 text-center">
                    <p className="text-2xl font-bold text-purple-400">{moratoria.meses27705}</p>
                    <p className="text-[10px] text-gray-500">Meses comprables</p>
                  </div>
                  <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/10 text-center">
                    <p className="text-2xl font-bold text-purple-400">{moratoria.anios27705}</p>
                    <p className="text-[10px] text-gray-500">Años</p>
                  </div>
                  <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/10 text-center">
                    <p className="text-2xl font-bold text-purple-400">{moratoria.mesesRestantes27705}</p>
                    <p className="text-[10px] text-gray-500">Meses restantes</p>
                  </div>
                </div>
              </div>

              {/* Costo estimado */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/5 to-emerald-500/10 border border-emerald-500/20">
                <p className="text-xs text-gray-400 mb-1">Costo mensual Ley 27.705 (referencia)</p>
                <p className="text-xl font-bold text-emerald-400">
                  ${COSTO_MENSUAL_27705.toLocaleString('es-AR', { minimumFractionDigits: 2 })} <span className="text-xs text-gray-500">/ mes</span>
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Seguimiento ── */}
      {section === 'seguimiento' && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Pipeline</label>
              <select
                value={form.pipeline}
                onChange={e => setForm({ ...form, pipeline: e.target.value as PipelinePrevisional })}
                className="select-dark"
              >
                {PIPELINES.map(p => (
                  <option key={p} value={p}>{PIPELINE_LABELS[p]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Sub-estado</label>
              <select
                value={form.sub_estado}
                onChange={e => setForm({ ...form, sub_estado: e.target.value as SubEstadoPrevisional })}
                className="select-dark"
              >
                <option value="">Sin especificar</option>
                {SUB_ESTADOS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Captado por</label>
              <select
                value={form.captado_por}
                onChange={e => setForm({ ...form, captado_por: e.target.value })}
                className="select-dark"
              >
                <option value="">Seleccionar</option>
                {SOCIOS.map(s => (
                  <option key={s} value={`Reyes ${s}`}>Reyes {s}</option>
                ))}
                <option value="Campaña Fabri">Campaña Fabri</option>
                <option value="Campaña Rodri">Campaña Rodri</option>
                <option value="KARINA MAMANI">Karina Mamani</option>
                <option value="DR. AGUILAR">Dr. Aguilar</option>
                <option value="DR. MISAEL">Dr. Misael</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Fecha Último Contacto</label>
              <input
                type="date"
                value={form.fecha_ultimo_contacto}
                onChange={e => setForm({ ...form, fecha_ultimo_contacto: e.target.value })}
                className="input-dark"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Situación Actual / Paso a Seguir</label>
            <textarea
              rows={3}
              value={form.situacion_actual}
              onChange={e => setForm({ ...form, situacion_actual: e.target.value })}
              className="input-dark resize-none"
              placeholder="Descripción de la situación actual..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Resumen / Informe Administrativo</label>
            <textarea
              rows={4}
              value={form.resumen_informe}
              onChange={e => setForm({ ...form, resumen_informe: e.target.value })}
              className="input-dark resize-none"
              placeholder="Informe detallado del caso..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Conclusión</label>
            <textarea
              rows={2}
              value={form.conclusion}
              onChange={e => setForm({ ...form, conclusion: e.target.value })}
              className="input-dark resize-none"
              placeholder="Conclusión y próximos pasos..."
            />
          </div>
        </div>
      )}

      {/* ── Cobro ── */}
      {section === 'cobro' && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Cobro Total Acordado</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="number"
                  value={form.cobro_total}
                  onChange={e => setForm({ ...form, cobro_total: parseFloat(e.target.value) || 0 })}
                  className="input-dark pl-9"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Monto Cobrado</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="number"
                  value={form.monto_cobrado}
                  onChange={e => setForm({ ...form, monto_cobrado: parseFloat(e.target.value) || 0 })}
                  className="input-dark pl-9"
                />
              </div>
            </div>
          </div>

          {/* Indicador visual de cobro */}
          {form.cobro_total > 0 && (
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-white">Progreso de Cobro</p>
                <p className="text-xs text-gray-500">{Math.round((form.monto_cobrado / form.cobro_total) * 100)}%</p>
              </div>
              <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                  style={{ width: `${Math.min(100, (form.monto_cobrado / form.cobro_total) * 100)}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-lg font-bold text-white">${form.cobro_total.toLocaleString('es-AR')}</p>
                  <p className="text-[10px] text-gray-500">Total</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-emerald-400">${form.monto_cobrado.toLocaleString('es-AR')}</p>
                  <p className="text-[10px] text-gray-500">Cobrado</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-400">${Math.max(0, form.cobro_total - form.monto_cobrado).toLocaleString('es-AR')}</p>
                  <p className="text-[10px] text-gray-500">Pendiente</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-6 border-t border-white/5 mt-6">
        <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
        <button
          onClick={handleSave}
          disabled={saving || !form.apellido_nombre.trim()}
          className="btn-primary flex-1 flex items-center justify-center gap-2"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {cliente ? 'Guardar Cambios' : 'Crear Ficha'}
        </button>
      </div>
    </Modal>
  );
}
