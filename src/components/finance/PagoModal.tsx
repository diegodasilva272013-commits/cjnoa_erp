import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '../Modal';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { useSocios } from '../../hooks/useSocios';
import { useConfigEstudio } from '../../hooks/useConfigEstudio';

interface PagoModalProps {
  open: boolean;
  onClose: () => void;
  cuotaId: string;
  casoId: string;
  clienteNombre: string;
  materia: string;
  montoSugerido: number;
  captadora: string | null;
  onSaved: () => void;
}

export default function PagoModal({
  open, onClose, cuotaId, casoId, clienteNombre,
  materia, montoSugerido, captadora, onSaved,
}: PagoModalProps) {
  const { showToast } = useToast();
  const socios = useSocios();
  const { config } = useConfigEstudio();
  const [monto, setMonto] = useState(montoSugerido.toString());
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [modalidad, setModalidad] = useState('Efectivo');
  const [socioCobro, setSocioCobro] = useState(socios[0] || '');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const montoNum = parseFloat(monto) || 0;

    // --- Validaciones ---
    if (montoNum <= 0) {
      showToast('El monto debe ser mayor a 0', 'error');
      return;
    }
    if (!fecha) {
      showToast('Selecciona una fecha de pago', 'error');
      return;
    }

    setSaving(true);
    try {
      // Verificar que la cuota no esté ya pagada
      const { data: cuotaActual } = await supabase
        .from('cuotas')
        .select('estado')
        .eq('id', cuotaId)
        .single();

      if (cuotaActual?.estado === 'Pagado') {
        showToast('Esta cuota ya fue registrada como pagada', 'error');
        setSaving(false);
        return;
      }

      const esCaptadora = !!captadora;
      const comision = esCaptadora ? montoNum * config.comision_captadora_pct : 0;
      const montoCjNoa = montoNum - comision;

      // 1. Marcar cuota como pagada
      const { error: errorCuota } = await supabase.from('cuotas').update({
        estado: 'Pagado',
        fecha_pago: fecha,
        cobrado_por: socioCobro,
        modalidad_pago: modalidad,
        notas,
      }).eq('id', cuotaId);

      if (errorCuota) throw errorCuota;

      // 2. Crear ingreso — si falla, revertir la cuota
      const { error: errorIngreso } = await supabase.from('ingresos').insert({
        caso_id: casoId,
        fecha,
        cliente_nombre: clienteNombre,
        materia,
        concepto: 'Pago de cuota',
        monto_total: montoNum,
        monto_cj_noa: montoCjNoa,
        comision_captadora: comision,
        captadora_nombre: esCaptadora ? captadora : null,
        socio_cobro: socioCobro,
        modalidad,
        notas,
      });

      if (errorIngreso) {
        // Rollback: devolver cuota a Pendiente
        await supabase.from('cuotas').update({
          estado: 'Pendiente',
          fecha_pago: null,
          cobrado_por: null,
          modalidad_pago: null,
          notas: '',
        }).eq('id', cuotaId);
        throw errorIngreso;
      }

      showToast('Pago registrado');
      onSaved();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Error al registrar pago', 'error');
    } finally {
      setSaving(false);
    }
  }

  const montoNum = parseFloat(monto) || 0;
  const esCaptadora = !!captadora;
  const comision = esCaptadora ? montoNum * config.comision_captadora_pct : 0;

  return (
    <Modal open={open} onClose={onClose} title="Registrar Pago" subtitle={clienteNombre} maxWidth="max-w-md">
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Monto ($)</label>
          <input
            type="number"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className="input-dark"
            min="0"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Fecha del pago</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="input-dark"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Modalidad</label>
          <select
            value={modalidad}
            onChange={(e) => setModalidad(e.target.value)}
            className="select-dark"
          >
            <option value="Efectivo">Efectivo</option>
            <option value="Transferencia">Transferencia</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Socio que cobró</label>
          <select
            value={socioCobro}
            onChange={(e) => setSocioCobro(e.target.value)}
            className="select-dark"
          >
            {socios.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Notas (opcional)</label>
          <input
            type="text"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="input-dark"
            placeholder="Notas adicionales..."
          />
        </div>

        {/* Captadora breakdown */}
        {esCaptadora && montoNum > 0 && (
          <div className="p-3 bg-white/[0.06] border border-white/10 rounded-xl text-sm space-y-1">
            <p className="text-white/70 font-medium">Distribución por captadora:</p>
            <p className="text-gray-300">
              ${montoNum.toLocaleString('es-AR')} total → ${(montoNum - comision).toLocaleString('es-AR')} CJ NOA + ${comision.toLocaleString('es-AR')} {captadora}
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={handleSave} disabled={saving || montoNum <= 0} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Registrando...</> : 'Registrar pago'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
