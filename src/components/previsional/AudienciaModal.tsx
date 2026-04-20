import { useState, useEffect } from 'react';
import { Save, Calendar, Clock, MapPin } from 'lucide-react';
import Modal from '../Modal';
import { Audiencia, ClientePrevisional } from '../../types/previsional';
import { useAuth } from '../../context/AuthContext';

interface Props {
  open: boolean;
  onClose: () => void;
  audiencia: Audiencia | null;
  clientes: ClientePrevisional[];
  onSave: (data: Partial<Audiencia>, id?: string) => Promise<boolean>;
}

export default function AudienciaModal({ open, onClose, audiencia, clientes, onSave }: Props) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    cliente_prev_id: '',
    fecha: '',
    hora: '',
    juzgado: '',
    tipo: '',
    abogado_cargo: '',
    notas: '',
  });

  useEffect(() => {
    if (audiencia) {
      setForm({
        cliente_prev_id: audiencia.cliente_prev_id || '',
        fecha: audiencia.fecha || '',
        hora: audiencia.hora || '',
        juzgado: audiencia.juzgado || '',
        tipo: audiencia.tipo || '',
        abogado_cargo: audiencia.abogado_cargo || '',
        notas: audiencia.notas || '',
      });
    } else {
      setForm({ cliente_prev_id: '', fecha: '', hora: '', juzgado: '', tipo: '', abogado_cargo: '', notas: '' });
    }
  }, [audiencia, open]);

  const handleSave = async () => {
    if (!form.fecha) return;
    setSaving(true);
    const data: Partial<Audiencia> = {
      ...form,
      cliente_prev_id: form.cliente_prev_id || null,
      hora: form.hora || null,
      juzgado: form.juzgado || null,
      tipo: form.tipo || null,
      abogado_cargo: form.abogado_cargo || null,
      notas: form.notas || null,
      ...(audiencia ? {} : { created_by: user?.id }),
    };
    const ok = await onSave(data, audiencia?.id);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={audiencia ? 'Editar Audiencia' : 'Nueva Audiencia'} subtitle="Agenda Previsional" maxWidth="max-w-lg">
      <div className="space-y-4">
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              <Calendar className="w-3 h-3 inline mr-1" /> Fecha *
            </label>
            <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className="input-dark" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              <Clock className="w-3 h-3 inline mr-1" /> Hora
            </label>
            <input type="time" value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} className="input-dark" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            <MapPin className="w-3 h-3 inline mr-1" /> Juzgado
          </label>
          <input type="text" value={form.juzgado} onChange={e => setForm({ ...form, juzgado: e.target.value })} className="input-dark" placeholder="Ej: Juzgado N°3 Federal" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Tipo</label>
            <input type="text" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} className="input-dark" placeholder="Ej: Audiencia inicial" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Abogado a Cargo</label>
            <input type="text" value={form.abogado_cargo} onChange={e => setForm({ ...form, abogado_cargo: e.target.value })} className="input-dark" placeholder="Nombre del abogado" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Notas</label>
          <textarea rows={2} value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} className="input-dark resize-none" placeholder="Notas adicionales..." />
        </div>
      </div>

      <div className="flex gap-3 pt-6 border-t border-white/5 mt-6">
        <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
        <button
          onClick={handleSave}
          disabled={saving || !form.fecha}
          className="btn-primary flex-1 flex items-center justify-center gap-2"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {audiencia ? 'Guardar' : 'Agendar'}
        </button>
      </div>
    </Modal>
  );
}
