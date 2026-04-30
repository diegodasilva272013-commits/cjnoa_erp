import { useState, useEffect, useRef, useCallback } from 'react';
import {
  User, Hash, Key, Calendar, MapPin, Phone, Baby, FileText,
  DollarSign, ExternalLink, Save, Calculator, Clock,
  Paperclip, Upload, Download, Trash2, Mic, MicOff, Square, Play, Pause, Loader2, FolderOpen, Eye, X as XIcon,
} from 'lucide-react';
import Modal from '../Modal';
import { supabase } from '../../lib/supabase';
import { ClientePrevisional, calcularMoratoria, SexoCliente, PipelinePrevisional, PIPELINE_LABELS, SubEstadoPrevisional, getCostoMensual27705, setCostoMensual27705, COSTO_MENSUAL_27705_DEFAULT } from '../../types/previsional';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { SOCIOS } from '../../types/database';
import { validateDriveUrl } from '../../lib/driveUrl';

interface Props {
  open: boolean;
  onClose: () => void;
  cliente: ClientePrevisional | null;
  onSave: (data: Partial<ClientePrevisional>, id?: string) => Promise<boolean>;
}

const PIPELINES: PipelinePrevisional[] = ['seguimiento', 'jubi_especiales', 'ucap', 'jubi_ordinarias', 'finalizado', 'descartado'];
const SUB_ESTADOS: SubEstadoPrevisional[] = ['EN PROCESO', 'EN ESPERA', 'EN PROCESO - SEGUIMIENTO EXPTE', 'EN PROCESO - REALIZAR TAREA', 'FINALIZADO', 'COBRADO'];

