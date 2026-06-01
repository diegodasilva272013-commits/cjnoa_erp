import { useState, useEffect } from 'react';
import { Save, User, Calendar, Clock, FileText, AlertTriangle } from 'lucide-react';
import Modal from '../Modal';
import {
  TareaPrevisional, ClientePrevisional,
  PrioridadTarea, EstadoTarea,
  PRIORIDAD_LABELS, ESTADO_TAREA_LABELS,
} from '../../types/previsional';
import { useAuth } from '../../context/AuthContext';
import { usePerfilesList } from '../../hooks/usePerfilesList';

interface Props {
  open: boolean;
  onClose: () => void;
  tarea: TareaPrevisional | null;
  clientes: ClientePrevisional[];
  onSave: (data: Partial<TareaPrevisional>, id?: string) => Promise<boolean>;
}

const PRIORIDADES: PrioridadTarea[] = ['alta', 'media', 'sin_prioridad'];
const ESTADOS: EstadoTarea[] = ['pendiente', 'en_curso', 'completada'];

export default function TareaModal({ open, onClose, tarea, clientes, onSave }: Props) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const { perfiles, loading: loadingPerfiles } = usePerfilesList();
  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    avance: '',
    cliente_prev_id: '',
    estado: 'pendiente' as EstadoTarea,
    prioridad: 'sin_prioridad' as PrioridadTarea,
    fecha_limite: '',
    responsable_id: '',
    responsable_nombre: '',
    derivada_a: '',
    cargo_hora: '',
    cargo_hora_fecha: '',
    observaciones_demora: '',
  });

  useEffect(() => {
    if (tarea) {
      setForm({
        titulo: tarea.titulo,
        descripcion: tarea.descripcion || '',
        avance: tarea.avance || '',
        cliente_prev_id: tarea.cliente_prev_id || '',
        estado: tarea.estado,
        prioridad: tarea.prioridad,
        fecha_limite: tarea.fecha_limite || '',
        responsable_id: tarea.responsable_id || '',
        responsable_nombre: tarea.responsable_nombre || '',
        derivada_a: tarea.derivada_a || '',
        cargo_hora: tarea.cargo_hora || '',
        cargo_hora_fecha: tarea.cargo_hora_fecha || '',
        observaciones_demora: tarea.observaciones_demora || '',
      });
    } else {
      setForm({
        titulo: '', descripcion: '', avance: '', cliente_prev_id: '',
        estado: 'pendiente', prioridad: 'sin_prioridad', fecha_limite: '',
        responsable_id: '', responsable_nombre: '', derivada_a: '', cargo_hora: '', cargo_hora_fecha: '',
        observaciones_demora: '',
      });
    }
  }, [tarea, open]);

  const handleSave = async () => {
    if (!form.titulo.trim()) return;
    setSaving(true);
    const data: Partial<TareaPrevisional> = {
      ...form,
      cliente_prev_id: form.cliente_prev_id || null,
      descripcion: form.descripcion || null,
      avance: form.avance || null,
      fecha_limite: form.fecha_limite || null,
      responsable_id: form.responsable_id || null,
      responsable_nombre: form.responsable_nombre || null,
      derivada_a: form.derivada_a || null,
      cargo_hora: form.cargo_hora || null,
      cargo_hora_fecha: form.cargo_hora_fecha || null,
      observaciones_demora: form.observaciones_demora || null,
      ...(tarea ? {} : { created_by: user?.id }),
    };
    const ok = await onSave(data, tarea?.id);
    setSaving(false);
    if (ok) onClose();
  };

  // Verificar si está vencida
  const isVencida = form.fecha_limite && new Date(form.fecha_limite) < new Date() && form.estado !== 'completada';

  return (
    <Modal open={open} onClose={onClose} title={tarea ? 'Editar Tarea' : 'Nueva Tarea'} subtitle="Seguimiento Previsional" maxWidth="max-w-2xl">
      <div className="space-y-4">
        {/* Alerta vencida */}
        {isVencida && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            <AlertTriangle className="w-4 h-4" /> Esta tarea está vencida
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Título *</label>
          <input
            type="text"
            value={form.titulo}
            onChange={e => setForm({ ...form, titulo: e.target.value })}
            className="input-dark font-medium"
            placeholder="Ej: Cargar aportes SICAM"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Cliente</label>
            <select
              value={form.cliente_prev_id}
              onChange={e => setForm({ ...form, cliente_prev_id: e.target.value })}
              className="select-dark"
            >
              <option value="">Sin cliente</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>{c.apellido_nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Asignado a (responsable) *</label>
            <select
              value={form.responsable_id}
              onChange={e => {
                const id = e.target.value;
                const p = perfiles.find(x => x.id === id);
                setForm({ ...form, responsable_id: id, responsable_nombre: p?.nombre || '' });
              }}
              className="select-dark"
            >
              <option value="">— Sin asignar —</option>
              {perfiles.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}{p.rol ? ` · ${p.rol}` : ''}</option>
              ))}
            </select>
            {loadingPerfiles && <p className="text-[10px] text-gray-500 mt-1">Cargando usuarios…</p>}
            {!loadingPerfiles && perfiles.length === 0 && (
              <p className="text-[10px] text-amber-400 mt-1">No se encontraron usuarios activos. Verificá permisos en Supabase.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Derivada a (opcional)</label>
            <select
              value={form.derivada_a}
              onChange={e => setForm({ ...form, derivada_a: e.target.value })}
              className="select-dark"
            >
              <option value="">Sin derivar</option>
              {perfiles.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}{p.rol ? ` · ${p.rol}` : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Prioridad</label>
            <select
              value={form.prioridad}
              onChange={e => setForm({ ...form, prioridad: e.target.value as PrioridadTarea })}
              className="select-dark"
            >
              {PRIORIDADES.map(p => (
                <option key={p} value={p}>{PRIORIDAD_LABELS[p]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Estado</label>
            <select
              value={form.estado}
              onChange={e => setForm({ ...form, estado: e.target.value as EstadoTarea })}
              className="select-dark"
            >
              {ESTADOS.map(e => (
                <option key={e} value={e}>{ESTADO_TAREA_LABELS[e]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              <Calendar className="w-3 h-3 inline mr-1" /> Fecha Límite
            </label>
            <input
              type="date"
              value={form.fecha_limite}
              onChange={e => setForm({ ...form, fecha_limite: e.target.value })}
              className="input-dark"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              <Clock className="w-3 h-3 inline mr-1" /> Cargo / Hora
            </label>
            <input
              type="text"
              value={form.cargo_hora}
              onChange={e => setForm({ ...form, cargo_hora: e.target.value })}
              className="input-dark"
              placeholder="Ej: 14:00 - Perez"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Descripción</label>
          <textarea
            rows={2}
            value={form.descripcion}
            onChange={e => setForm({ ...form, descripcion: e.target.value })}
            className="input-dark resize-none"
            placeholder="Descripción de la tarea..."
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Avance / Notas</label>
          <textarea
            rows={2}
            value={form.avance}
            onChange={e => setForm({ ...form, avance: e.target.value })}
            className="input-dark resize-none"
            placeholder="Avance de la tarea..."
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            <AlertTriangle className="w-3 h-3 inline mr-1" /> Observaciones de Demora
          </label>
          <input
            type="text"
            value={form.observaciones_demora}
            onChange={e => setForm({ ...form, observaciones_demora: e.target.value })}
            className="input-dark"
            placeholder="Motivo de demora (si aplica)"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-6 border-t border-white/5 mt-6">
        <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
        <button
          onClick={handleSave}
          disabled={saving || !form.titulo.trim()}
          className="btn-primary flex-1 flex items-center justify-center gap-2"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {tarea ? 'Guardar Cambios' : 'Crear Tarea'}
        </button>
      </div>
    </Modal>
  );
}
