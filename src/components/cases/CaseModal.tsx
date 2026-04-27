import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Loader2, Upload, Download, FileText, X, DollarSign, TrendingDown, AlertTriangle, Mic, Square, Play, Pause } from 'lucide-react';
import Modal from '../Modal';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useCuotas } from '../../hooks/useCases';
import { useDocumentos, uploadDocumento, deleteDocumento, downloadDocumento } from '../../hooks/useDocumentos';
import { useMovimientosCaso, addMovimiento, deleteMovimiento } from '../../hooks/useMovimientosCaso';
import { useConfigEstudio } from '../../hooks/useConfigEstudio';
import HistorialCasoPanel from './HistorialCasoPanel';
import ComentariosCasoPanel from './ComentariosCasoPanel';
import CrossLinkPanel from './CrossLinkPanel';
import { createRecordatorio } from '../../hooks/useRecordatorios';
import CopilotoBtn from '../CopilotoBtn';
import { syncCaseIncomeLedger } from '../../lib/caseIncomeLedger';
import { validateDriveUrl } from '../../lib/driveUrl';
import {
  CasoCompleto, Cuota, SOCIOS, MATERIAS, ESTADOS_CASO,
  SISTEMAS_JUDICIALES, PERSONERIAS, PRIORIDADES_CASO, APODERADOS,
} from '../../types/database';

interface CaseModalProps {
  open: boolean;
  onClose: () => void;
  caso: CasoCompleto | null;
  onSaved: () => void;
}

interface FormData {
  nombre_apellido: string;
  telefono: string;
  materia: string;
  materia_otro: string;
  estado: string;
  socio: string;
  fecha: string;
  interes: string;
  interes_porque: string;
  fuente: string;
  captadora: string;
  honorarios_monto: string;
  modalidad_pago: string;
  pago_unico_pagado: string;
  pago_unico_monto: string;
  pago_unico_fecha: string;
  observaciones: string;
  expediente: string;
  caratula: string;
  radicado: string;
  apoderado: string;
  sistema: string;
  personeria: string;
  prioridad: string;
  archivado: boolean;
  url_drive: string;
  estadisticas: string;
  actualizacion: string;
}

const emptyForm: FormData = {
  nombre_apellido: '',
  telefono: '',
  materia: 'Jubilaciones',
  materia_otro: '',
  estado: 'Vino a consulta',
  socio: 'Rodrigo',
  fecha: new Date().toISOString().split('T')[0],
  interes: '',
  interes_porque: '',
  fuente: '',
  captadora: '',
  honorarios_monto: '',
  modalidad_pago: 'Único',
  pago_unico_pagado: '',
  pago_unico_monto: '',
  pago_unico_fecha: '',
  observaciones: '',
  expediente: '',
  caratula: '',
  radicado: '',
  apoderado: '',
  sistema: '',
  personeria: '',
  prioridad: 'Sin prioridad',
  archivado: false,
  url_drive: '',
  estadisticas: '',
  actualizacion: '',
};

function getToday() {
  return new Date().toISOString().split('T')[0];
}

