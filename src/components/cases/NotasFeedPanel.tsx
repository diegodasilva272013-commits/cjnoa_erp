import { useState, useMemo, useRef, useEffect } from 'react';
import {
  MessageSquare, Send, Clock, User as UserIcon, Trash2, CheckCircle2,
  ListTodo, Calendar, Eye, ChevronDown, AlertCircle, Mic, MicOff, Square,
  Gavel, X as XIcon, MapPin,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  useCasoGeneralNotas, ESTADOS_TAREA_FLUJO, ESTADO_TAREA_LABEL,
  ESTADO_TAREA_COLOR, EstadoTareaFlujo, CasoGeneralNota,
} from '../../hooks/useCasoGeneralNotas';
import { usePerfilesList } from '../../hooks/usePerfilesList';
import { useAvatarUrl } from '../../hooks/useAvatarUrl';
import { supabase } from '../../lib/supabase';

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `hace ${days} d`;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Avatar({ path, nombre, size = 32 }: { path: string | null; nombre: string | null; size?: number }) {
  const url = useAvatarUrl(path);
  const initial = (nombre || '?').trim().charAt(0).toUpperCase();
  if (url) {
    return <img src={url} alt={nombre || ''} className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {initial}
    </div>
  );
}

function AudioPlayer({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.storage.from('notas-voz').createSignedUrl(path, 3600).then(({ data }) => {
      if (active && data?.signedUrl) setUrl(data.signedUrl);
    });
    return () => { active = false; };
  }, [path]);
  if (!url) return <span className="text-[10px] text-gray-500">cargando audio…</span>;
  return <audio controls src={url} className="w-full max-w-sm h-8" />;
}

