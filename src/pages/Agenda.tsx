import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, ChevronLeft, ChevronRight, Clock, Trash2, Check, Mic, Square,
  Play, Pause, Volume2, Bell, BellOff, Calendar as CalendarIcon, List,
  Loader2, X, FileAudio,
} from 'lucide-react';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useReminders } from '../context/ReminderContext';
import {
  useRecordatorios, createRecordatorio, updateRecordatorio, deleteRecordatorio,
  uploadAudio, deleteAudio, getAudioUrl,
} from '../hooks/useRecordatorios';
import { Recordatorio } from '../types/database';

const COLORES = [
  { value: 'blue', bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400', dot: 'bg-blue-500' },
  { value: 'emerald', bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', text: 'text-emerald-400', dot: 'bg-emerald-500' },
  { value: 'amber', bg: 'bg-amber-500/20', border: 'border-amber-500/40', text: 'text-amber-400', dot: 'bg-amber-500' },
  { value: 'rose', bg: 'bg-rose-500/20', border: 'border-rose-500/40', text: 'text-rose-400', dot: 'bg-rose-500' },
  { value: 'violet', bg: 'bg-violet-500/20', border: 'border-violet-500/40', text: 'text-violet-400', dot: 'bg-violet-500' },
  { value: 'cyan', bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', text: 'text-cyan-400', dot: 'bg-cyan-500' },
];

function getColor(c: string) {
  return COLORES.find(x => x.value === c) || COLORES[0];
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function formatTime(t: string) {
  return t.slice(0, 5);
}

function isToday(dateStr: string) {
  return dateStr === new Date().toISOString().split('T')[0];
}

function isPast(dateStr: string, timeStr: string) {
  const now = new Date();
  const dt = new Date(`${dateStr}T${timeStr}`);
  return dt < now;
}

export default function Agenda() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { notificationsEnabled, requestNotifications } = useReminders();
  const { recordatorios, loading, refetch } = useRecordatorios();
  const [vista, setVista] = useState<'calendario' | 'lista'>('calendario');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRec, setSelectedRec] = useState<Recordatorio | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const todayStr = new Date().toISOString().split('T')[0];

  // ── Calendar logic ──
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  function getRecsForDay(dateStr: string) {
    return recordatorios.filter(r => r.fecha === dateStr);
  }

  function handleDayClick(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDay(dateStr);
  }

  function handleNewRec(date?: string) {
    setSelectedRec(null);
    setSelectedDay(date || null);
    setModalOpen(true);
  }

  function handleEditRec(rec: Recordatorio) {
    setSelectedRec(rec);
    setModalOpen(true);
  }

  // ── Upcoming (next 7 days) ──
  const upcoming = recordatorios
    .filter(r => !r.completado && r.fecha >= todayStr)
    .slice(0, 10);

  const pendingToday = recordatorios.filter(r => !r.completado && r.fecha === todayStr);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Agenda</h1>
          <p className="text-gray-500 text-sm mt-1">
            {pendingToday.length > 0
              ? `${pendingToday.length} recordatorio${pendingToday.length > 1 ? 's' : ''} para hoy`
              : 'Sin recordatorios pendientes hoy'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={requestNotifications}
            className={`p-2.5 rounded-xl border transition-all ${
              notificationsEnabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-white/[0.03] border-white/10 text-gray-500 hover:text-white'
            }`}
            title={notificationsEnabled ? 'Notificaciones activadas' : 'Activar notificaciones'}
          >
            {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>

          <div className="flex bg-white/[0.04] rounded-xl border border-white/10 overflow-hidden">
            <button
              onClick={() => setVista('calendario')}
              className={`p-2.5 transition-all ${vista === 'calendario' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
            >
              <CalendarIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setVista('lista')}
              className={`p-2.5 transition-all ${vista === 'lista' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button onClick={() => handleNewRec()} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo Recordatorio</span>
          </button>
        </div>
      </div>

      {vista === 'calendario' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-3 glass-card p-5">
            <div className="flex items-center justify-between mb-6">
              <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-all">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-white">{MESES[month]} {year}</h2>
                <button onClick={goToday} className="text-xs text-gray-500 hover:text-white border border-white/10 px-2.5 py-1 rounded-lg transition-all">
                  Hoy
                </button>
              </div>
              <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-all">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DIAS.map(d => (
                <div key={d} className="text-center text-xs font-medium text-gray-600 py-2">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[90px] sm:min-h-[100px]" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayRecs = getRecsForDay(dateStr);
                const isT = isToday(dateStr);
                const isSelected = selectedDay === dateStr;

                return (
                  <button
                    key={day}
                    onClick={() => handleDayClick(day)}
                    className={`min-h-[90px] sm:min-h-[100px] rounded-xl p-1.5 flex flex-col transition-all relative group text-left
                      ${isT ? 'bg-white/[0.08] ring-1 ring-white/20' : 'hover:bg-white/[0.04]'}
                      ${isSelected ? 'ring-2 ring-blue-500/50 bg-blue-500/10' : ''}
                    `}
                  >
                    <span className={`text-sm font-medium self-center ${isT ? 'text-white' : 'text-gray-400 group-hover:text-white'}`}>
                      {day}
                    </span>
                    {dayRecs.length > 0 && (
                      <div className="mt-1 space-y-0.5 w-full overflow-hidden flex-1">
                        {dayRecs.slice(0, 3).map(r => {
                          const c = getColor(r.color);
                          return (
                            <div
                              key={r.id}
                              className={`px-1.5 py-0.5 rounded text-[10px] leading-tight font-medium truncate ${c.bg} ${c.text} ${r.completado ? 'line-through opacity-50' : ''}`}
                            >
                              <span className="hidden sm:inline">{formatTime(r.hora)} </span>{r.titulo}
                            </div>
                          );
                        })}
                        {dayRecs.length > 3 && (
                          <span className="text-[10px] text-gray-500 px-1.5">+{dayRecs.length - 3} más</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected day details */}
            {selectedDay && (
              <div className="mt-5 pt-5 border-t border-white/5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">
                    {formatDate(selectedDay)}
                    {isToday(selectedDay) && <span className="ml-2 text-xs text-emerald-400 font-normal">Hoy</span>}
                  </h3>
                  <button
                    onClick={() => handleNewRec(selectedDay)}
                    className="text-xs text-gray-500 hover:text-white flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar
                  </button>
                </div>
                {getRecsForDay(selectedDay).length === 0 ? (
                  <p className="text-sm text-gray-600">Sin recordatorios para este día.</p>
                ) : (
                  <div className="space-y-2">
                    {getRecsForDay(selectedDay).map(rec => (
                      <RecordatorioCard key={rec.id} rec={rec} onEdit={handleEditRec} onToggle={async () => {
                        await updateRecordatorio(rec.id, { completado: !rec.completado });
                        refetch();
                      }} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar: upcoming */}
          <div className="space-y-4">
            <div className="glass-card p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-500" /> Próximos
              </h3>
              {upcoming.length === 0 ? (
                <p className="text-sm text-gray-600">No hay próximos recordatorios.</p>
              ) : (
                <div className="space-y-2">
                  {upcoming.map(rec => (
                    <button
                      key={rec.id}
                      onClick={() => handleEditRec(rec)}
                      className={`w-full text-left p-3 rounded-xl border transition-all hover:scale-[1.02] ${getColor(rec.color).bg} ${getColor(rec.color).border}`}
                    >
                      <p className={`text-sm font-medium ${getColor(rec.color).text}`}>{rec.titulo}</p>
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                        <CalendarIcon className="w-3 h-3" />
                        {formatDate(rec.fecha)} · {formatTime(rec.hora)}
                        {rec.tiene_audio && <Volume2 className="w-3 h-3 ml-1" />}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="glass-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Total</span>
                <span className="text-sm text-white font-semibold">{recordatorios.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Pendientes</span>
                <span className="text-sm text-amber-400 font-semibold">{recordatorios.filter(r => !r.completado).length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Completados</span>
                <span className="text-sm text-emerald-400 font-semibold">{recordatorios.filter(r => r.completado).length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Con audio</span>
                <span className="text-sm text-violet-400 font-semibold">{recordatorios.filter(r => r.tiene_audio).length}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Vista Lista */
        <ListaView
          recordatorios={recordatorios}
          onEdit={handleEditRec}
          onToggle={async (rec) => {
            await updateRecordatorio(rec.id, { completado: !rec.completado });
            refetch();
          }}
        />
      )}

      {/* Modal */}
      <RecordatorioModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedRec(null); }}
        rec={selectedRec}
        defaultDate={selectedDay || undefined}
        userId={user?.id || ''}
        onSaved={refetch}
      />
    </div>
  );
}

// ─── Card Component ───
function RecordatorioCard({ rec, onEdit, onToggle }: { rec: Recordatorio; onEdit: (r: Recordatorio) => void; onToggle: () => void }) {
  const color = getColor(rec.color);
  const past = isPast(rec.fecha, rec.hora);

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer hover:scale-[1.01]
        ${rec.completado ? 'bg-white/[0.02] border-white/5 opacity-60' : `${color.bg} ${color.border}`}`}
      onClick={() => onEdit(rec)}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={`mt-0.5 w-5 h-5 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all
          ${rec.completado
            ? 'bg-emerald-500 border-emerald-500'
            : `border-white/20 hover:border-white/40`
          }`}
      >
        {rec.completado && <Check className="w-3 h-3 text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${rec.completado ? 'line-through text-gray-500' : 'text-white'}`}>
          {rec.titulo}
        </p>
        {rec.descripcion && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{rec.descripcion}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`text-xs flex items-center gap-1 ${past && !rec.completado ? 'text-red-400' : 'text-gray-500'}`}>
            <Clock className="w-3 h-3" /> {formatTime(rec.hora)}
          </span>
          {rec.tiene_audio && (
            <span className="text-xs text-violet-400 flex items-center gap-1">
              <Volume2 className="w-3 h-3" /> Audio
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── List View ───
function ListaView({ recordatorios, onEdit, onToggle }: { recordatorios: Recordatorio[]; onEdit: (r: Recordatorio) => void; onToggle: (r: Recordatorio) => void }) {
  const todayStr = new Date().toISOString().split('T')[0];
  const pendientes = recordatorios.filter(r => !r.completado).sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
  const completados = recordatorios.filter(r => r.completado).sort((a, b) => `${b.fecha}${b.hora}`.localeCompare(`${a.fecha}${a.hora}`));

  // Group by date
  const groups = new Map<string, Recordatorio[]>();
  for (const r of pendientes) {
    const g = groups.get(r.fecha) || [];
    g.push(r);
    groups.set(r.fecha, g);
  }

  return (
    <div className="space-y-6">
      {/* Pendientes */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Pendientes</h3>
        {pendientes.length === 0 ? (
          <p className="text-sm text-gray-600 py-4">No hay recordatorios pendientes. 🎉</p>
        ) : (
          <div className="space-y-4">
            {Array.from(groups.entries()).map(([fecha, recs]) => (
              <div key={fecha}>
                <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-2">
                  <CalendarIcon className="w-3 h-3" />
                  {formatDate(fecha)}
                  {isToday(fecha) && <span className="text-emerald-400">· Hoy</span>}
                  {fecha < todayStr && <span className="text-red-400">· Vencido</span>}
                </p>
                <div className="space-y-2">
                  {recs.map(rec => (
                    <RecordatorioCard key={rec.id} rec={rec} onEdit={onEdit} onToggle={() => onToggle(rec)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completados */}
      {completados.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Completados ({completados.length})</h3>
          <div className="space-y-2">
            {completados.slice(0, 20).map(rec => (
              <RecordatorioCard key={rec.id} rec={rec} onEdit={onEdit} onToggle={() => onToggle(rec)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Modal ───
function RecordatorioModal({
  open, onClose, rec, defaultDate, userId, onSaved,
}: {
  open: boolean; onClose: () => void; rec: Recordatorio | null; defaultDate?: string; userId: string; onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [color, setColor] = useState('blue');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Audio
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isEditing = !!rec;

  useEffect(() => {
    if (rec) {
      setTitulo(rec.titulo);
      setDescripcion(rec.descripcion || '');
      setFecha(rec.fecha);
      setHora(rec.hora.slice(0, 5));
      setColor(rec.color || 'blue');
      setAudioBlob(null);
      setAudioUrl(null);

      if (rec.tiene_audio && rec.audio_path) {
        getAudioUrl(rec.audio_path).then(url => setAudioUrl(url)).catch(() => {});
      }
    } else {
      setTitulo('');
      setDescripcion('');
      setFecha(defaultDate || new Date().toISOString().split('T')[0]);
      setHora(new Date().toTimeString().slice(0, 5));
      setColor('blue');
      setAudioBlob(null);
      setAudioUrl(null);
    }
  }, [rec, defaultDate, open]);

  // ── Voice Recording ──
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      setRecording(true);
    } catch {
      showToast('No se pudo acceder al micrófono', 'error');
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  function togglePlay() {
    if (!audioRef.current || !audioUrl) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.src = audioUrl;
      audioRef.current.play();
    }
    setPlaying(!playing);
  }

  function removeAudio() {
    setAudioBlob(null);
    if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
  }

  // ── Save ──
  async function handleSave() {
    if (!titulo.trim()) { showToast('El título es obligatorio', 'error'); return; }
    if (!fecha) { showToast('La fecha es obligatoria', 'error'); return; }
    if (!hora) { showToast('La hora es obligatoria', 'error'); return; }

    setSaving(true);
    try {
      if (isEditing) {
        await updateRecordatorio(rec.id, { titulo: titulo.trim(), descripcion: descripcion.trim() || null, fecha, hora, color });

        if (audioBlob) {
          setUploadingAudio(true);
          await uploadAudio(rec.id, audioBlob, userId);
          setUploadingAudio(false);
        }
      } else {
        await createRecordatorio({
          usuario_id: userId,
          titulo: titulo.trim(),
          descripcion: descripcion.trim() || undefined,
          fecha,
          hora,
          color,
        });

        // If there's audio, we need to get the new record ID and upload
        if (audioBlob) {
          setUploadingAudio(true);
          const { data: newRecs } = await (await import('../lib/supabase')).supabase
            .from('recordatorios')
            .select('id')
            .eq('usuario_id', userId)
            .eq('titulo', titulo.trim())
            .eq('fecha', fecha)
            .eq('hora', hora)
            .order('created_at', { ascending: false })
            .limit(1);

          if (newRecs && newRecs[0]) {
            await uploadAudio(newRecs[0].id, audioBlob, userId);
          }
          setUploadingAudio(false);
        }
      }

      showToast(isEditing ? 'Recordatorio actualizado' : 'Recordatorio creado');
      onSaved();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
      setUploadingAudio(false);
    }
  }

  async function handleDelete() {
    if (!rec) return;
    setDeleting(true);
    try {
      await deleteRecordatorio(rec);
      showToast('Recordatorio eliminado');
      onSaved();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Error al eliminar', 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteAudio() {
    if (!rec) return;
    try {
      await deleteAudio(rec);
      setAudioUrl(null);
      setAudioBlob(null);
      showToast('Nota de voz eliminada');
      onSaved();
    } catch (err: any) {
      showToast(err.message || 'Error al eliminar audio', 'error');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar Recordatorio' : 'Nuevo Recordatorio'}
      subtitle={isEditing ? formatDate(rec.fecha) : 'Crear un recordatorio con hora y notificación'}
      maxWidth="max-w-lg"
    >
      <div className="space-y-5">
        {/* Título */}
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Título <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            className="input-dark"
            placeholder="Ej: Audiencia caso Pérez"
          />
        </div>

        {/* Fecha y hora */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Fecha <span className="text-red-400">*</span></label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="input-dark" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Hora <span className="text-red-400">*</span></label>
            <input type="time" value={hora} onChange={e => setHora(e.target.value)} className="input-dark" />
          </div>
        </div>

        {/* Color */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Color</label>
          <div className="flex gap-2">
            {COLORES.map(c => (
              <button
                key={c.value}
                onClick={() => setColor(c.value)}
                className={`w-8 h-8 rounded-full ${c.dot} transition-all ${
                  color === c.value ? 'ring-2 ring-offset-2 ring-offset-[#0c0c0e] ring-white/50 scale-110' : 'opacity-60 hover:opacity-100'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Descripción */}
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Descripción</label>
          <textarea
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            className="input-dark min-h-[70px] resize-y"
            placeholder="Detalles opcionales..."
            rows={2}
          />
        </div>

        {/* Nota de voz */}
        <div>
          <label className="block text-sm text-gray-400 mb-2 flex items-center gap-2">
            <FileAudio className="w-4 h-4" /> Nota de Voz
          </label>
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
            {!audioUrl && !recording && (
              <button
                type="button"
                onClick={startRecording}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-400 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                  <Mic className="w-5 h-5 text-red-400" />
                </div>
                Toca para grabar
              </button>
            )}

            {recording && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={stopRecording}
                  className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center animate-pulse"
                >
                  <Square className="w-4 h-4 text-white" />
                </button>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm text-red-400 font-medium">Grabando...</span>
                </div>
              </div>
            )}

            {audioUrl && !recording && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    playing
                      ? 'bg-violet-500 text-white'
                      : 'bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20'
                  }`}
                >
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>
                <span className="text-sm text-gray-400 flex-1">Nota de voz grabada</span>
                <button
                  type="button"
                  onClick={isEditing && rec?.tiene_audio && !audioBlob ? handleDeleteAudio : removeAudio}
                  className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                  title="Eliminar audio"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {uploadingAudio && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Subiendo nota de voz...
              </div>
            )}
          </div>
          <audio ref={audioRef} onEnded={() => setPlaying(false)} className="hidden" />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-white/5">
          <div>
            {isEditing && (
              <button onClick={handleDelete} disabled={deleting} className="btn-danger text-sm">
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : isEditing ? 'Guardar cambios' : 'Crear'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
