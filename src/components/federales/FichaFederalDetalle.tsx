import { useEffect, useRef, useState } from 'react';
import {
  X, MessageSquare, ListChecks, Phone, MapPin, CreditCard, FileText, ExternalLink,
  Trash2, Check, Plus, Pencil, Mic, MicOff, Square, Paperclip, Download,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotasFederales, useTareasFederales } from '../../hooks/useFederales';
import { supabase } from '../../lib/supabase';
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
  const [tab, setTab] = useState<'datos' | 'seguimiento' | 'tareas'>('seguimiento');

  const { notas, add: addNota, remove: removeNota } = useNotasFederales(ficha.id);
  const { tareas, upsert: upsertTarea, remove: removeTarea, toggleEstado } = useTareasFederales(ficha.id);

  const [nuevaNota, setNuevaNota] = useState('');
  const [nuevaTareaTitulo, setNuevaTareaTitulo] = useState('');
  const [tareaEdit, setTareaEdit] = useState<TareaFederal | null>(null);

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

  // ── Subida de documento ──
  const docInputRef = useRef<HTMLInputElement>(null);
  const [docFile, setDocFile] = useState<File | null>(null);

  // ── Envío de nota (texto + audio + doc) ──
  const [enviando, setEnviando] = useState(false);
  async function handleAddNota() {
    if (!nuevaNota.trim() && !audioBlob && !docFile) return;
    setEnviando(true);
    const ok = await addNota(
      nuevaNota,
      user?.id || null,
      audioBlob,
      docFile ? { file: docFile } : null,
    );
    setEnviando(false);
    if (ok) {
      setNuevaNota('');
      discardAudio();
      setDocFile(null);
      if (docInputRef.current) docInputRef.current.value = '';
    }
  }

  async function handleAddTarea() {
    if (!nuevaTareaTitulo.trim()) return;
    const ok = await upsertTarea({
      titulo: nuevaTareaTitulo.trim(),
      estado: 'pendiente',
      prioridad: 'sin_prioridad',
      created_by: user?.id || null,
    });
    if (ok) setNuevaTareaTitulo('');
  }

  return (
    <div className="fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-700">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-white truncate">{ficha.apellido_nombre}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${PIPELINE_FEDERAL_COLORS[ficha.pipeline]}`}>
                  {PIPELINE_FEDERAL_LABELS[ficha.pipeline]}
                </span>
                {ficha.numero_expediente && (
                  <span className="text-xs text-gray-400">Expte: <span className="text-white font-mono">{ficha.numero_expediente}</span></span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-500/15 text-blue-300 border border-blue-500/30 hover:bg-blue-500/25 hover:text-blue-200 transition-colors"
                  title="Editar datos del caso"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Editar
                </button>
              )}
              <button onClick={onClose} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3 border-b border-gray-800 -mb-4">
            {([
              { id: 'datos', label: 'Datos', icon: <CreditCard className="w-3.5 h-3.5" /> },
              { id: 'seguimiento', label: 'Seguimiento', icon: <MessageSquare className="w-3.5 h-3.5" /> },
              { id: 'tareas', label: `Tareas (${tareas.length})`, icon: <ListChecks className="w-3.5 h-3.5" /> },
            ] as const).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1 ${
                  tab === t.id ? 'border-blue-400 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'datos' && (
            <div className="space-y-3 text-sm">
              <Row label="CUIL" value={ficha.cuil} icon={<CreditCard className="w-3.5 h-3.5" />} />
              <Row label="Teléfono" value={ficha.telefono} icon={<Phone className="w-3.5 h-3.5" />} />
              <Row label="Dirección" value={ficha.direccion} icon={<MapPin className="w-3.5 h-3.5" />} />
              <Row label="Clave social" value={ficha.clave_social} />
              <Row label="Clave fiscal" value={ficha.clave_fiscal} />
              <Row label="Fecha nacimiento" value={ficha.fecha_nacimiento} />
              <Row label="Sexo" value={ficha.sexo} />
              <Row label="Número expediente" value={ficha.numero_expediente} />
              <div>
                <div className="text-xs uppercase text-gray-500 font-bold mb-1">Tipo(s) de caso</div>
                {(ficha.tipo_caso || []).length === 0
                  ? <div className="text-gray-500 text-xs italic">Sin especificar</div>
                  : (
                    <div className="flex flex-wrap gap-1.5">
                      {ficha.tipo_caso.map(t => (
                        <span key={t} className="px-2 py-0.5 text-xs rounded border border-blue-500/30 bg-blue-500/10 text-blue-300">
                          {TIPO_CASO_FEDERAL_LABELS[t]}{t === 'otros' && ficha.tipo_caso_otros ? `: ${ficha.tipo_caso_otros}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
              </div>
              <Row label="Captado por" value={ficha.captado_por} />
              <Row label="Cobro total" value={ficha.cobro_total ? `$ ${ficha.cobro_total.toLocaleString('es-AR')}` : null} />
              <Row label="Cobrado" value={ficha.monto_cobrado ? `$ ${ficha.monto_cobrado.toLocaleString('es-AR')}` : null} />
              {ficha.url_drive && (
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <a href={ficha.url_drive} target="_blank" rel="noreferrer"
                     className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1">
                    Drive del caso <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {ficha.resumen_informe && <Block title="Resumen / informe" text={ficha.resumen_informe} />}
              {ficha.conclusion && <Block title="Conclusión" text={ficha.conclusion} />}
              {ficha.situacion_actual && <Block title="Situación actual" text={ficha.situacion_actual} />}
            </div>
          )}

          {tab === 'seguimiento' && (
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

                {/* Preview documento */}
                {docFile && (
                  <div className="flex items-center gap-2 bg-gray-900/60 border border-blue-500/30 rounded px-2 py-1 text-xs">
                    <Paperclip className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-gray-200 truncate flex-1">{docFile.name}</span>
                    <span className="text-gray-500">{(docFile.size / 1024).toFixed(0)} KB</span>
                    <button
                      onClick={() => { setDocFile(null); if (docInputRef.current) docInputRef.current.value = ''; }}
                      className="text-red-400 hover:text-red-300"
                      title="Descartar"
                    >
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

                  <button
                    type="button"
                    onClick={() => docInputRef.current?.click()}
                    className="px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1 border bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                    title="Adjuntar documento"
                  >
                    <Paperclip className="w-3.5 h-3.5" /> Documento
                  </button>
                  <input
                    ref={docInputRef}
                    type="file"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) setDocFile(f);
                    }}
                  />

                  <div className="flex-1" />

                  <button
                    onClick={handleAddNota}
                    disabled={enviando || (!nuevaNota.trim() && !audioBlob && !docFile)}
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

          {tab === 'tareas' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={nuevaTareaTitulo}
                  onChange={e => setNuevaTareaTitulo(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddTarea(); }}
                  placeholder="Nueva tarea..."
                  className="flex-1 px-3 py-2 bg-gray-800/60 border border-gray-700 rounded text-sm text-white focus:border-blue-500 outline-none"
                />
                <button
                  onClick={handleAddTarea}
                  disabled={!nuevaTareaTitulo.trim()}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-sm font-semibold flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Agregar
                </button>
              </div>

              {tareas.length === 0
                ? <div className="text-center text-gray-500 text-sm py-8">Sin tareas todavía.</div>
                : (
                  <ul className="space-y-2">
                    {tareas.map(t => (
                      <li key={t.id} className="bg-gray-800/40 border border-gray-700 rounded p-3 flex items-start gap-2">
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
                            <div className="text-[10px] text-amber-400 mt-0.5">Vence: {t.fecha_limite}</div>
                          )}
                          {(t.archivos || []).length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {(t.archivos || []).map((a, i) => (
                                <TareaArchivoChip
                                  key={i}
                                  path={a.url}
                                  nombre={a.nombre}
                                  onRemove={async () => {
                                    await supabase.storage.from('documentos').remove([a.url]).catch(() => {});
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
                          onClick={() => { if (confirm('¿Eliminar tarea?')) removeTarea(t.id); }}
                          className="text-red-400 hover:text-red-300"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          )}
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
    const { data, error } = await supabase.storage.from('documentos').createSignedUrl(path, 3600);
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
    const { data, error } = await supabase.storage.from('documentos').createSignedUrl(path, 3600);
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
    const up = await supabase.storage.from('documentos').upload(path, f, { contentType: f.type, upsert: false });
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