function NotaCard({ n, currentUserId, onDelete, onMarcarVista, onCambiarEstado }: {
  n: CasoGeneralNota;
  currentUserId: string | null;
  onDelete: (id: string) => void;
  onMarcarVista: (tareaId: string) => void;
  onCambiarEstado: (tareaId: string, estado: EstadoTareaFlujo) => void;
}) {
  const esAutor = n.created_by === currentUserId;
  const esResponsableTarea = n.tarea_responsable_id === currentUserId;
  const tieneTarea = !!n.tarea_id;

  return (
    <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Avatar path={n.autor_avatar} nombre={n.autor_nombre} size={36} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{n.autor_nombre || 'Usuario'}</span>
            <span className="text-[11px] text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />{fmtFecha(n.created_at)}
            </span>
            {n.editado && <span className="text-[10px] text-gray-600 italic">(editado)</span>}
          </div>
          <p className="text-sm text-gray-200 whitespace-pre-wrap break-words mt-1">{n.contenido}</p>
          {n.audio_path && (
            <div className="mt-2">
              <AudioPlayer path={n.audio_path} />
            </div>
          )}
        </div>
        {esAutor && (
          <button onClick={() => onDelete(n.id)} title="Eliminar nota"
            className="opacity-0 group-hover:opacity-100 hover:opacity-100 text-gray-500 hover:text-red-400 transition p-1">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {tieneTarea && (
        <div className="rounded-xl bg-violet-500/[0.07] border border-violet-500/20 p-3 ml-12 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <ListTodo className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-xs font-bold text-violet-200">{n.tarea_titulo}</span>
            <span className={`badge border text-[10px] ${ESTADO_TAREA_COLOR[n.tarea_estado || 'activa']}`}>
              {ESTADO_TAREA_LABEL[n.tarea_estado || 'activa']}
            </span>
            {n.tarea_prioridad && n.tarea_prioridad !== 'sin_prioridad' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                n.tarea_prioridad === 'alta'
                  ? 'bg-red-500/15 text-red-300 border-red-500/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              }`}>
                {n.tarea_prioridad === 'alta' ? 'Alta' : 'Media'}
              </span>
            )}
          </div>
          {n.tarea_descripcion && n.tarea_descripcion !== n.contenido && (
            <p className="text-[11px] text-gray-300 whitespace-pre-wrap break-words border-l-2 border-violet-500/30 pl-2">{n.tarea_descripcion}</p>
          )}
          <div className="flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
            <span className="flex items-center gap-1.5">
              <Avatar path={n.tarea_responsable_avatar} nombre={n.tarea_responsable_nombre} size={18} />
              <span className="text-gray-300">{n.tarea_responsable_nombre || '—'}</span>
            </span>
            {n.tarea_fecha_limite && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(n.tarea_fecha_limite + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
              </span>
            )}
            {n.tarea_cargo_hora && (
              <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/25 text-cyan-300">
                {n.tarea_cargo_hora}
              </span>
            )}
            {n.tarea_visto && (
              <span className="flex items-center gap-1 text-emerald-400">
                <Eye className="w-3 h-3" />
                Vista{n.tarea_visto_at ? ` ${fmtFecha(n.tarea_visto_at)}` : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {esResponsableTarea && !n.tarea_visto && (
              <button onClick={() => onMarcarVista(n.tarea_id!)}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3 h-3" /> Confirmar que vi la tarea
              </button>
            )}
            {esResponsableTarea && (
              <div className="relative inline-block">
                <select
                  value={n.tarea_estado || 'activa'}
                  onChange={(e) => onCambiarEstado(n.tarea_id!, e.target.value as EstadoTareaFlujo)}
                  className="text-[11px] pl-2 pr-6 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10 appearance-none cursor-pointer"
                >
                  {ESTADOS_TAREA_FLUJO.map(e => (
                    <option key={e} value={e}>{ESTADO_TAREA_LABEL[e]}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function NotasFeedPanel({ casoId }: { casoId: string }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { perfiles } = usePerfilesList();
  const {
    notas, loading, agregarNota, agregarNotaConTarea, eliminarNota,
    marcarTareaVista, cambiarEstadoTarea, migrationError,
  } = useCasoGeneralNotas(casoId);

  const [contenido, setContenido] = useState('');
  const [conTarea, setConTarea] = useState(false);
  const [tareaTitulo, setTareaTitulo] = useState('');
  const [tareaDescripcion, setTareaDescripcion] = useState('');
  const [responsableId, setResponsableId] = useState('');
  const [fechaLimite, setFechaLimite] = useState('');
  const [prioridad, setPrioridad] = useState<'alta'|'media'|'sin_prioridad'>('sin_prioridad');
  const [cargoHora, setCargoHora] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Modal: Agendar audiencia
  const [audModalOpen, setAudModalOpen] = useState(false);
  const [audFecha, setAudFecha] = useState('');
  const [audJuzgado, setAudJuzgado] = useState('');
  const [audTipo, setAudTipo] = useState('');
  const [audAbogadoId, setAudAbogadoId] = useState('');
  const [audNotas, setAudNotas] = useState('');
  const [audGuardando, setAudGuardando] = useState(false);

  async function handleAgendarAudiencia() {
    if (!user?.id || !audFecha) {
      showToast('Falta la fecha de la audiencia', 'error');
      return;
    }
    setAudGuardando(true);
    const fechaIso = new Date(audFecha).toISOString();
    const { data, error } = await supabase
      .from('audiencias_general')
      .insert({
        caso_general_id: casoId,
        fecha: fechaIso,
        juzgado: audJuzgado || null,
        tipo: audTipo || null,
        abogado_id: audAbogadoId || null,
        notas: audNotas || null,
        created_by: user.id,
      })
      .select()
      .single();
    if (error) {
      showToast('Error al crear audiencia: ' + error.message, 'error');
      setAudGuardando(false);
      return;
    }
    // Crear nota de seguimiento referenciando la audiencia
    const fechaLegible = new Date(audFecha).toLocaleString('es-AR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const partes = [
      `📅 Audiencia agendada para ${fechaLegible}`,
      audTipo ? `Tipo: ${audTipo}` : '',
      audJuzgado ? `Juzgado: ${audJuzgado}` : '',
      audNotas ? `Notas: ${audNotas}` : '',
    ].filter(Boolean);
    await agregarNota(partes.join('\n'), user.id, null);

    showToast('Audiencia agendada y agregada al seguimiento', 'success');
    setAudModalOpen(false);
    setAudFecha(''); setAudJuzgado(''); setAudTipo(''); setAudAbogadoId(''); setAudNotas('');
    setAudGuardando(false);
    void data;
  }

  // Dictado (STT) y grabación de audio
  const [dictando, setDictando] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  function toggleDictado() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { showToast('Tu navegador no soporta dictado de voz', 'error'); return; }
    if (dictando) { recognitionRef.current?.stop(); setDictando(false); return; }
    const rec = new SR();
    rec.lang = 'es-AR'; rec.continuous = true; rec.interimResults = false;
    let acc = contenido ? contenido + ' ' : '';
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) acc += e.results[i][0].transcript + ' ';
      }
      setContenido(acc.trimEnd());
    };
    rec.onerror = () => setDictando(false);
    rec.onend = () => setDictando(false);
    recognitionRef.current = rec;
    rec.start();
    setDictando(true);
  }

  async function toggleGrabacion() {
    if (grabando) {
      mediaRecorderRef.current?.stop();
      recognitionRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // STT en paralelo a la grabación
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const rec = new SR();
        rec.lang = 'es-AR'; rec.continuous = true; rec.interimResults = false;
        let acc = contenido ? contenido + ' ' : '';
        rec.onresult = (e: any) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) acc += e.results[i][0].transcript + ' ';
          }
          setContenido(acc.trimEnd());
        };
        try { rec.start(); recognitionRef.current = rec; } catch { /* noop */ }
      }
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
        setAudioPreviewUrl(URL.createObjectURL(blob));
        setGrabando(false);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setGrabando(true);
    } catch {
      showToast('No se pudo acceder al micrófono', 'error');
    }
  }

  function descartarAudio() {
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioBlob(null); setAudioPreviewUrl(null);
  }

  const responsablesOptions = useMemo(() => perfiles, [perfiles]);

  async function handleEnviar() {
    if (!user?.id || !contenido.trim()) return;
    setEnviando(true);
    let ok = false;
    let errMsg: string | undefined;
    if (conTarea) {
      if (!responsableId) {
        showToast('Elegí a quién asignar la tarea', 'error');
        setEnviando(false); return;
      }
      const res = await agregarNotaConTarea({
        contenido,
        userId: user.id,
        tareaTitulo: tareaTitulo || contenido.slice(0, 80),
        responsableId,
        fechaLimite: fechaLimite || null,
        descripcion: tareaDescripcion || undefined,
        prioridad,
        cargoHora: cargoHora || undefined,
        audioBlob,
      });
      ok = res.ok; errMsg = res.error;
    } else {
      ok = await agregarNota(contenido, user.id, audioBlob);
    }
    if (ok) {
      setContenido(''); setTareaTitulo(''); setTareaDescripcion('');
      setResponsableId(''); setFechaLimite(''); setCargoHora('');
      setPrioridad('sin_prioridad'); setConTarea(false);
      descartarAudio();
      showToast(conTarea ? 'Nota + tarea creadas' : 'Nota agregada', 'success');
    } else {
      showToast(errMsg || 'Error al guardar', 'error');
    }
    setEnviando(false);
  }

  async function handleMarcarVista(tareaId: string) {
    const ok = await marcarTareaVista(tareaId);
    if (ok) showToast('Confirmado: tarea vista', 'success');
  }

  async function handleCambiarEstado(tareaId: string, estado: EstadoTareaFlujo) {
    if (!user?.id) return;
    const ok = await cambiarEstadoTarea(tareaId, estado, user.id);
    if (ok) showToast(`Estado: ${ESTADO_TAREA_LABEL[estado]}`, 'success');
  }

  async function handleEliminar(id: string) {
    if (!confirm('¿Eliminar esta nota?')) return;
    const ok = await eliminarNota(id);
    if (ok) showToast('Nota eliminada', 'success');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-violet-400" />
        <h3 className="text-sm font-bold text-white">
          Seguimiento <span className="text-gray-500 font-normal">({notas.length})</span>
        </h3>
        <button
          type="button"
          onClick={() => setAudModalOpen(true)}
          className="ml-auto flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/40 text-orange-200 font-semibold"
          title="Agendar una audiencia para este caso"
        >
          <Gavel className="w-3.5 h-3.5" /> Agendar audiencia
        </button>
      </div>

      {migrationError && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-xs font-bold text-red-200 flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4" /> Falta aplicar la migración SQL
          </p>
          <p className="text-[11px] text-red-200/80 leading-relaxed">
            Andá a Supabase → SQL Editor → New Query y pegá el contenido del archivo:
            <br/><span className="font-mono bg-white/5 px-1 rounded mt-1 inline-block">supabase/migration_caso_general_notas_y_notificaciones.sql</span>
            <br/>Después recargá esta página.
          </p>
          <p className="text-[10px] text-red-300/60 mt-2 font-mono">{migrationError}</p>
        </div>
      )}

      {/* Composer */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-3 space-y-3">
        <textarea
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          placeholder="Escribí una nota o novedad sobre el caso…"
          rows={3}
          className="w-full bg-transparent text-sm text-white placeholder-gray-500 resize-none focus:outline-none"
        />
        {/* Barra de dictado / grabación */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={toggleDictado}
            disabled={grabando}
            title={dictando ? 'Detener dictado' : 'Dictar (voz → texto)'}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition ${
              dictando
                ? 'bg-red-500/20 border-red-500/40 text-red-200 animate-pulse'
                : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
            } disabled:opacity-40`}
          >
            {dictando ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            {dictando ? 'Detener dictado' : 'Dictar'}
          </button>
          <button
            type="button"
            onClick={toggleGrabacion}
            disabled={dictando}
            title={grabando ? 'Terminar nota de voz' : 'Grabar nota de voz (audio + transcripción)'}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition ${
              grabando
                ? 'bg-red-500/20 border-red-500/40 text-red-200 animate-pulse'
                : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
            } disabled:opacity-40`}
          >
            {grabando ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            {grabando ? 'Terminar grabación' : 'Nota de voz'}
          </button>
          {audioPreviewUrl && !grabando && (
            <div className="flex items-center gap-2 ml-auto">
              <audio controls src={audioPreviewUrl} className="h-8 max-w-[220px]" />
              <button
                type="button"
                onClick={descartarAudio}
                title="Descartar audio"
                className="p-1 text-gray-500 hover:text-red-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-white/5 pt-3">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-400 hover:text-violet-300">
            <input type="checkbox" checked={conTarea} onChange={(e) => setConTarea(e.target.checked)}
              className="accent-violet-500" />
            <ListTodo className="w-3.5 h-3.5" /> Crear tarea desde esta nota
          </label>
          <button
            onClick={handleEnviar}
            disabled={!contenido.trim() || enviando}
            className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 disabled:opacity-40">
            <Send className="w-3.5 h-3.5" />
            {enviando ? 'Enviando…' : 'Publicar'}
          </button>
        </div>

        {/* Acciones rápidas: agendar audiencia desde aquí */}
        <div className="flex flex-wrap gap-2 border-t border-white/5 pt-3">
          <button
            type="button"
            onClick={() => setAudModalOpen(true)}
            className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-orange-500/15 hover:bg-orange-500/30 border border-orange-500/40 text-orange-200 font-semibold transition-colors"
            title="Agendar una audiencia para este caso"
          >
            <Gavel className="w-4 h-4" /> Agendar audiencia para este caso
          </button>
        </div>

        {conTarea && (
          <div className="space-y-2 border-t border-white/5 pt-3">
            <input
              type="text"
              value={tareaTitulo}
              onChange={(e) => setTareaTitulo(e.target.value)}
              placeholder="Título corto de la tarea (opcional)"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50"
            />
            <textarea
              value={tareaDescripcion}
              onChange={(e) => setTareaDescripcion(e.target.value)}
              placeholder="Descripción / instrucciones para el responsable (opcional)"
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50 resize-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={responsableId}
                onChange={(e) => setResponsableId(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-violet-500/50"
              >
                <option value="">Asignar a…</option>
                {responsablesOptions.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              <input
                type="date"
                value={fechaLimite}
                onChange={(e) => setFechaLimite(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-violet-500/50"
              />
              <select
                value={prioridad}
                onChange={(e) => setPrioridad(e.target.value as 'alta'|'media'|'sin_prioridad')}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-violet-500/50"
              >
                <option value="sin_prioridad">Sin prioridad</option>
                <option value="media">Prioridad media</option>
                <option value="alta">Prioridad alta</option>
              </select>
              <input
                type="text"
                value={cargoHora}
                onChange={(e) => setCargoHora(e.target.value)}
                placeholder="Cargo de hora (ej: a favor)"
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50"
              />
            </div>
            {!responsableId && (
              <p className="text-[10px] text-amber-400/80 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Elegí un responsable para crear la tarea
              </p>
            )}
            <button
              onClick={handleEnviar}
              disabled={!contenido.trim() || !responsableId || enviando}
              className="w-full mt-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/40 text-violet-200 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ListTodo className="w-3.5 h-3.5" />
              {enviando ? 'Asignando…' : 'Asignar tarea y publicar nota'}
            </button>
          </div>
        )}
      </div>

      {/* Feed */}
      {loading && notas.length === 0 ? (
        <div className="text-center py-8 text-xs text-gray-600">Cargando…</div>
      ) : notas.length === 0 ? (
        <div className="text-center py-8 rounded-2xl border border-dashed border-white/10">
          <UserIcon className="w-8 h-8 text-gray-700 mx-auto mb-2" />
          <p className="text-xs text-gray-500">Sin notas todavía. Sé el primero en dejar una novedad.</p>
        </div>
      ) : (
        <div className="space-y-3 group">
          {notas.map(n => (
            <NotaCard
              key={n.id}
              n={n}
              currentUserId={user?.id || null}
              onDelete={handleEliminar}
              onMarcarVista={handleMarcarVista}
              onCambiarEstado={handleCambiarEstado}
            />
          ))}
        </div>
      )}

      {audModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => !audGuardando && setAudModalOpen(false)}>
          <div className="glass-card w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Gavel className="w-4 h-4 text-orange-300" /> Agendar audiencia
              </h3>
              <button type="button" onClick={() => setAudModalOpen(false)} className="text-gray-500 hover:text-white">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-gray-400">
              Se crea la audiencia y queda visible en el menú <span className="text-orange-300 font-semibold">Audiencias</span>.
              También se agrega una nota en el seguimiento de este caso.
            </p>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Fecha y hora *</label>
              <input type="datetime-local" required value={audFecha}
                onChange={e => setAudFecha(e.target.value)}
                className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Tipo</label>
                <input value={audTipo} onChange={e => setAudTipo(e.target.value)}
                  placeholder="Ej: Conciliatoria"
                  className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Abogado</label>
                <select value={audAbogadoId} onChange={e => setAudAbogadoId(e.target.value)}
                  className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50">
                  <option value="">— Sin asignar —</option>
                  {responsablesOptions.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1"><MapPin className="w-3 h-3" /> Juzgado</label>
              <input value={audJuzgado} onChange={e => setAudJuzgado(e.target.value)}
                placeholder="Ej: Juzgado Civil 3 - Sec 6"
                className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Notas</label>
              <textarea value={audNotas} onChange={e => setAudNotas(e.target.value)}
                rows={3}
                className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setAudModalOpen(false)}
                disabled={audGuardando}
                className="text-xs px-3 py-2 rounded-lg text-gray-300 hover:bg-white/5">Cancelar</button>
              <button type="button" onClick={handleAgendarAudiencia}
                disabled={!audFecha || audGuardando}
                className="text-xs px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-semibold flex items-center gap-1.5 disabled:opacity-40">
                <Gavel className="w-3.5 h-3.5" /> {audGuardando ? 'Agendando…' : 'Agendar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
