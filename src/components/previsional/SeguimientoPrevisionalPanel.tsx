import { useState, useMemo } from 'react';
import {
  Send, Clock, Trash2, ListTodo, Calendar, Plus, X as XIcon,
  Users, AlertCircle, CheckCircle2, Circle, ChevronDown,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  useClientesPrevisionalNotas, useTareaPasosPrevisional,
  ClientePrevisionalNota,
} from '../../hooks/useClientesPrevisionalNotas';
import { usePerfilesList } from '../../hooks/usePerfilesList';
import { useAvatarUrl } from '../../hooks/useAvatarUrl';

type Prioridad = 'alta' | 'media' | 'sin_prioridad';

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
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

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', en_curso: 'En curso', completada: 'Completada',
};
const ESTADO_COLOR: Record<string, string> = {
  pendiente:  'bg-amber-500/10 text-amber-300 border-amber-500/30',
  en_curso:   'bg-violet-500/10 text-violet-300 border-violet-500/30',
  completada: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
};

function PasosTarea({ tareaId }: { tareaId: string }) {
  const { user } = useAuth();
  const { pasos, togglePaso } = useTareaPasosPrevisional(tareaId);
  if (pasos.length === 0) return null;
  const completos = pasos.filter(p => p.completado).length;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2 text-[10px] text-gray-500">
        <Users className="w-3 h-3" />
        <span>Pasos compartidos: {completos}/{pasos.length}</span>
      </div>
      {pasos.map(p => {
        const esResp = p.responsable_id === user?.id;
        const puedeMarcar = esResp && !p.completado;
        return (
          <div key={p.id} className={`flex items-start gap-2 px-2 py-1.5 rounded-lg border ${
            p.completado
              ? 'bg-emerald-500/[0.05] border-emerald-500/15'
              : esResp
                ? 'bg-violet-500/[0.05] border-violet-500/20'
                : 'bg-white/[0.02] border-white/5'
          }`}>
            <button
              onClick={() => puedeMarcar && user?.id && togglePaso(p.id, true, user.id)}
              disabled={!puedeMarcar}
              title={p.completado
                ? `Hecho por ${p.completado_por_nombre || '—'}`
                : esResp ? 'Marcar como completado' : 'No sos el responsable de este paso'}
              className={`mt-0.5 ${puedeMarcar ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition`}
            >
              {p.completado
                ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                : <Circle className={`w-4 h-4 ${esResp ? 'text-violet-300' : 'text-gray-600'}`} />}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-[11px] ${p.completado ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
                <span className="text-gray-500 mr-1">#{p.orden}</span>{p.descripcion}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-500">
                <Avatar path={p.responsable_avatar} nombre={p.responsable_nombre} size={14} />
                <span>{p.responsable_nombre || 'Sin asignar'}</span>
                {p.completado && p.completado_at && (
                  <span className="ml-1 text-emerald-500">· {fmtFecha(p.completado_at)}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NotaCard({ n, currentUserId, onDelete }: {
  n: ClientePrevisionalNota;
  currentUserId: string | null;
  onDelete: (id: string) => void;
}) {
  const esAutor = n.created_by === currentUserId;
  const tieneTarea = !!n.tarea_previsional_id;

  return (
    <div className="rounded-2xl bg-white/[0.025] border border-white/[0.06] p-4 space-y-3 group">
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
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ESTADO_COLOR[n.tarea_estado || 'pendiente']}`}>
              {ESTADO_LABEL[n.tarea_estado || 'pendiente']}
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
            <p className="text-[11px] text-gray-300 whitespace-pre-wrap break-words border-l-2 border-violet-500/30 pl-2">
              {n.tarea_descripcion}
            </p>
          )}
          <div className="flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
            <span className="flex items-center gap-1.5">
              <Avatar path={n.tarea_responsable_avatar} nombre={n.tarea_responsable_nombre} size={18} />
              {n.tarea_responsable_nombre || 'Sin asignar'}
            </span>
            {n.tarea_fecha_limite && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(n.tarea_fecha_limite).toLocaleDateString('es-AR')}
              </span>
            )}
          </div>
          {n.tarea_previsional_id && <PasosTarea tareaId={n.tarea_previsional_id} />}
        </div>
      )}
    </div>
  );
}

interface Props {
  clientePrevisionalId: string;
}

export default function SeguimientoPrevisionalPanel({ clientePrevisionalId }: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { perfiles } = usePerfilesList();
  const {
    notas, loading, migrationError,
    agregarNota, agregarNotaConTarea, eliminarNota,
  } = useClientesPrevisionalNotas(clientePrevisionalId);

  const [contenido, setContenido] = useState('');
  const [crearTarea, setCrearTarea] = useState(false);
  const [tareaTitulo, setTareaTitulo] = useState('');
  const [tareaDesc, setTareaDesc] = useState('');
  const [tareaResp, setTareaResp] = useState('');
  const [tareaFecha, setTareaFecha] = useState('');
  const [tareaPrioridad, setTareaPrioridad] = useState<Prioridad>('media');
  const [pasos, setPasos] = useState<{ descripcion: string; responsable_id: string }[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [showPasos, setShowPasos] = useState(false);

  const respNombre = useMemo(() => {
    return perfiles.find(p => p.id === tareaResp)?.nombre || null;
  }, [perfiles, tareaResp]);

  function reset() {
    setContenido(''); setCrearTarea(false); setTareaTitulo(''); setTareaDesc('');
    setTareaResp(''); setTareaFecha(''); setTareaPrioridad('media');
    setPasos([]); setShowPasos(false);
  }

  async function handleEnviar() {
    if (!contenido.trim()) { showToast('Escribí algo', 'error'); return; }
    if (!user?.id) { showToast('Usuario no detectado', 'error'); return; }
    setEnviando(true);
    try {
      if (crearTarea) {
        if (!tareaResp) { showToast('Elegí un responsable', 'error'); setEnviando(false); return; }
        const r = await agregarNotaConTarea({
          contenido,
          userId: user.id,
          tareaTitulo: tareaTitulo.trim() || contenido.slice(0, 80),
          descripcion: tareaDesc,
          responsableId: tareaResp,
          responsableNombre: respNombre,
          fechaLimite: tareaFecha || null,
          prioridad: tareaPrioridad,
          pasos: pasos.filter(p => p.descripcion.trim()),
        });
        if (r.ok) { showToast('Tarea y nota creadas', 'success'); reset(); }
        else { showToast(r.error || 'Error al crear', 'error'); }
      } else {
        const ok = await agregarNota(contenido, user.id);
        if (ok) { showToast('Nota publicada', 'success'); reset(); }
        else { showToast('Error al publicar', 'error'); }
      }
    } finally {
      setEnviando(false);
    }
  }

  if (migrationError) {
    return (
      <div className="glass-card p-5 border border-amber-500/30 bg-amber-500/[0.03]">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-300">Falta correr la migración SQL</p>
            <p className="text-xs text-gray-400 mt-1">{migrationError}</p>
            <p className="text-[11px] text-gray-500 mt-2">
              Aplicar en Supabase: <code className="bg-white/5 px-1.5 py-0.5 rounded">supabase/migration_previsional_seguimiento_y_pasos.sql</code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Composer */}
      <div className="glass-card p-4 space-y-3">
        <textarea
          value={contenido}
          onChange={e => setContenido(e.target.value)}
          placeholder="Escribí una nota de seguimiento…"
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-violet-500/50"
          rows={2}
        />

        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={crearTarea}
              onChange={e => setCrearTarea(e.target.checked)}
              className="accent-violet-500"
            />
            Crear tarea desde esta nota
          </label>
          <div className="flex-1" />
          <button
            onClick={handleEnviar}
            disabled={enviando || !contenido.trim()}
            className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {crearTarea ? 'Asignar tarea y publicar' : 'Publicar nota'}
          </button>
        </div>

        {crearTarea && (
          <div className="rounded-xl bg-violet-500/[0.04] border border-violet-500/20 p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={tareaTitulo}
                onChange={e => setTareaTitulo(e.target.value)}
                placeholder="Título de la tarea (opcional)"
                className="bg-white/[0.03] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50"
              />
              <select
                value={tareaResp}
                onChange={e => setTareaResp(e.target.value)}
                className="bg-white/[0.03] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500/50"
              >
                <option value="">Responsable…</option>
                {perfiles.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              <input
                type="date"
                value={tareaFecha}
                onChange={e => setTareaFecha(e.target.value)}
                className="bg-white/[0.03] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500/50"
              />
              <select
                value={tareaPrioridad}
                onChange={e => setTareaPrioridad(e.target.value as Prioridad)}
                className="bg-white/[0.03] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500/50"
              >
                <option value="sin_prioridad">Sin prioridad</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </div>
            <textarea
              value={tareaDesc}
              onChange={e => setTareaDesc(e.target.value)}
              placeholder="Descripción de la tarea (opcional)"
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 resize-none focus:outline-none focus:border-violet-500/50"
              rows={2}
            />

            {/* Pasos compartidos */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowPasos(s => !s)}
                className="flex items-center gap-1.5 text-[11px] text-violet-300 hover:text-violet-200"
              >
                <ChevronDown className={`w-3 h-3 transition ${showPasos ? '' : '-rotate-90'}`} />
                <Users className="w-3 h-3" />
                Pasos compartidos ({pasos.length})
              </button>
              {showPasos && (
                <div className="space-y-1.5">
                  {pasos.map((p, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-500 w-5">#{i + 1}</span>
                      <input
                        value={p.descripcion}
                        onChange={e => {
                          const arr = [...pasos];
                          arr[i] = { ...arr[i], descripcion: e.target.value };
                          setPasos(arr);
                        }}
                        placeholder="Qué hay que hacer en este paso"
                        className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50"
                      />
                      <select
                        value={p.responsable_id}
                        onChange={e => {
                          const arr = [...pasos];
                          arr[i] = { ...arr[i], responsable_id: e.target.value };
                          setPasos(arr);
                        }}
                        className="bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-violet-500/50"
                      >
                        <option value="">Responsable…</option>
                        {perfiles.map(pf => (
                          <option key={pf.id} value={pf.id}>{pf.nombre}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setPasos(pasos.filter((_, j) => j !== i))}
                        className="text-gray-500 hover:text-red-400 p-1"
                      >
                        <XIcon className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPasos([...pasos, { descripcion: '', responsable_id: '' }])}
                    className="flex items-center gap-1 text-[11px] text-violet-300 hover:text-violet-200"
                  >
                    <Plus className="w-3 h-3" /> Agregar paso
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lista de notas */}
      {loading ? (
        <div className="text-center text-xs text-gray-500 py-6">Cargando…</div>
      ) : notas.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <ListTodo className="w-8 h-8 text-gray-700 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Sin notas todavía</p>
          <p className="text-[11px] text-gray-600 mt-1">Publicá la primera para empezar el seguimiento</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notas.map(n => (
            <NotaCard key={n.id} n={n} currentUserId={user?.id || null} onDelete={eliminarNota} />
          ))}
        </div>
      )}
    </div>
  );
}
