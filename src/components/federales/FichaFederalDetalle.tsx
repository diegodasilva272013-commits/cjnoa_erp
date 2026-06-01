import { useEffect, useRef, useState } from 'react';
import {
  X, MessageSquare, ListChecks, Phone, MapPin, CreditCard, FileText, ExternalLink,
  Trash2, Check, Plus, Pencil, Mic, MicOff, Square, Paperclip, FolderOpen, Download,
  Users, ChevronDown as ChevDown, ChevronRight as ChevRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotasFederales, useTareasFederales } from '../../hooks/useFederales';
import { useFederalesDocs } from '../../hooks/useFederalesDocs';
import { supabase } from '../../lib/supabase';
import ArchivosFederalPanel from './ArchivosFederalPanel';
import NotasFeedPanel from '../cases/NotasFeedPanel';
import { PasosFederalEditor, PasosFederalEditorLocal, PerfilLite } from './FederalesPasosEditor';
import { notificarAsignacionPasoFederal } from '../../lib/tareaFederalPasosNotify';
import {
  ClienteFederal,
  PIPELINE_FEDERAL_LABELS,
  PIPELINE_FEDERAL_COLORS,
  TIPO_CASO_FEDERAL_LABELS,
  TareaFederal,
  NotaFederal,
} from '../../types/federales';

interface Props {
  ficha: ClienteFederal;
  onClose: () => void;
  onEdit?: () => void;
}