export default function FichaModal({ open, onClose, cliente, onSave }: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [section, setSection] = useState<'datos' | 'moratorias' | 'seguimiento' | 'cobro'>('datos');
  const [costoCuota, setCostoCuota] = useState<number>(getCostoMensual27705());
  const [costoEditando, setCostoEditando] = useState(false);

  // ── Speech-to-Text para campos de seguimiento ──
  const [sttField, setSttField] = useState<string | null>(null); // campo activo
  const recognitionRef = useRef<any>(null);

  const startSTT = (field: string, current: string) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { showToast('Tu navegador no soporta dictado de voz', 'error'); return; }
    if (sttField === field) {
      recognitionRef.current?.stop();
      setSttField(null);
      return;
    }
    recognitionRef.current?.stop();
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-AR';
    recognition.continuous = true;
    recognition.interimResults = false;
    let accumulated = current ? current + ' ' : '';
    recognition.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) accumulated += e.results[i][0].transcript + ' ';
      }
      setForm(f => ({ ...f, [field]: accumulated.trimEnd() }));
    };
    recognition.onerror = () => { setSttField(null); };
    recognition.onend = () => { setSttField(null); };
    recognitionRef.current = recognition;
    recognition.start();
    setSttField(field);
  };

  // ── Nota de voz por campo (graba audio + transcribe) ──
  const [fieldRecording, setFieldRecording] = useState<string | null>(null);
  const [fieldSaving, setFieldSaving] = useState<string | null>(null);
  const [fieldAudioUrls, setFieldAudioUrls] = useState<Record<string, string>>({});
  const fieldMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fieldAudioChunksRef = useRef<Blob[]>([]);
  const fieldRecognitionRef = useRef<any>(null);

  const loadFieldAudios = useCallback(async (clienteId: string) => {
    const fields = ['situacion_actual', 'resumen_informe', 'conclusion'];
    const urls: Record<string, string> = {};
    for (const f of fields) {
      const { data } = await supabase.storage.from('notas-voz').createSignedUrl(`previsional/${clienteId}-${f}.webm`, 3600);
      if (data?.signedUrl) urls[f] = data.signedUrl;
    }
    setFieldAudioUrls(urls);
  }, []);

  const startFieldRecording = async (field: string, current: string) => {
    if (fieldRecording === field) {
      fieldMediaRecorderRef.current?.stop();
      fieldRecognitionRef.current?.stop();
      setFieldRecording(null);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // STT simultáneo
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'es-AR';
        recognition.continuous = true;
        recognition.interimResults = false;
        let accumulated = current ? current + ' ' : '';
        recognition.onresult = (e: any) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) accumulated += e.results[i][0].transcript + ' ';
          }
          setForm(f => ({ ...f, [field]: accumulated.trimEnd() }));
        };
        recognition.start();
        fieldRecognitionRef.current = recognition;
      }
      // Grabación de audio
      const mr = new MediaRecorder(stream);
      fieldAudioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) fieldAudioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        fieldRecognitionRef.current?.stop();
        if (!cliente?.id) return;
        setFieldSaving(field);
        const blob = new Blob(fieldAudioChunksRef.current, { type: 'audio/webm' });
        const path = `previsional/${cliente.id}-${field}.webm`;
        await supabase.storage.from('notas-voz').upload(path, blob, { upsert: true, contentType: 'audio/webm' });
        await loadFieldAudios(cliente.id);
        setFieldSaving(null);
      };
      mr.start();
      fieldMediaRecorderRef.current = mr;
      setFieldRecording(field);
    } catch { showToast('No se pudo acceder al micrófono', 'error'); }
  };

  const deleteFieldAudio = async (field: string) => {
    if (!cliente?.id) return;
    await supabase.storage.from('notas-voz').remove([`previsional/${cliente.id}-${field}.webm`]);
    setFieldAudioUrls(prev => { const n = { ...prev }; delete n[field]; return n; });
  };
  type StorageFile = { name: string; path: string; size?: number; signedUrl?: string };
  const [archivos, setArchivos] = useState<StorageFile[]>([]);
  const [previewFile, setPreviewFile] = useState<StorageFile | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingArchivos, setLoadingArchivos] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadArchivos = useCallback(async (clienteId: string) => {
    setLoadingArchivos(true);
    const { data } = await supabase.storage.from('documentos').list('previsional/' + clienteId, { limit: 50 });
    if (data) {
      const files: StorageFile[] = [];
      for (const f of data) {
        const { data: sd } = await supabase.storage.from('documentos').createSignedUrl('previsional/' + clienteId + '/' + f.name, 3600);
        files.push({ name: f.name.replace(/^[0-9a-f-]+-/, ''), path: 'previsional/' + clienteId + '/' + f.name, size: (f.metadata as any)?.size, signedUrl: sd?.signedUrl });
      }
      setArchivos(files);
    }
    setLoadingArchivos(false);
  }, []);

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !cliente?.id) return;
    setSubiendo(true);
    const path = 'previsional/' + cliente.id + '/' + crypto.randomUUID() + '-' + file.name;
    const { error } = await supabase.storage.from('documentos').upload(path, file);
    if (error) { showToast('Error al subir: ' + error.message, 'error'); }
    else { await loadArchivos(cliente.id); }
    setSubiendo(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteFile = async (path: string) => {
    if (!cliente?.id) return;
    await supabase.storage.from('documentos').remove([path]);
    await loadArchivos(cliente.id);
  };

  // ── Nota de voz ──
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [savingAudio, setSavingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const loadAudio = useCallback(async (clienteId: string) => {
    const { data } = await supabase.storage.from('notas-voz').createSignedUrl('previsional/' + clienteId + '.webm', 3600);
    setAudioUrl(data?.signedUrl ?? null);
  }, []);

  // Reset on open/close
  useEffect(() => {
    if (open && cliente?.id) {
      loadArchivos(cliente.id);
      loadAudio(cliente.id);
      loadFieldAudios(cliente.id);
    } else {
      setArchivos([]);
      setAudioUrl(null);
      setFieldAudioUrls({});
      fieldMediaRecorderRef.current?.stop();
      fieldRecognitionRef.current?.stop();
      setFieldRecording(null);
      if (audioPlayerRef.current) { audioPlayerRef.current.pause(); audioPlayerRef.current = null; }
      setIsPlaying(false);
    }
  }, [open, cliente?.id, loadArchivos, loadAudio, loadFieldAudios]);

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
    pipeline: 'seguimiento' as PipelinePrevisional,
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
        situacion_actual: '', captado_por: '', pipeline: 'seguimiento', sub_estado: '',
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
    // Valida que la fecha sea ISO YYYY-MM-DD; si no, envía null
    const safeDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
    const data: Partial<ClientePrevisional> = {
      ...form,
      sexo: form.sexo as SexoCliente || null,
      sub_estado: form.sub_estado as SubEstadoPrevisional || null,
      fecha_nacimiento: safeDate(form.fecha_nacimiento),
      fecha_ultimo_contacto: safeDate(form.fecha_ultimo_contacto),
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
                  {moratoria.fechaEdadJubilatoria
                    ? `${String(moratoria.fechaEdadJubilatoria.getDate()).padStart(2, '0')}/${String(moratoria.fechaEdadJubilatoria.getMonth() + 1).padStart(2, '0')}/${moratoria.fechaEdadJubilatoria.getFullYear()}`
                    : '—'}
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
            {(() => {
              const chk = validateDriveUrl(form.url_drive || '');
              if (form.url_drive && chk.error) return <p className="text-xs text-red-400 mt-1">⚠ {chk.error}</p>;
              if (chk.warning) return <p className="text-xs text-amber-400 mt-1">ℹ {chk.warning}</p>;
              if (form.url_drive && chk.valid) return <p className="text-xs text-emerald-400 mt-1">✓ Link válido</p>;
              return null;
            })()}
          </div>

          {/* ── Documentos y Nota de Voz ── */}
          {cliente ? (
            <div className="space-y-3 pt-2 border-t border-white/[0.06]">
              {/* Documentos */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs font-medium text-gray-300">Documentos adjuntos</span>
                  {archivos.length > 0 && <span className="text-[10px] text-gray-500">({archivos.length})</span>}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={subiendo}
                  className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {subiendo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  Subir archivo
                </button>
                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.heic" className="hidden" onChange={handleUploadFile} />
              </div>
              {loadingArchivos ? (
                <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 text-gray-500 animate-spin" /></div>
              ) : archivos.length === 0 ? (
                <p className="text-[11px] text-gray-600 text-center py-2">Sin archivos adjuntos</p>
              ) : (
                <div className="space-y-1.5">
                  {archivos.map(f => (
                    <div key={f.path} className="flex items-center gap-2 glass-card px-3 py-2">
                      <Paperclip className="w-3 h-3 text-gray-500 flex-shrink-0" />
                      <span className="text-xs text-gray-300 flex-1 truncate" title={f.name}>{f.name}</span>
                      {f.size && <span className="text-[10px] text-gray-600">{(f.size / 1024).toFixed(0)} KB</span>}
                      {f.signedUrl && (
                        <>
                          <button type="button" onClick={() => setPreviewFile(f)} className="p-1 hover:bg-blue-500/10 rounded text-gray-500 hover:text-blue-400 transition-colors" title="Visualizar">
                            <Eye className="w-3 h-3" />
                          </button>
                          <a href={f.signedUrl} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-white transition-colors" title="Descargar">
                            <Download className="w-3 h-3" />
                          </a>
                        </>
                      )}
                      <button type="button" onClick={() => handleDeleteFile(f.path)} className="p-1 hover:bg-red-500/10 rounded text-gray-600 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Nota de voz */}
              <div className="flex items-center gap-3 pt-1">
                <Mic className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                <span className="text-xs font-medium text-gray-300">Nota de voz</span>
                <div className="flex items-center gap-2 ml-auto">
                  {audioUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!audioPlayerRef.current) {
                          audioPlayerRef.current = new Audio(audioUrl);
                          audioPlayerRef.current.onended = () => setIsPlaying(false);
                        }
                        if (isPlaying) { audioPlayerRef.current.pause(); setIsPlaying(false); }
                        else { audioPlayerRef.current.play(); setIsPlaying(true); }
                      }}
                      className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  {!isRecording ? (
                    <button
                      type="button"
                      title="Grabar nota de voz"
                      className="p-2 rounded-xl bg-white/[0.04] border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors"
                      onClick={async () => {
                        try {
                          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                          const mr = new MediaRecorder(stream);
                          audioChunksRef.current = [];
                          mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
                          mr.onstop = async () => {
                            stream.getTracks().forEach(t => t.stop());
                            setSavingAudio(true);
                            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                            const path = 'previsional/' + cliente.id + '.webm';
                            const { error } = await supabase.storage.from('notas-voz').upload(path, blob, { upsert: true, contentType: 'audio/webm' });
                            if (error) { showToast('Error al guardar audio', 'error'); }
                            else {
                              const { data: sd } = await supabase.storage.from('notas-voz').createSignedUrl(path, 3600);
                              if (sd) setAudioUrl(sd.signedUrl);
                              audioPlayerRef.current = null;
                            }
                            setSavingAudio(false);
                          };
                          mr.start();
                          mediaRecorderRef.current = mr;
                          setIsRecording(true);
                        } catch { showToast('No se pudo acceder al micrófono', 'error'); }
                      }}
                    >
                      <Mic className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      title="Detener grabación"
                      onClick={() => { mediaRecorderRef.current?.stop(); setIsRecording(false); }}
                      className="p-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 animate-pulse"
                    >
                      <Square className="w-3 h-3" />
                    </button>
                  )}
                  {audioUrl && !isRecording && (
                    <button
                      type="button"
                      title="Eliminar nota de voz"
                      onClick={async () => {
                        await supabase.storage.from('notas-voz').remove(['previsional/' + cliente.id + '.webm']);
                        if (audioPlayerRef.current) { audioPlayerRef.current.pause(); audioPlayerRef.current = null; }
                        setAudioUrl(null); setIsPlaying(false);
                      }}
                      className="p-2 rounded-xl bg-white/[0.04] border border-white/10 text-gray-500 hover:text-red-400 hover:border-red-500/20 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                  {savingAudio && <Loader2 className="w-3.5 h-3.5 text-gray-500 animate-spin" />}
                  <span className="text-[11px] text-gray-500">
                    {isRecording ? 'Grabando...' : savingAudio ? 'Guardando...' : audioUrl ? 'Guardada ✓' : 'Sin nota de voz'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-gray-600 text-center py-1 border-t border-white/[0.06] pt-3">
              Guardá la ficha primero para adjuntar documentos y notas de voz.
            </p>
          )}
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
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Costo mensual Ley 27.705 (editable)</p>
                    {costoEditando ? (
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400 font-bold">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          autoFocus
                          value={costoCuota}
                          onChange={e => setCostoCuota(parseFloat(e.target.value) || 0)}
                          onBlur={() => { setCostoMensual27705(costoCuota); setCostoEditando(false); }}
                          onKeyDown={e => { if (e.key === 'Enter') { setCostoMensual27705(costoCuota); setCostoEditando(false); } }}
                          className="input-dark text-xl font-bold text-emerald-400 w-40"
                        />
                        <span className="text-xs text-gray-500">/ mes</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCostoEditando(true)}
                        className="text-xl font-bold text-emerald-400 hover:underline"
                        title="Click para editar"
                      >
                        ${costoCuota.toLocaleString('es-AR', { minimumFractionDigits: 2 })} <span className="text-xs text-gray-500">/ mes</span>
                      </button>
                    )}
                    <p className="text-[10px] text-gray-500 mt-1">
                      Se guarda en este navegador y se usa para todos los cálculos. Default: ${COSTO_MENSUAL_27705_DEFAULT.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  {costoCuota !== COSTO_MENSUAL_27705_DEFAULT && (
                    <button
                      type="button"
                      onClick={() => { setCostoMensual27705(COSTO_MENSUAL_27705_DEFAULT); setCostoCuota(COSTO_MENSUAL_27705_DEFAULT); }}
                      className="text-[10px] text-gray-500 hover:text-white px-2 py-1 rounded border border-white/10"
                    >
                      Restaurar
                    </button>
                  )}
                </div>
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-400">Situación Actual / Paso a Seguir</label>
              <div className="flex items-center gap-1.5">
                {fieldAudioUrls['situacion_actual'] && (
                  <><audio src={fieldAudioUrls['situacion_actual']} controls className="h-6 w-28 opacity-70" />
                  <button type="button" onClick={() => deleteFieldAudio('situacion_actual')} className="p-0.5 text-gray-600 hover:text-red-400"><Trash2 className="w-3 h-3" /></button></>
                )}
                {fieldSaving === 'situacion_actual' && <Loader2 className="w-3 h-3 text-gray-500 animate-spin" />}
                <button type="button" onClick={() => startFieldRecording('situacion_actual', form.situacion_actual)}
                  title="Grabar nota de voz (guarda audio y transcribe)"
                  className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border transition-colors ${
                    fieldRecording === 'situacion_actual' ? 'bg-red-500/20 border-red-500/30 text-red-400 animate-pulse' : 'bg-white/[0.03] border-white/10 text-gray-500 hover:text-violet-400 hover:border-violet-500/20'
                  }`}>
                  {fieldRecording === 'situacion_actual' ? <><Square className="w-3 h-3" /> Detener</> : <><Mic className="w-3 h-3" /> Grabar</>}
                </button>
                <button type="button" onClick={() => startSTT('situacion_actual', form.situacion_actual)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md transition-colors ${
                    sttField === 'situacion_actual' ? 'bg-red-500/20 text-red-400 animate-pulse' : 'text-gray-500 hover:text-violet-400 hover:bg-violet-500/10'
                  }`}>
                  {sttField === 'situacion_actual' ? <><MicOff className="w-3 h-3" /> Detener</> : <><Mic className="w-3 h-3" /> Dictado</>}
                </button>
              </div>
            </div>
            <textarea rows={3} value={form.situacion_actual} onChange={e => setForm({ ...form, situacion_actual: e.target.value })} className="input-dark resize-none" placeholder="Descripción de la situación actual..." />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-400">Resumen / Informe Administrativo</label>
              <div className="flex items-center gap-1.5">
                {fieldAudioUrls['resumen_informe'] && (
                  <><audio src={fieldAudioUrls['resumen_informe']} controls className="h-6 w-28 opacity-70" />
                  <button type="button" onClick={() => deleteFieldAudio('resumen_informe')} className="p-0.5 text-gray-600 hover:text-red-400"><Trash2 className="w-3 h-3" /></button></>
                )}
                {fieldSaving === 'resumen_informe' && <Loader2 className="w-3 h-3 text-gray-500 animate-spin" />}
                <button type="button" onClick={() => startFieldRecording('resumen_informe', form.resumen_informe)}
                  title="Grabar nota de voz (guarda audio y transcribe)"
                  className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border transition-colors ${
                    fieldRecording === 'resumen_informe' ? 'bg-red-500/20 border-red-500/30 text-red-400 animate-pulse' : 'bg-white/[0.03] border-white/10 text-gray-500 hover:text-violet-400 hover:border-violet-500/20'
                  }`}>
                  {fieldRecording === 'resumen_informe' ? <><Square className="w-3 h-3" /> Detener</> : <><Mic className="w-3 h-3" /> Grabar</>}
                </button>
                <button type="button" onClick={() => startSTT('resumen_informe', form.resumen_informe)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md transition-colors ${
                    sttField === 'resumen_informe' ? 'bg-red-500/20 text-red-400 animate-pulse' : 'text-gray-500 hover:text-violet-400 hover:bg-violet-500/10'
                  }`}>
                  {sttField === 'resumen_informe' ? <><MicOff className="w-3 h-3" /> Detener</> : <><Mic className="w-3 h-3" /> Dictado</>}
                </button>
              </div>
            </div>
            <textarea rows={4} value={form.resumen_informe} onChange={e => setForm({ ...form, resumen_informe: e.target.value })} className="input-dark resize-none" placeholder="Informe detallado del caso..." />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-400">Conclusión</label>
              <div className="flex items-center gap-1.5">
                {fieldAudioUrls['conclusion'] && (
                  <><audio src={fieldAudioUrls['conclusion']} controls className="h-6 w-28 opacity-70" />
                  <button type="button" onClick={() => deleteFieldAudio('conclusion')} className="p-0.5 text-gray-600 hover:text-red-400"><Trash2 className="w-3 h-3" /></button></>
                )}
                {fieldSaving === 'conclusion' && <Loader2 className="w-3 h-3 text-gray-500 animate-spin" />}
                <button type="button" onClick={() => startFieldRecording('conclusion', form.conclusion)}
                  title="Grabar nota de voz (guarda audio y transcribe)"
                  className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border transition-colors ${
                    fieldRecording === 'conclusion' ? 'bg-red-500/20 border-red-500/30 text-red-400 animate-pulse' : 'bg-white/[0.03] border-white/10 text-gray-500 hover:text-violet-400 hover:border-violet-500/20'
                  }`}>
                  {fieldRecording === 'conclusion' ? <><Square className="w-3 h-3" /> Detener</> : <><Mic className="w-3 h-3" /> Grabar</>}
                </button>
                <button type="button" onClick={() => startSTT('conclusion', form.conclusion)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md transition-colors ${
                    sttField === 'conclusion' ? 'bg-red-500/20 text-red-400 animate-pulse' : 'text-gray-500 hover:text-violet-400 hover:bg-violet-500/10'
                  }`}>
                  {sttField === 'conclusion' ? <><MicOff className="w-3 h-3" /> Detener</> : <><Mic className="w-3 h-3" /> Dictado</>}
                </button>
              </div>
            </div>
            <textarea rows={2} value={form.conclusion} onChange={e => setForm({ ...form, conclusion: e.target.value })} className="input-dark resize-none" placeholder="Conclusión y próximos pasos..." />
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

      {/* ── Visor de documento inline ── */}
      {previewFile && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-black/90 backdrop-blur-sm" onClick={() => setPreviewFile(null)}>
          <div className="flex items-center justify-between px-4 py-3 bg-white/[0.04] border-b border-white/10" onClick={e => e.stopPropagation()}>
            <span className="text-sm text-gray-200 font-medium truncate max-w-[70%]">{previewFile.name}</span>
            <div className="flex items-center gap-2">
              <a href={previewFile.signedUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                <Download className="w-3 h-3" /> Descargar
              </a>
              <button onClick={() => setPreviewFile(null)} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            {/\.(jpg|jpeg|png|webp|gif|heic)$/i.test(previewFile.name) ? (
              <img src={previewFile.signedUrl} alt={previewFile.name} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
            ) : /\.pdf$/i.test(previewFile.name) ? (
              <iframe src={previewFile.signedUrl} className="w-full h-full min-h-[70vh] rounded-lg border border-white/10" title={previewFile.name} />
            ) : (
              <div className="text-center text-gray-400">
                <Paperclip className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm mb-3">Vista previa no disponible para este tipo de archivo.</p>
                <a href={previewFile.signedUrl} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm px-4 py-2 inline-flex items-center gap-2">
                  <Download className="w-4 h-4" /> Descargar para ver
                </a>
              </div>
            )}
          </div>
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