export default function CaseModal({ open, onClose, caso, onSaved }: CaseModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { config } = useConfigEstudio();
  const showFinancialSections = false;
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { cuotas, refetch: refetchCuotas } = useCuotas(showFinancialSections ? caso?.id || null : null);
  const { documentos, loading: docsLoading, refetch: refetchDocs } = useDocumentos(caso?.id || null);
  const [localCuotas, setLocalCuotas] = useState<Partial<Cuota>[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { movimientos, loading: movLoading, refetch: refetchMov } = useMovimientosCaso(showFinancialSections ? caso?.id || null : null);
  const [showMovForm, setShowMovForm] = useState(false);
  const [movForm, setMovForm] = useState({ tipo: 'deposito' as 'deposito' | 'gasto', monto: '', moneda: 'ARS' as 'ARS' | 'USD', concepto: '', fecha: new Date().toISOString().split('T')[0], observaciones: '' });
  const [savingMov, setSavingMov] = useState(false);

  // Voice note state
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const isEditing = !!caso;

  useEffect(() => {
    if (caso) {
      setForm({
        nombre_apellido: caso.nombre_apellido || '',
        telefono: caso.telefono || '',
        materia: caso.materia,
        materia_otro: caso.materia_otro || '',
        estado: caso.estado,
        socio: caso.socio,
        fecha: caso.fecha || '',
        interes: caso.interes || '',
        interes_porque: caso.interes_porque || '',
        fuente: caso.fuente || '',
        captadora: caso.captadora || '',
        honorarios_monto: caso.honorarios_monto?.toString() || '',
        modalidad_pago: caso.modalidad_pago || 'Único',
        pago_unico_pagado: caso.pago_unico_pagado === true ? 'si' : caso.pago_unico_pagado === false ? 'no' : '',
        pago_unico_monto: caso.pago_unico_monto?.toString() || '',
        pago_unico_fecha: caso.pago_unico_fecha || '',
        observaciones: caso.observaciones || '',
        expediente: caso.expediente || '',
        caratula: caso.caratula || '',
        radicado: caso.radicado || '',
        apoderado: caso.apoderado || '',
        sistema: caso.sistema || '',
        personeria: caso.personeria || '',
        prioridad: caso.prioridad || 'Sin prioridad',
        archivado: caso.archivado === true,
        url_drive: caso.url_drive || '',
        estadisticas: caso.estadisticas || '',
        actualizacion: caso.actualizacion || '',
      });
    } else {
      setForm(emptyForm);
      setLocalCuotas([]);
    }
  }, [caso]);

  // Load voice note URL if exists
  useEffect(() => {
    setAudioUrl(null);
    if (caso?.tiene_nota_voz && caso.nota_voz_path) {
      supabase.storage.from('notas-voz').createSignedUrl(caso.nota_voz_path, 3600)
        .then(({ data }) => { if (data) setAudioUrl(data.signedUrl); });
    }
  }, [caso]);

  useEffect(() => {
    setLocalCuotas(cuotas);
  }, [cuotas]);

  const update = (field: keyof FormData, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value } as FormData));

  const addCuota = () => {
    setLocalCuotas(prev => [...prev, {
      fecha: '',
      monto: 0,
      estado: 'Pendiente' as const,
    }]);
  };

  const updateCuota = (index: number, field: string, value: string | number) => {
    setLocalCuotas(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const removeCuota = (index: number) => {
    setLocalCuotas(prev => prev.filter((_, i) => i !== index));
  };

  async function handleSave() {
    if (!form.nombre_apellido.trim()) {
      showToast('El nombre es obligatorio', 'error');
      return;
    }
    if (form.url_drive) {
      const chk = validateDriveUrl(form.url_drive);
      if (!chk.valid) {
        showToast('URL de Drive inválida: ' + chk.error, 'error');
        return;
      }
    }

    setSaving(true);
    try {
      let clienteId = caso?.cliente_id;

      if (isEditing && clienteId) {
        // Update client
        await supabase.from('clientes').update({
          nombre_apellido: form.nombre_apellido.trim(),
          telefono: form.telefono.trim() || null,
          updated_by: user?.id,
        }).eq('id', clienteId);
      } else {
        // Create client
        const { data: newCliente, error: clienteError } = await supabase
          .from('clientes')
          .insert({
            nombre_apellido: form.nombre_apellido.trim(),
            telefono: form.telefono.trim() || null,
            created_by: user?.id,
            updated_by: user?.id,
          })
          .select()
          .single();

        if (clienteError) throw clienteError;
        clienteId = newCliente.id;
      }

      const financeData = showFinancialSections
        ? {
            honorarios_monto: parseFloat(form.honorarios_monto) || 0,
            modalidad_pago: form.modalidad_pago,
            pago_unico_pagado: form.modalidad_pago === 'Único' ? form.pago_unico_pagado === 'si' : null,
            pago_unico_monto: form.modalidad_pago === 'Único' && form.pago_unico_pagado === 'si'
              ? parseFloat(form.pago_unico_monto) || null : null,
            pago_unico_fecha: form.modalidad_pago === 'Único' && form.pago_unico_pagado === 'si'
              ? form.pago_unico_fecha || null : null,
          }
        : isEditing && caso
          ? {
              honorarios_monto: caso.honorarios_monto || 0,
              modalidad_pago: caso.modalidad_pago,
              pago_unico_pagado: caso.pago_unico_pagado,
              pago_unico_monto: caso.pago_unico_monto,
              pago_unico_fecha: caso.pago_unico_fecha,
            }
          : {
              honorarios_monto: 0,
              modalidad_pago: null,
              pago_unico_pagado: null,
              pago_unico_monto: null,
              pago_unico_fecha: null,
            };

      const casoData = {
        cliente_id: clienteId,
        materia: form.materia,
        materia_otro: form.materia === 'Otro' ? form.materia_otro : null,
        estado: form.estado,
        socio: form.socio,
        fecha: form.fecha || null,
        interes: form.estado === 'Vino a consulta' ? form.interes || null : null,
        interes_porque: form.estado === 'Vino a consulta' && ['Muy interesante', 'Interesante'].includes(form.interes)
          ? form.interes_porque : null,
        fuente: form.estado === 'Vino a consulta' ? form.fuente || null : null,
        captadora: form.fuente === 'Captadora' ? form.captadora || null : null,
        ...financeData,
        observaciones: form.observaciones || null,
        expediente: form.expediente.trim() || null,
        caratula: form.caratula.trim() || null,
        radicado: form.radicado.trim() || null,
        apoderado: form.apoderado || null,
        sistema: form.sistema || null,
        personeria: form.personeria || null,
        prioridad: form.prioridad || 'Sin prioridad',
        archivado: !!form.archivado,
        url_drive: form.url_drive.trim() || null,
        estadisticas: form.estadisticas.trim() || null,
        actualizacion: form.actualizacion.trim() || null,
        updated_by: user?.id,
      };

      let casoId = caso?.id;

      if (isEditing && casoId) {
        const { error } = await supabase.from('casos').update(casoData).eq('id', casoId);
        if (error) throw error;
      } else {
        const { data: newCaso, error } = await supabase
          .from('casos')
          .insert({ ...casoData, created_by: user?.id })
          .select()
          .single();
        if (error) throw error;
        casoId = newCaso.id;
      }

      if (showFinancialSections && casoId) {
        const savedCuotas: Cuota[] = [];
        if (form.modalidad_pago === 'En cuotas') {
          if (isEditing) {
            const localIds = new Set(localCuotas.filter(c => c.id).map(c => c.id as string));
            const cuotasToDelete = cuotas.filter(cuota => !localIds.has(cuota.id));
            if (cuotasToDelete.length > 0) {
              const { error: deleteCuotasError } = await supabase.from('cuotas').delete().in('id', cuotasToDelete.map(cuota => cuota.id));
              if (deleteCuotasError) throw deleteCuotasError;
            }
          }

          for (const cuota of localCuotas) {
            if (!cuota.fecha || !cuota.monto) continue;

            const cuotaEstado = cuota.estado || 'Pendiente';
            const cuotaPayload = {
              fecha: cuota.fecha,
              monto: cuota.monto,
              estado: cuotaEstado,
              fecha_pago: cuotaEstado === 'Pagado' ? cuota.fecha_pago || cuota.fecha || getToday() : null,
              cobrado_por: cuotaEstado === 'Pagado' ? cuota.cobrado_por || form.socio : null,
              modalidad_pago: cuotaEstado === 'Pagado' ? cuota.modalidad_pago || 'Efectivo' : null,
              notas: cuota.notas || null,
            };

            if (cuota.id) {
              const { data: updatedCuota, error: updateCuotaError } = await supabase
                .from('cuotas')
                .update(cuotaPayload)
                .eq('id', cuota.id)
                .select('*')
                .single();
              if (updateCuotaError) throw updateCuotaError;
              savedCuotas.push(updatedCuota as Cuota);
            } else {
              const { data: insertedCuota, error: insertCuotaError } = await supabase
                .from('cuotas')
                .insert({
                  caso_id: casoId,
                  ...cuotaPayload,
                })
                .select('*')
                .single();
              if (insertCuotaError) throw insertCuotaError;
              savedCuotas.push(insertedCuota as Cuota);
            }
          }
        } else if (isEditing && cuotas.length > 0) {
          const { error: deleteCuotasError } = await supabase.from('cuotas').delete().eq('caso_id', casoId);
          if (deleteCuotasError) throw deleteCuotasError;
        }

        await syncCaseIncomeLedger({
          sourceCase: {
            id: casoId,
            nombre_apellido: form.nombre_apellido.trim(),
            materia: form.materia as CasoCompleto['materia'],
            materia_otro: form.materia === 'Otro' ? form.materia_otro : null,
            socio: form.socio as CasoCompleto['socio'],
            fecha: form.fecha || null,
            captadora: form.fuente === 'Captadora' ? (form.captadora as CasoCompleto['captadora']) || null : null,
            honorarios_monto: parseFloat(form.honorarios_monto) || 0,
            modalidad_pago: form.modalidad_pago as CasoCompleto['modalidad_pago'],
            pago_unico_pagado: form.modalidad_pago === 'Único' ? form.pago_unico_pagado === 'si' : null,
            pago_unico_monto: form.modalidad_pago === 'Único' && form.pago_unico_pagado === 'si'
              ? parseFloat(form.pago_unico_monto) || parseFloat(form.honorarios_monto) || 0
              : null,
            pago_unico_fecha: form.modalidad_pago === 'Único' && form.pago_unico_pagado === 'si'
              ? form.pago_unico_fecha || null
              : null,
          },
          existingCuotas: cuotas,
          savedCuotas,
          commissionPct: config.comision_captadora_pct,
        });
      }

      showToast(isEditing ? 'Caso actualizado' : 'Caso creado');
      onSaved();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!caso) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('casos').delete().eq('id', caso.id);
      if (error) throw error;
      showToast('Caso eliminado');
      onSaved();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Error al eliminar', 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar Caso' : 'Nuevo Caso'}
      subtitle={isEditing ? `${caso.nombre_apellido} · ${caso.materia}` : 'Registrar un nuevo caso'}
      maxWidth="max-w-3xl"
      headerAction={isEditing && caso ? (
        <CopilotoBtn
          tipo="analizar_caso"
          label="IA"
          datos={{
            nombre_apellido: caso.nombre_apellido,
            materia: caso.materia,
            estado: caso.estado,
            honorarios_monto: caso.honorarios_monto,
            saldo_pendiente: caso.saldo_pendiente,
            observaciones: caso.observaciones,
          }}
        />
      ) : undefined}
    >
      <div className="space-y-6">
        {/* Datos del Cliente */}
        <Section title="Datos del Cliente">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nombre y Apellido" required>
              <input
                type="text"
                value={form.nombre_apellido}
                onChange={(e) => update('nombre_apellido', e.target.value)}
                className="input-dark"
                placeholder="Ej: Juan Pérez"
              />
            </Field>
            <Field label="Teléfono">
              <input
                type="text"
                value={form.telefono}
                onChange={(e) => update('telefono', e.target.value)}
                className="input-dark"
                placeholder="Ej: 388-4001234"
              />
            </Field>
          </div>
        </Section>

        {/* Información del Caso */}
        <Section title="Información del Caso">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Materia">
              <select
                value={form.materia}
                onChange={(e) => update('materia', e.target.value)}
                className="select-dark"
              >
                {MATERIAS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            {form.materia === 'Otro' && (
              <Field label="Especificar materia">
                <input
                  type="text"
                  value={form.materia_otro}
                  onChange={(e) => update('materia_otro', e.target.value)}
                  className="input-dark"
                  placeholder="¿Cuál materia?"
                />
              </Field>
            )}
            <Field label="Estado del caso">
              <select
                value={form.estado}
                onChange={(e) => update('estado', e.target.value)}
                className="select-dark"
              >
                {ESTADOS_CASO.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </Field>
            <Field label="Socio que lo carga">
              <select
                value={form.socio}
                onChange={(e) => update('socio', e.target.value)}
                className="select-dark"
              >
                {SOCIOS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Fecha del caso">
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => update('fecha', e.target.value)}
                className="input-dark"
              />
            </Field>
          </div>
        </Section>

        {/* Datos judiciales (spec ficha ultra completa) */}
        <Section title="Datos Judiciales">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Expediente">
              <input
                type="text"
                value={form.expediente}
                onChange={(e) => update('expediente', e.target.value)}
                className="input-dark"
                placeholder="Nº de expediente"
              />
            </Field>
            <Field label="Carátula">
              <input
                type="text"
                value={form.caratula}
                onChange={(e) => update('caratula', e.target.value)}
                className="input-dark"
                placeholder="Ej: López Juan c/ ANSES s/ reajuste haberes"
              />
            </Field>
            <Field label="Radicado (juzgado)">
              <input
                type="text"
                value={form.radicado}
                onChange={(e) => update('radicado', e.target.value)}
                className="input-dark"
                placeholder="Ej: Juzgado Federal Nº2 Jujuy"
              />
            </Field>
            <Field label="Sistema">
              <select
                value={form.sistema}
                onChange={(e) => update('sistema', e.target.value)}
                className="select-dark"
              >
                <option value="">Sin especificar</option>
                {SISTEMAS_JUDICIALES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Personería">
              <select
                value={form.personeria}
                onChange={(e) => update('personeria', e.target.value)}
                className="select-dark"
              >
                <option value="">Sin especificar</option>
                {PERSONERIAS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Prioridad">
              <select
                value={form.prioridad}
                onChange={(e) => update('prioridad', e.target.value)}
                className="select-dark"
              >
                {PRIORIDADES_CASO.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="URL Drive">
              <input
                type="url"
                value={form.url_drive}
                onChange={(e) => update('url_drive', e.target.value)}
                className="input-dark"
                placeholder="https://drive.google.com/..."
              />
              {(() => {
                const chk = validateDriveUrl(form.url_drive);
                if (form.url_drive && chk.error) return <p className="text-xs text-red-400 mt-1">⚠ {chk.error}</p>;
                if (chk.warning) return <p className="text-xs text-amber-400 mt-1">ℹ {chk.warning}</p>;
                if (form.url_drive && chk.valid) return <p className="text-xs text-emerald-400 mt-1">✓ Link válido</p>;
                return null;
              })()}
            </Field>
            <Field label="Apoderado / Patrocinante">
              <select
                value={form.apoderado}
                onChange={(e) => update('apoderado', e.target.value)}
                className="select-dark"
              >
                <option value="">Sin asignar</option>
                {APODERADOS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 mt-3 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={form.archivado}
              onChange={(e) => update('archivado', e.target.checked)}
              className="rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/30"
            />
            Archivar caso (queda oculto de la vista principal)
          </label>
        </Section>

        {/* Campos condicionales: Vino a consulta */}
        {form.estado === 'Vino a consulta' && (
          <Section title="Detalles de Consulta">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="¿Cuán interesante es el caso?">
                <select
                  value={form.interes}
                  onChange={(e) => update('interes', e.target.value)}
                  className="select-dark"
                >
                  <option value="">Seleccionar...</option>
                  <option value="Muy interesante">Muy interesante</option>
                  <option value="Interesante">Interesante</option>
                  <option value="Poco interesante">Poco interesante</option>
                </select>
              </Field>

              {['Muy interesante', 'Interesante'].includes(form.interes) && (
                <Field label="¿Por qué?">
                  <input
                    type="text"
                    value={form.interes_porque}
                    onChange={(e) => update('interes_porque', e.target.value)}
                    className="input-dark"
                    placeholder="Explicar brevemente..."
                  />
                </Field>
              )}

              <Field label="¿De dónde vino el cliente?">
                <select
                  value={form.fuente}
                  onChange={(e) => update('fuente', e.target.value)}
                  className="select-dark"
                >
                  <option value="">Seleccionar...</option>
                  <option value="Derivado">Derivado</option>
                  <option value="Campaña">Campaña</option>
                  <option value="Captadora">Captadora</option>
                </select>
              </Field>

              {form.fuente === 'Captadora' && (
                <Field label="Captadora">
                  <select
                    value={form.captadora}
                    onChange={(e) => update('captadora', e.target.value)}
                    className="select-dark"
                  >
                    <option value="">Seleccionar...</option>
                    <option value="Milagros - La Quiaca">Milagros - La Quiaca</option>
                    <option value="Hilda - Norte">Hilda - Norte</option>
                  </select>
                </Field>
              )}
            </div>
          </Section>
        )}

        {/* Honorarios */}
        {showFinancialSections && (
        <Section title="Honorarios">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Monto acordado ($)">
              <input
                type="number"
                value={form.honorarios_monto}
                onChange={(e) => update('honorarios_monto', e.target.value)}
                className="input-dark"
                placeholder="0"
                min="0"
              />
            </Field>
            <Field label="Modalidad de pago">
              <select
                value={form.modalidad_pago}
                onChange={(e) => update('modalidad_pago', e.target.value)}
                className="select-dark"
              >
                <option value="Único">Único (pago de una vez)</option>
                <option value="En cuotas">En cuotas</option>
              </select>
            </Field>
          </div>

          {/* Pago único */}
          {form.modalidad_pago === 'Único' && (
            <div className="mt-4 space-y-4">
              <Field label="¿Pagó la consulta?">
                <select
                  value={form.pago_unico_pagado}
                  onChange={(e) => update('pago_unico_pagado', e.target.value)}
                  className="select-dark"
                >
                  <option value="">Seleccionar...</option>
                  <option value="si">Sí</option>
                  <option value="no">No</option>
                </select>
              </Field>

              {form.pago_unico_pagado === 'si' && (
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Monto pagado ($)">
                    <input
                      type="number"
                      value={form.pago_unico_monto}
                      onChange={(e) => update('pago_unico_monto', e.target.value)}
                      className="input-dark"
                      min="0"
                    />
                  </Field>
                  <Field label="Fecha de pago">
                    <input
                      type="date"
                      value={form.pago_unico_fecha}
                      onChange={(e) => update('pago_unico_fecha', e.target.value)}
                      className="input-dark"
                    />
                  </Field>
                </div>
              )}

              {form.pago_unico_pagado === 'no' && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <span className="text-red-400 text-sm font-medium">⚠ El cliente no ha pagado la consulta</span>
                </div>
              )}
            </div>
          )}

          {/* En cuotas */}
          {form.modalidad_pago === 'En cuotas' && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">Cuotas</p>
                <button onClick={addCuota} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3">
                  <Plus className="w-3.5 h-3.5" /> Agregar cuota
                </button>
              </div>

              {localCuotas.length > 0 && (
                <div className="space-y-2">
                  {localCuotas.map((cuota, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-xl border border-white/5">
                      <input
                        type="date"
                        value={cuota.fecha || ''}
                        onChange={(e) => updateCuota(i, 'fecha', e.target.value)}
                        className="input-dark flex-1 text-sm py-2"
                      />
                      <input
                        type="number"
                        value={cuota.monto || ''}
                        onChange={(e) => updateCuota(i, 'monto', parseFloat(e.target.value) || 0)}
                        className="input-dark w-28 text-sm py-2"
                        placeholder="Monto"
                        min="0"
                      />
                      <select
                        value={cuota.estado || 'Pendiente'}
                        onChange={(e) => updateCuota(i, 'estado', e.target.value)}
                        className="select-dark w-32 text-sm py-2"
                      >
                        <option value="Pendiente">Pendiente</option>
                        <option value="Pagado">Pagado</option>
                      </select>
                      <button
                        onClick={() => removeCuota(i)}
                        className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {/* Totals */}
                  <div className="flex justify-end gap-6 pt-2 text-sm">
                    <span className="text-gray-500">
                      Total cuotas: <span className="text-white font-medium">
                        ${localCuotas.reduce((s, c) => s + (c.monto || 0), 0).toLocaleString('es-AR')}
                      </span>
                    </span>
                    <span className="text-gray-500">
                      Pagado: <span className="text-emerald-400 font-medium">
                        ${localCuotas.filter(c => c.estado === 'Pagado').reduce((s, c) => s + (c.monto || 0), 0).toLocaleString('es-AR')}
                      </span>
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">Las cuotas marcadas como pagadas generan o actualizan su ingreso financiero al guardar el caso.</p>
                </div>
              )}
            </div>
          )}
        </Section>
        )}

        {/* Observaciones */}
        <Section title="Observaciones">
          <textarea
            value={form.observaciones}
            onChange={(e) => update('observaciones', e.target.value)}
            className="input-dark min-h-[80px] resize-y"
            placeholder="Notas adicionales sobre el caso..."
            rows={3}
          />
        </Section>

        {/* Estadísticas — Estado general del caso (spec §4.1) */}
        <Section title="Estadísticas (estado general)">
          <textarea
            value={form.estadisticas}
            onChange={(e) => update('estadisticas', e.target.value)}
            className="input-dark min-h-[60px] resize-y"
            placeholder='Ej: "al día", "con deuda de aportes", "esperando resolución"...'
            rows={2}
          />
          <p className="text-[11px] text-gray-500 mt-1">Resumen rápido del estado general del expediente.</p>
        </Section>

        {/* Actualización — Resumen semanal (spec §4.1) */}
        <Section title="Actualización semanal">
          <textarea
            value={form.actualizacion}
            onChange={(e) => update('actualizacion', e.target.value)}
            className="input-dark min-h-[80px] resize-y"
            placeholder="Resumen semanal del estado del caso..."
            rows={3}
          />
          {caso?.actualizacion_fecha && (
            <p className="text-[11px] text-gray-500 mt-1">
              Última actualización: {new Date(caso.actualizacion_fecha).toLocaleString('es-AR')}
            </p>
          )}
        </Section>

        {/* Nota de Voz del Caso (solo en edición) */}
        {isEditing && caso && (
          <Section title="Nota de Voz">
            <div className="flex items-center gap-3">
              {/* Playback */}
              {audioUrl && (
                <button
                  onClick={() => {
                    if (!audioPlayerRef.current) {
                      audioPlayerRef.current = new Audio(audioUrl);
                      audioPlayerRef.current.onended = () => setIsPlaying(false);
                    }
                    if (isPlaying) {
                      audioPlayerRef.current.pause();
                      setIsPlaying(false);
                    } else {
                      audioPlayerRef.current.play();
                      setIsPlaying(true);
                    }
                  }}
                  className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
              )}

              {/* Record */}
              {!isRecording ? (
                <button
                  onClick={async () => {
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                      const mr = new MediaRecorder(stream);
                      audioChunksRef.current = [];
                      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
                      mr.onstop = async () => {
                        stream.getTracks().forEach(t => t.stop());
                        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                        const path = `casos/${caso.id}.webm`;
                        const { error: upErr } = await supabase.storage.from('notas-voz').upload(path, blob, { upsert: true, contentType: 'audio/webm' });
                        if (upErr) { showToast('Error al subir audio', 'error'); return; }
                        await supabase.from('casos').update({ tiene_nota_voz: true, nota_voz_path: path }).eq('id', caso.id);
                        const { data: signedData } = await supabase.storage.from('notas-voz').createSignedUrl(path, 3600);
                        if (signedData) setAudioUrl(signedData.signedUrl);
                        audioPlayerRef.current = null;
                        showToast('Nota de voz guardada');
                      };
                      mr.start();
                      mediaRecorderRef.current = mr;
                      setIsRecording(true);
                    } catch {
                      showToast('No se pudo acceder al micrófono', 'error');
                    }
                  }}
                  className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors"
                  title="Grabar nota de voz"
                >
                  <Mic className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => {
                    mediaRecorderRef.current?.stop();
                    setIsRecording(false);
                  }}
                  className="p-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 animate-pulse"
                  title="Detener grabación"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Delete audio */}
              {audioUrl && !isRecording && (
                <button
                  onClick={async () => {
                    if (caso.nota_voz_path) {
                      await supabase.storage.from('notas-voz').remove([caso.nota_voz_path]);
                      await supabase.from('casos').update({ tiene_nota_voz: false, nota_voz_path: null }).eq('id', caso.id);
                    }
                    if (audioPlayerRef.current) { audioPlayerRef.current.pause(); audioPlayerRef.current = null; }
                    setAudioUrl(null);
                    setIsPlaying(false);
                    showToast('Nota de voz eliminada');
                  }}
                  className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-gray-500 hover:text-red-400 hover:border-red-500/20 transition-colors"
                  title="Eliminar nota de voz"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <span className="text-sm text-gray-500">
                {isRecording ? 'Grabando...' : audioUrl ? 'Nota de voz guardada' : 'Sin nota de voz'}
              </span>
            </div>
          </Section>
        )}

        {/* Fondos y Gastos (solo en edición) */}
        {isEditing && caso && showFinancialSections && (() => {
          const fmtARS = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
          const fmtUSD = (n: number) => 'US$ ' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);

          const depARS = movimientos.filter(m => m.tipo === 'deposito' && (m.moneda || 'ARS') === 'ARS').reduce((s, m) => s + Number(m.monto), 0);
          const gasARS = movimientos.filter(m => m.tipo === 'gasto' && (m.moneda || 'ARS') === 'ARS').reduce((s, m) => s + Number(m.monto), 0);
          const saldoARS = depARS - gasARS;
          const pctARS = depARS > 0 ? (gasARS / depARS) * 100 : 0;

          const depUSD = movimientos.filter(m => m.tipo === 'deposito' && m.moneda === 'USD').reduce((s, m) => s + Number(m.monto), 0);
          const gasUSD = movimientos.filter(m => m.tipo === 'gasto' && m.moneda === 'USD').reduce((s, m) => s + Number(m.monto), 0);
          const saldoUSD = depUSD - gasUSD;
          const pctUSD = depUSD > 0 ? (gasUSD / depUSD) * 100 : 0;

          const hayUSD = depUSD > 0 || gasUSD > 0;
          const fondosBajos = (depARS > 0 && pctARS >= 80) || (depUSD > 0 && pctUSD >= 80);
          const porcentajeUsado = depARS > 0 ? pctARS : pctUSD;

          return (
            <Section title="Fondos y Gastos del Caso">
              {/* Summary cards - ARS */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                  <p className="text-[10px] text-emerald-400/70 uppercase tracking-wider">Depositado</p>
                  <p className="text-lg font-bold text-emerald-400">{fmtARS(depARS)}</p>
                </div>
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
                  <p className="text-[10px] text-red-400/70 uppercase tracking-wider">Gastado</p>
                  <p className="text-lg font-bold text-red-400">{fmtARS(gasARS)}</p>
                </div>
                <div className={`p-3 rounded-xl text-center border ${saldoARS >= 0 ? 'bg-white/[0.04] border-white/10' : 'bg-red-500/10 border-red-500/20'}`}>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Saldo</p>
                  <p className={`text-lg font-bold ${saldoARS >= 0 ? 'text-white' : 'text-red-400'}`}>{fmtARS(saldoARS)}</p>
                </div>
              </div>

              {/* Summary cards - USD (solo si hay movimientos en USD) */}
              {hayUSD && (
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                    <p className="text-[10px] text-emerald-400/70 uppercase tracking-wider">Depositado USD</p>
                    <p className="text-lg font-bold text-emerald-400">{fmtUSD(depUSD)}</p>
                  </div>
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
                    <p className="text-[10px] text-red-400/70 uppercase tracking-wider">Gastado USD</p>
                    <p className="text-lg font-bold text-red-400">{fmtUSD(gasUSD)}</p>
                  </div>
                  <div className={`p-3 rounded-xl text-center border ${saldoUSD >= 0 ? 'bg-white/[0.04] border-white/10' : 'bg-red-500/10 border-red-500/20'}`}>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Saldo USD</p>
                    <p className={`text-lg font-bold ${saldoUSD >= 0 ? 'text-white' : 'text-red-400'}`}>{fmtUSD(saldoUSD)}</p>
                  </div>
                </div>
              )}

              {/* Low funds warning */}
              {fondosBajos && (
                <div className="flex items-center gap-2 p-3 mb-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                  <p className="text-sm text-yellow-300">
                    {saldoARS <= 0 && depARS > 0
                      ? 'Los fondos en pesos se agotaron. Solicitar más dinero al cliente.'
                      : saldoUSD <= 0 && depUSD > 0
                      ? 'Los fondos en dólares se agotaron.'
                      : `Se usó el ${Math.round(porcentajeUsado)}% de los fondos. Considerar pedir más al cliente.`}
                  </p>
                </div>
              )}

              {/* Progress bar */}
              {depARS > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-500">ARS</span>
                    <span className="text-[10px] text-gray-500">{Math.round(pctARS)}% utilizado</span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${pctARS >= 80 ? 'bg-red-500' : pctARS >= 60 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(pctARS, 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {depUSD > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-500">USD</span>
                    <span className="text-[10px] text-gray-500">{Math.round(pctUSD)}% utilizado</span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${pctUSD >= 80 ? 'bg-red-500' : pctUSD >= 60 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(pctUSD, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Movimientos list */}
              {movLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-white/30" />
                </div>
              ) : movimientos.length > 0 ? (
                <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                  {movimientos.map(m => (
                    <div key={m.id} className="flex items-center justify-between p-2.5 bg-white/[0.02] rounded-lg border border-white/5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`p-1.5 rounded-lg ${m.tipo === 'deposito' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                          {m.tipo === 'deposito' ? (
                            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-gray-200 truncate">{m.concepto}</p>
                          <p className="text-[10px] text-gray-500">{new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-AR')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${m.tipo === 'deposito' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {m.tipo === 'deposito' ? '+' : '-'}{(m.moneda || 'ARS') === 'USD' ? fmtUSD(Number(m.monto)) : fmtARS(Number(m.monto))}
                        </span>
                        <button
                          onClick={async () => {
                            try {
                              await deleteMovimiento(m.id);
                              refetchMov();
                              showToast('Movimiento eliminado');
                            } catch {
                              showToast('Error al eliminar', 'error');
                            }
                          }}
                          className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-3 mb-4">Sin movimientos registrados</p>
              )}

              {/* Add movement form */}
              {showMovForm ? (
                <div className="p-4 bg-white/[0.03] rounded-xl border border-white/10 space-y-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setMovForm(f => ({ ...f, tipo: 'deposito' }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${movForm.tipo === 'deposito' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-gray-400 border border-white/5'}`}
                    >
                      Depósito del cliente
                    </button>
                    <button
                      type="button"
                      onClick={() => setMovForm(f => ({ ...f, tipo: 'gasto' }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${movForm.tipo === 'gasto' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/5 text-gray-400 border border-white/5'}`}
                    >
                      Gasto del caso
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={movForm.monto}
                        onChange={e => setMovForm(f => ({ ...f, monto: e.target.value.replace(/[^0-9]/g, '') }))}
                        className="input-dark"
                        placeholder="Ej: 50000"
                      />
                      {movForm.monto && (
                        <p className="text-[10px] text-gray-500 mt-1">
                          {movForm.moneda === 'USD' ? 'US$ ' : '$ '}{parseInt(movForm.monto, 10).toLocaleString('es-AR')}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setMovForm(f => ({ ...f, moneda: 'ARS' }))}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${movForm.moneda === 'ARS' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-white/5 text-gray-500 border border-white/5'}`}
                      >
                        $ ARS
                      </button>
                      <button
                        type="button"
                        onClick={() => setMovForm(f => ({ ...f, moneda: 'USD' }))}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${movForm.moneda === 'USD' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/5 text-gray-500 border border-white/5'}`}
                      >
                        US$
                      </button>
                    </div>
                    <input
                      type="date"
                      value={movForm.fecha}
                      onChange={e => setMovForm(f => ({ ...f, fecha: e.target.value }))}
                      className="input-dark"
                    />
                  </div>
                  <input
                    type="text"
                    value={movForm.concepto}
                    onChange={e => setMovForm(f => ({ ...f, concepto: e.target.value }))}
                    className="input-dark"
                    placeholder={movForm.tipo === 'deposito' ? 'Ej: Depósito para gastos judiciales' : 'Ej: Tasa judicial, cédula, oficio'}
                  />
                  <input
                    type="text"
                    value={movForm.observaciones}
                    onChange={e => setMovForm(f => ({ ...f, observaciones: e.target.value }))}
                    className="input-dark"
                    placeholder="Observaciones (opcional)"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => { setShowMovForm(false); setMovForm({ tipo: 'deposito', monto: '', moneda: 'ARS', concepto: '', fecha: new Date().toISOString().split('T')[0], observaciones: '' }); }}
                      className="btn-secondary text-sm"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={savingMov}
                      onClick={async () => {
                        if (!movForm.monto) { showToast('Completá el monto', 'error'); return; }
                        if (!movForm.concepto.trim()) { showToast('Completá el concepto', 'error'); return; }
                        const montoNum = parseInt(movForm.monto, 10);
                        if (isNaN(montoNum) || montoNum <= 0) { alert('Monto inválido'); return; }
                        setSavingMov(true);
                        try {
                          const { error } = await supabase.from('movimientos_caso').insert({
                            caso_id: caso.id,
                            tipo: movForm.tipo,
                            monto: montoNum,
                            moneda: movForm.moneda,
                            concepto: movForm.concepto.trim(),
                            fecha: movForm.fecha,
                            observaciones: movForm.observaciones.trim() || null,
                            created_by: user?.id || null,
                          });
                          if (error) { alert('Error DB: ' + error.message); setSavingMov(false); return; }
                          refetchMov();
                          setShowMovForm(false);
                          setMovForm({ tipo: 'deposito', monto: '', moneda: 'ARS', concepto: '', fecha: new Date().toISOString().split('T')[0], observaciones: '' });
                          showToast(movForm.tipo === 'deposito' ? 'Depósito registrado' : 'Gasto registrado');
                        } catch (err: any) {
                          alert('Error catch: ' + (err?.message || String(err)));
                        } finally {
                          setSavingMov(false);
                        }
                      }}
                      className="btn-primary text-sm flex items-center gap-1.5"
                    >
                      {savingMov ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowMovForm(true)}
                  className="w-full py-2.5 border border-dashed border-white/10 rounded-xl text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Registrar movimiento
                </button>
              )}
            </Section>
          );
        })()}

        {/* Historial inmutable (spec seccion 4.2) - solo en edicion */}
        {isEditing && caso && (
          <Section title="Historial y Resumen">
            <HistorialCasoPanel caso={caso} />
          </Section>
        )}

        {/* Comentarios libres (thread editable por el autor) */}
        {isEditing && caso && (
          <Section title="Comentarios">
            <ComentariosCasoPanel casoId={caso.id} />
          </Section>
        )}

        {/* Fichas previsionales vinculadas por nombre/teléfono */}
        {isEditing && caso && caso.cliente_id && (
          <CrossLinkPanel clienteId={caso.cliente_id} tipo="caso" />
        )}

        {/* Documentos (solo en edición) */}
        {isEditing && caso && (
          <Section title="Documentos">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              onChange={async (e) => {
                const files = e.target.files;
                if (!files || !caso?.id) return;
                setUploading(true);
                try {
                  for (const file of Array.from(files)) {
                    await uploadDocumento(caso.id, file, user?.id);
                  }
                  showToast(`${files.length} documento(s) subido(s)`);
                  refetchDocs();
                } catch (err: any) {
                  showToast(err.message || 'Error al subir documento', 'error');
                } finally {
                  setUploading(false);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }
              }}
            />

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3"
              >
                {uploading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Subiendo...</>
                ) : (
                  <><Upload className="w-3.5 h-3.5" /> Subir documentos</>
                )}
              </button>

              {docsLoading ? (
                <div className="flex items-center gap-2 py-3 text-gray-500 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando documentos...
                </div>
              ) : documentos.length === 0 ? (
                <p className="text-gray-600 text-sm py-2">No hay documentos adjuntos.</p>
              ) : (
                <div className="space-y-1.5">
                  {documentos.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 p-2.5 bg-white/[0.02] rounded-xl border border-white/5 group">
                      <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{doc.nombre}</p>
                        <p className="text-xs text-gray-600">
                          {(doc.tamano / 1024).toFixed(0)} KB · {new Date(doc.created_at).toLocaleDateString('es-AR')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadDocumento(doc)}
                        className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors"
                        title="Descargar"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await deleteDocumento(doc);
                            showToast('Documento eliminado');
                            refetchDocs();
                          } catch (err: any) {
                            showToast(err.message || 'Error al eliminar', 'error');
                          }
                        }}
                        className="p-1.5 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Auditoría (solo en edición) */}
        {isEditing && caso && (
          <div className="text-xs text-gray-600 space-y-1 pt-2 border-t border-white/5">
            <p>Creado por: {caso.creado_por_nombre || '—'} · {caso.created_at ? new Date(caso.created_at).toLocaleString('es-AR') : ''}</p>
            <p>Editado por: {caso.editado_por_nombre || '—'} · {caso.updated_at ? new Date(caso.updated_at).toLocaleString('es-AR') : ''}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-white/5">
          <div>
            {isEditing && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="btn-danger text-sm"
              >
                {deleting ? 'Eliminando...' : 'Eliminar caso'}
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                isEditing ? 'Guardar cambios' : 'Crear caso'
              )}
            </button>
          </div>
        </div>
      </div>
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