export default function FichaFederalDetalle({ ficha, onClose, onEdit }: Props) {
  const { user } = useAuth();

  const { notas, add: addNota, remove: removeNota } = useNotasFederales(ficha.id);
  const { tareas, upsert: upsertTarea, remove: removeTarea, toggleEstado } = useTareasFederales(ficha.id);
  const { docs } = useFederalesDocs(ficha.id);

  const [nuevaNota, setNuevaNota] = useState('');
  const [nuevaTareaTitulo, setNuevaTareaTitulo] = useState('');
  const [nuevaTareaDescripcion, setNuevaTareaDescripcion] = useState('');
  const [nuevaTareaResponsable, setNuevaTareaResponsable] = useState('');
  const [nuevaTareaFechaLimite, setNuevaTareaFechaLimite] = useState('');
  const [nuevaTareaPrioridad, setNuevaTareaPrioridad] = useState<'alta' | 'media' | 'sin_prioridad'>('sin_prioridad');
  const [tareaEdit, setTareaEdit] = useState<TareaFederal | null>(null);

  // ── Pasos compartidos ──
  const [perfiles, setPerfiles] = useState<PerfilLite[]>([]);
  const [nuevaTareaPasos, setNuevaTareaPasos] = useState<{ descripcion: string; responsable_id: string }[]>([]);
  const [mostrarPasosNueva, setMostrarPasosNueva] = useState(false);
  const [pasosExpandidos, setPasosExpandidos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    supabase.from('perfiles').select('id, nombre').eq('activo', true).order('nombre').then(({ data }) => {
      if (data) setPerfiles(data as PerfilLite[]);
    });
  }, []);

  // ── Dictado (Web Speech API) ──
  const [dictando, setDictando] = useState(false);
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef<string>('');
  function toggleDictado() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Tu navegador no soporta dictado por voz.'); return; }
    if (dictando) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = 'es-AR';
    rec.continuous = true;
    rec.interimResults = true;
    baseTextRef.current = nuevaNota ? nuevaNota.trimEnd() + ' ' : '';
    rec.onresult = (e: any) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      setNuevaNota(baseTextRef.current + final + interim);
      if (final) baseTextRef.current += final;
    };
    rec.onend = () => setDictando(false);
    rec.onerror = () => setDictando(false);
    recognitionRef.current = rec;
    setDictando(true);
    rec.start();
  }
  useEffect(() => () => { recognitionRef.current?.stop?.(); }, []);

  // ── Grabación de audio ──
  const [grabando, setGrabando] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setGrabando(true);
    } catch (e: any) {
      alert('No se pudo acceder al micrófono: ' + (e?.message || e));
    }
  }
  function stopRec() {
    mediaRecorderRef.current?.stop();
    setGrabando(false);
  }
  function discardAudio() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
  }

  // ── Envío de nota (texto + audio) ──
  const [enviando, setEnviando] = useState(false);
  async function handleAddNota() {
    if (!nuevaNota.trim() && !audioBlob) return;
    setEnviando(true);
    const ok = await addNota(nuevaNota, user?.id || null, audioBlob);
    setEnviando(false);
    if (ok) {
      setNuevaNota('');
      discardAudio();
    }
  }

  async function handleAddTarea() {
    if (!nuevaTareaTitulo.trim()) return;
    const titulo = nuevaTareaTitulo.trim();
    const responsablePerfil = perfiles.find(p => p.id === nuevaTareaResponsable) || null;
    // Insert tarea y obtener el id para persistir los pasos locales
    const { data: inserted, error } = await supabase
      .from('tareas_federales')
      .insert({
        cliente_fed_id: ficha.id,
        titulo,
        descripcion: nuevaTareaDescripcion.trim() || null,
        estado: 'pendiente',
        prioridad: nuevaTareaPrioridad,
        fecha_limite: nuevaTareaFechaLimite || null,
        responsable_id: responsablePerfil?.id || null,
        responsable_nombre: responsablePerfil?.nombre || null,
        created_by: user?.id || null,
      })
      .select('id')
      .single();
    if (error || !inserted) {
      alert('No se pudo crear la tarea: ' + (error?.message || ''));
      return;
    }
    const tareaId = (inserted as any).id as string;

    const pasosValidos = nuevaTareaPasos
      .map((p, idx) => ({ ...p, orden: idx + 1 }))
      .filter(p => p.descripcion.trim().length > 0);
    if (pasosValidos.length > 0) {
      const rows = pasosValidos.map(p => ({
        tarea_federal_id: tareaId,
        orden: p.orden,
        descripcion: p.descripcion.trim(),
        responsable_id: p.responsable_id || null,
      }));
      const { error: e2 } = await supabase.from('tarea_federal_pasos').insert(rows);
      if (e2) {
        alert('Tarea creada pero fallaron los pasos: ' + e2.message);
      } else if (user?.id) {
        for (const p of pasosValidos) {
          if (p.responsable_id) {
            notificarAsignacionPasoFederal(tareaId, p.responsable_id, p.descripcion.trim(), user.id, '');
          }
        }
      }
    }

    setNuevaTareaTitulo('');
    setNuevaTareaDescripcion('');
    setNuevaTareaResponsable('');
    setNuevaTareaFechaLimite('');
    setNuevaTareaPrioridad('sin_prioridad');
    setNuevaTareaPasos([]);
    setMostrarPasosNueva(false);
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content sm:max-w-3xl">
        {/* Header estilo provincial */}
        <div className="shrink-0 px-5 sm:px-6 pt-4 pb-3 border-b border-white/[0.06] bg-gradient-to-br from-[#141418]/95 to-[#111115]/95">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <span className={`badge border ${PIPELINE_FEDERAL_COLORS[ficha.pipeline]}`}>
                {PIPELINE_FEDERAL_LABELS[ficha.pipeline]}
              </span>
              <span className="badge border bg-blue-500/10 text-blue-300 border-blue-500/20">Federal</span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border bg-white/10 border-white/20 text-white hover:bg-white/15"
                  title="Editar datos del caso"
                >
                  <Pencil className="w-3 h-3 inline mr-1" /> Editar
                </button>
              )}
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-300 text-gray-400 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <h2 className="text-base font-bold text-white leading-tight">{ficha.apellido_nombre}</h2>
          {ficha.numero_expediente && (
            <p className="text-xs text-gray-500 font-mono mt-0.5">Expte: {ficha.numero_expediente}</p>
          )}
        </div>

        {/* Body single-scroll, estilo provincial */}
        <div className="px-5 sm:px-6 py-5 space-y-4">
          {/* Datos compactos */}
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              {ficha.captado_por && (
                <div className="col-span-3 flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500/30 to-violet-700/20 flex items-center justify-center text-violet-300 text-[10px] font-bold shrink-0">
                    {(ficha.captado_por.split(' ').map(s => s[0]).join('').slice(0, 2) || '?').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-white truncate">{ficha.captado_por}</p>
                    <p className="text-[10px] text-gray-500">Captado por</p>
                  </div>
                  {ficha.telefono && (
                    <a href={`tel:${ficha.telefono}`} className="ml-auto shrink-0 text-[11px] text-emerald-400 hover:underline font-medium">
                      <Phone className="w-3 h-3 inline mr-1" />{ficha.telefono}
                    </a>
                  )}
                </div>
              )}
              {([
                ['CUIL', ficha.cuil, 'font-mono text-[10px]'],
                ['Expediente', ficha.numero_expediente, 'font-mono text-[10px]'],
                ['Sexo', ficha.sexo, ''],
                ['Nacimiento', ficha.fecha_nacimiento, ''],
                ['Dirección', ficha.direccion, 'col-span-2'],
                ['Cobro total', ficha.cobro_total ? `$ ${ficha.cobro_total.toLocaleString('es-AR')}` : null, 'text-amber-400'],
                ['Cobrado', ficha.monto_cobrado ? `$ ${ficha.monto_cobrado.toLocaleString('es-AR')}` : null, 'text-emerald-400'],
                ['Clave social', ficha.clave_social, ''],
                ['Clave fiscal', ficha.clave_fiscal, ''],
              ] as [string, string | null | undefined, string][])
                .filter(([, v]) => v)
                .map(([label, val, cls]) => (
                  <div key={label} className={`px-2.5 py-1.5 rounded-lg bg-white/[0.025] border border-white/[0.04] min-w-0 ${cls.includes('col-span') ? cls : ''}`}>
                    <p className="text-[9px] text-gray-600 uppercase tracking-widest leading-none mb-0.5">{label}</p>
                    <p className={`text-[11px] text-white font-medium truncate ${cls.includes('col-span') ? '' : cls}`} title={val ?? ''}>{val}</p>
                  </div>
                ))
              }
              {(ficha.tipo_caso || []).length > 0 && (
                <div className="col-span-3 px-2.5 py-1.5 rounded-lg bg-white/[0.025] border border-white/[0.04]">
                  <p className="text-[9px] text-gray-600 uppercase tracking-widest leading-none mb-1">Tipos de caso</p>
                  <div className="flex flex-wrap gap-1">
                    {ficha.tipo_caso.map(t => (
                      <span key={t} className="px-1.5 py-0.5 text-[10px] rounded border border-blue-500/30 bg-blue-500/10 text-blue-300">
                        {TIPO_CASO_FEDERAL_LABELS[t]}{t === 'otros' && ficha.tipo_caso_otros ? `: ${ficha.tipo_caso_otros}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {ficha.url_drive && (
                <a href={ficha.url_drive} target="_blank" rel="noopener noreferrer"
                  className="col-span-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] hover:bg-blue-500/20 transition-colors">
                  <ExternalLink className="w-3 h-3 shrink-0" />Abrir carpeta en Drive
                </a>
              )}
            </div>

            {ficha.resumen_informe && (
              <details className="group" open>
                <summary className="cursor-pointer list-none flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.025] border border-white/[0.04] hover:bg-white/[0.04] transition-colors">
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold">Resumen / informe</p>
                  <span className="text-[9px] text-gray-600 group-open:hidden">▾ expandir</span>
                  <span className="text-[9px] text-gray-600 hidden group-open:inline">▴ colapsar</span>
                </summary>
                <div className="px-2.5 py-2 text-xs text-gray-300 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto bg-white/[0.015] rounded-b-lg border-x border-b border-white/[0.04]">{ficha.resumen_informe}</div>
              </details>
            )}
            {ficha.conclusion && (
              <details className="group">
                <summary className="cursor-pointer list-none flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.025] border border-white/[0.04] hover:bg-white/[0.04] transition-colors">
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold">Conclusión</p>
                  <span className="text-[9px] text-gray-600 group-open:hidden">▾ expandir</span>
                  <span className="text-[9px] text-gray-600 hidden group-open:inline">▴ colapsar</span>
                </summary>
                <div className="px-2.5 py-2 text-xs text-gray-300 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto bg-white/[0.015] rounded-b-lg border-x border-b border-white/[0.04]">{ficha.conclusion}</div>
              </details>
            )}
            {ficha.situacion_actual && (
              <details className="group">
                <summary className="cursor-pointer list-none flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.025] border border-white/[0.04] hover:bg-white/[0.04] transition-colors">
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold">Situación actual</p>
                  <span className="text-[9px] text-gray-600 group-open:hidden">▾ expandir</span>
                  <span className="text-[9px] text-gray-600 hidden group-open:inline">▴ colapsar</span>
                </summary>
                <div className="px-2.5 py-2 text-xs text-gray-300 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto bg-white/[0.015] rounded-b-lg border-x border-b border-white/[0.04]">{ficha.situacion_actual}</div>
              </details>
            )}
          </div>

          {/* Seguimiento (panel unificado, mismo componente que casos provinciales) */}
          <div className="pt-3 border-t border-white/[0.06]">
            <NotasFeedPanel casoId={ficha.id} variant="federal" />
          </div>

          {/* Bloques legacy ocultos: el panel unificado reemplaza Notas + Tareas */}
          {false && (<>
          <div className="pt-3 border-t border-white/[0.06]">
            <h3 className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3 flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5" /> Seguimiento del caso
            </h3>
          {true && (
            <div className="space-y-3">
              <div className="space-y-2 bg-gray-800/30 border border-gray-700 rounded p-2">
                <textarea
                  value={nuevaNota}
                  onChange={e => setNuevaNota(e.target.value)}
                  placeholder="Agregar nota de seguimiento... (también podés dictar, grabar audio o adjuntar documentos)"
                  className="w-full min-h-[60px] px-3 py-2 bg-gray-900/60 border border-gray-700 rounded text-sm text-white focus:border-blue-500 outline-none"
                />

                {/* Preview audio grabado */}
                {audioUrl && (
                  <div className="flex items-center gap-2 bg-gray-900/60 border border-emerald-500/30 rounded px-2 py-1">
                    <Mic className="w-3.5 h-3.5 text-emerald-400" />
                    <audio src={audioUrl} controls className="h-8 flex-1" />
                    <button onClick={discardAudio} className="text-red-400 hover:text-red-300" title="Descartar audio">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 items-center">
                  <button
                    type="button"
                    onClick={toggleDictado}
                    className={`px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1 border transition-colors ${
                      dictando
                        ? 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
                        : 'bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700'
                    }`}
                    title={dictando ? 'Detener dictado' : 'Dictar (voz a texto)'}
                  >
                    {dictando ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                    {dictando ? 'Detener dictado' : 'Dictar'}
                  </button>

                  {!grabando ? (
                    <button
                      type="button"
                      onClick={startRec}
                      disabled={!!audioBlob}
                      className="px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1 border bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700 disabled:opacity-40"
                      title="Grabar nota de voz"
                    >
                      <Mic className="w-3.5 h-3.5" /> Grabar audio
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopRec}
                      className="px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1 border bg-red-500/20 text-red-300 border-red-500/40 animate-pulse"
                      title="Detener grabación"
                    >
                      <Square className="w-3.5 h-3.5" /> Detener
                    </button>
                  )}

                  <div className="flex-1" />

                  <button
                    onClick={handleAddNota}
                    disabled={enviando || (!nuevaNota.trim() && !audioBlob)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-xs font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> {enviando ? 'Guardando…' : 'Agregar nota'}
                  </button>
                </div>
              </div>

              {notas.length === 0
                ? <div className="text-center text-gray-500 text-sm py-8">Sin notas todavía.</div>
                : (
                  <ul className="space-y-2">
                    {notas.map(n => (
                      <NotaItem key={n.id} nota={n} onRemove={() => removeNota(n.id)} />
                    ))}
                  </ul>
                )}
            </div>
          )}

          </div>

          {/* Tareas */}
          <div className="pt-3 border-t border-white/[0.06]">
            <h3 className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3 flex items-center gap-2">
              <ListChecks className="w-3.5 h-3.5" /> Tareas y delegación ({tareas.length})
            </h3>
          {true && (
            <div className="space-y-3">
              <div className="space-y-2 bg-gray-800/30 border border-gray-700 rounded p-2">
                <div className="flex gap-2">
                  <input
                    value={nuevaTareaTitulo}
                    onChange={e => setNuevaTareaTitulo(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !mostrarPasosNueva && nuevaTareaResponsable) handleAddTarea(); }}
                    placeholder="Título de la tarea..."
                    className="flex-1 px-3 py-2 bg-gray-900/60 border border-gray-700 rounded text-sm text-white focus:border-blue-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarPasosNueva(v => !v)}
                    className={`px-2.5 py-2 rounded text-xs font-semibold flex items-center gap-1 border transition-colors ${
                      mostrarPasosNueva
                        ? 'bg-violet-500/20 text-violet-200 border-violet-500/40'
                        : 'bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700'
                    }`}
                    title="Tarea compartida en varios pasos"
                  >
                    <Users className="w-3.5 h-3.5" /> Pasos
                  </button>
                  <button
                    onClick={handleAddTarea}
                    disabled={!nuevaTareaTitulo.trim() || !nuevaTareaResponsable}
                    title={!nuevaTareaResponsable ? 'Elegí un responsable' : 'Agregar tarea'}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-sm font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" /> Agregar
                  </button>
                </div>

                <textarea
                  value={nuevaTareaDescripcion}
                  onChange={e => setNuevaTareaDescripcion(e.target.value)}
                  placeholder="Descripción / instrucciones para el responsable (opcional)"
                  rows={2}
                  className="w-full px-3 py-2 bg-gray-900/60 border border-gray-700 rounded text-xs text-white placeholder-gray-500 focus:border-blue-500 outline-none resize-none"
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    value={nuevaTareaResponsable}
                    onChange={e => setNuevaTareaResponsable(e.target.value)}
                    className={`px-2 py-2 bg-gray-900/60 border rounded text-xs text-white focus:outline-none ${
                      nuevaTareaResponsable ? 'border-gray-700 focus:border-blue-500' : 'border-amber-500/40 focus:border-amber-500'
                    }`}
                  >
                    <option value="">Asignar a (socio / secretario)…</option>
                    {perfiles.map(p => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={nuevaTareaFechaLimite}
                    onChange={e => setNuevaTareaFechaLimite(e.target.value)}
                    title="Fecha de vencimiento"
                    className="px-2 py-2 bg-gray-900/60 border border-gray-700 rounded text-xs text-white focus:border-blue-500 outline-none"
                  />
                  <select
                    value={nuevaTareaPrioridad}
                    onChange={e => setNuevaTareaPrioridad(e.target.value as 'alta' | 'media' | 'sin_prioridad')}
                    className="px-2 py-2 bg-gray-900/60 border border-gray-700 rounded text-xs text-white focus:border-blue-500 outline-none"
                  >
                    <option value="sin_prioridad">Sin prioridad</option>
                    <option value="media">Prioridad media</option>
                    <option value="alta">Prioridad alta</option>
                  </select>
                </div>

                {!nuevaTareaResponsable && nuevaTareaTitulo.trim() && (
                  <p className="text-[10px] text-amber-400/80 flex items-center gap-1 px-1">
                    <Users className="w-3 h-3" /> Elegí un responsable para que vea la tarea en su panel.
                  </p>
                )}

                {mostrarPasosNueva && (
                  <PasosFederalEditorLocal
                    pasos={nuevaTareaPasos}
                    setPasos={setNuevaTareaPasos}
                    perfiles={perfiles}
                  />
                )}
              </div>

              {tareas.length === 0
                ? <div className="text-center text-gray-500 text-sm py-8">Sin tareas todavía.</div>
                : (
                  <ul className="space-y-2">
                    {tareas.map(t => (
                      <li key={t.id} className="bg-gray-800/40 border border-gray-700 rounded p-3 space-y-2">
                        <div className="flex items-start gap-2">
                        <button
                          onClick={() => toggleEstado(t)}
                          className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${
                            t.estado === 'completada'
                              ? 'bg-emerald-500 border-emerald-400 text-white'
                              : 'border-gray-500 hover:border-emerald-400'
                          }`}
                          title={t.estado === 'completada' ? 'Marcar pendiente' : 'Marcar completada'}
                        >
                          {t.estado === 'completada' && <Check className="w-3.5 h-3.5" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          {tareaEdit?.id === t.id ? (
                            <input
                              autoFocus
                              value={tareaEdit.titulo}
                              onChange={e => setTareaEdit({ ...tareaEdit, titulo: e.target.value })}
                              onBlur={async () => {
                                if (tareaEdit.titulo.trim() && tareaEdit.titulo !== t.titulo) {
                                  await upsertTarea({ titulo: tareaEdit.titulo.trim() }, t.id);
                                }
                                setTareaEdit(null);
                              }}
                              onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                              className="w-full px-2 py-1 bg-gray-900 border border-blue-500 rounded text-sm text-white"
                            />
                          ) : (
                            <button
                              onClick={() => setTareaEdit(t)}
                              className={`text-sm text-left w-full ${t.estado === 'completada' ? 'line-through text-gray-500' : 'text-gray-100'}`}
                            >
                              {t.titulo}
                            </button>
                          )}
                          {t.fecha_limite && (
                            <div className="text-[10px] text-amber-400 mt-0.5 flex items-center gap-1">
                              ⏰ Vence: {new Date(t.fecha_limite + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            {t.responsable_nombre && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-200 flex items-center gap-1">
                                <Users className="w-3 h-3" />{t.responsable_nombre}
                              </span>
                            )}
                            {t.prioridad === 'alta' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">Prioridad alta</span>
                            )}
                            {t.prioridad === 'media' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">Prioridad media</span>
                            )}
                            {t.estado === 'completada' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Completada</span>
                            )}
                          </div>
                          {t.descripcion && (
                            <p className="text-[11px] text-gray-300 whitespace-pre-wrap mt-1 border-l-2 border-violet-500/30 pl-2">{t.descripcion}</p>
                          )}
                          {(t.archivos || []).length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {(t.archivos || []).map((a, i) => (
                                <TareaArchivoChip
                                  key={i}
                                  path={a.url}
                                  nombre={a.nombre}
                                  onRemove={async () => {
                                    await supabase.storage.from('federales-adjuntos').remove([a.url]).catch(() => {});
                                    const next = (t.archivos || []).filter((_, j) => j !== i);
                                    await upsertTarea({ archivos: next.length ? next : null }, t.id);
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        <TareaAttachButton
                          tareaId={t.id}
                          clienteId={ficha.id}
                          archivosActuales={t.archivos || []}
                          onAttached={async (next) => { await upsertTarea({ archivos: next }, t.id); }}
                        />
                        <button
                          onClick={() => setPasosExpandidos(s => ({ ...s, [t.id]: !s[t.id] }))}
                          className={`p-1 rounded ${pasosExpandidos[t.id] ? 'text-violet-300 bg-violet-500/15' : 'text-gray-400 hover:text-violet-300'}`}
                          title="Pasos compartidos"
                        >
                          {pasosExpandidos[t.id] ? <ChevDown className="w-3.5 h-3.5" /> : <ChevRight className="w-3.5 h-3.5" />}
                          <Users className="w-3 h-3 inline-block ml-0.5" />
                        </button>
                        <button
                          onClick={() => { if (confirm('¿Eliminar tarea?')) removeTarea(t.id); }}
                          className="text-red-400 hover:text-red-300"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        </div>
                        {pasosExpandidos[t.id] && (
                          <PasosFederalEditor tareaFederalId={t.id} perfiles={perfiles} />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          )}

          </div>
          </>)}

          {/* Documentos */}
          <div className="pt-3 border-t border-white/[0.06]">
            <ArchivosFederalPanel clienteId={ficha.id} />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.06]">
            <button onClick={onClose} className="btn-secondary text-sm px-4">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, icon }: { label: string; value: string | null | undefined; icon?: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <div className="text-xs uppercase text-gray-500 font-bold w-36 flex-shrink-0 flex items-center gap-1">{icon}{label}</div>
      <div className="text-gray-200">{value || <span className="text-gray-600 italic">—</span>}</div>
    </div>
  );
}
function Block({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-gray-500 font-bold mb-1">{title}</div>
      <div className="bg-gray-800/40 border border-gray-700 rounded p-3 text-gray-100 text-sm whitespace-pre-wrap">{text}</div>
    </div>
  );
}

// ─── Nota item con audio + documento ──────────────────────────────
function NotaItem({ nota, onRemove }: { nota: NotaFederal; onRemove: () => void }) {
  return (
    <li className="bg-gray-800/40 border border-gray-700 rounded p-3 group">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm text-gray-100 whitespace-pre-wrap flex-1">{nota.contenido}</div>
        <button
          onClick={() => { if (confirm('¿Eliminar nota?')) onRemove(); }}
          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300"
          title="Eliminar"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {nota.audio_path && <AudioPlayer path={nota.audio_path} />}
      {nota.documento_path && (
        <NotaDocLink path={nota.documento_path} nombre={nota.documento_nombre || 'Documento'} />
      )}
      <div className="text-[10px] text-gray-500 mt-1">{new Date(nota.created_at).toLocaleString('es-AR')}</div>
    </li>
  );
}

function AudioPlayer({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    supabase.storage.from('notas-voz').createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancel && data?.signedUrl) setUrl(data.signedUrl);
    });
    return () => { cancel = true; };
  }, [path]);
  if (!url) return <div className="mt-1.5 text-[10px] text-gray-500">Cargando audio…</div>;
  return (
    <div className="mt-1.5 flex items-center gap-2 bg-gray-900/60 border border-gray-700 rounded px-2 py-1">
      <Mic className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
      <audio src={url} controls className="h-7 flex-1" />
    </div>
  );
}

function NotaDocLink({ path, nombre }: { path: string; nombre: string }) {
  async function open() {
    const { data, error } = await supabase.storage.from('federales-adjuntos').createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) { alert('No se pudo abrir el documento'); return; }
    window.open(data.signedUrl, '_blank');
  }
  return (
    <button
      onClick={open}
      className="mt-1.5 flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded px-2 py-1"
    >
      <Paperclip className="w-3.5 h-3.5" />
      <span className="truncate max-w-[260px]">{nombre}</span>
      <Download className="w-3 h-3 opacity-70" />
    </button>
  );
}

function TareaArchivoChip({ path, nombre, onRemove }: { path: string; nombre: string; onRemove: () => void }) {
  async function open() {
    const { data, error } = await supabase.storage.from('federales-adjuntos').createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) { alert('No se pudo abrir el documento'); return; }
    window.open(data.signedUrl, '_blank');
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded px-1.5 py-0.5">
      <button onClick={open} className="flex items-center gap-1 hover:text-blue-200" title="Abrir">
        <Paperclip className="w-3 h-3" />
        <span className="truncate max-w-[180px]">{nombre}</span>
      </button>
      <button
        onClick={() => { if (confirm('¿Quitar archivo?')) onRemove(); }}
        className="text-red-400 hover:text-red-300"
        title="Quitar"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

function TareaAttachButton({
  tareaId, clienteId, archivosActuales, onAttached,
}: {
  tareaId: string;
  clienteId: string;
  archivosActuales: Array<{ url: string; nombre: string }>;
  onAttached: (next: Array<{ url: string; nombre: string }>) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    const safeName = f.name.replace(/[^\w.\-]+/g, '_');
    const path = `federales/${clienteId}/tareas/${tareaId}/${Date.now()}-${safeName}`;
    const up = await supabase.storage.from('federales-adjuntos').upload(path, f, { contentType: f.type, upsert: false });
    setBusy(false);
    if (up.error) { alert('No se pudo subir: ' + up.error.message); return; }
    await onAttached([...archivosActuales, { url: path, nombre: f.name }]);
    if (inputRef.current) inputRef.current.value = '';
  }
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="text-gray-400 hover:text-blue-300 disabled:opacity-40"
        title="Adjuntar archivo"
      >
        <Paperclip className="w-3.5 h-3.5" />
      </button>
      <input ref={inputRef} type="file" className="hidden" onChange={onPick} />
    </>
  );
}
