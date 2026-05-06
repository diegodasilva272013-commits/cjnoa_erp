import { useState, useMemo } from 'react';
import {
  MessageSquare, Send, Clock, User as UserIcon, Trash2, CheckCircle2,
  ListTodo, Calendar, Eye, ChevronDown, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  useCasoGeneralNotas, ESTADOS_TAREA_FLUJO, ESTADO_TAREA_LABEL,
  ESTADO_TAREA_COLOR, EstadoTareaFlujo, CasoGeneralNota,
} from '../../hooks/useCasoGeneralNotas';
import { usePerfilesList } from '../../hooks/usePerfilesList';
import { useAvatarUrl } from '../../hooks/useAvatarUrl';

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
          </div>
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
    marcarTareaVista, cambiarEstadoTarea,
  } = useCasoGeneralNotas(casoId);

  const [contenido, setContenido] = useState('');
  const [conTarea, setConTarea] = useState(false);
  const [tareaTitulo, setTareaTitulo] = useState('');
  const [responsableId, setResponsableId] = useState('');
  const [fechaLimite, setFechaLimite] = useState('');
  const [enviando, setEnviando] = useState(false);

  const responsablesOptions = useMemo(() => perfiles, [perfiles]);

  async function handleEnviar() {
    if (!user?.id || !contenido.trim()) return;
    setEnviando(true);
    let ok = false;
    if (conTarea) {
      if (!responsableId) {
        showToast('Elegí a quién asignar la tarea', 'error');
        setEnviando(false); return;
      }
      ok = await agregarNotaConTarea({
        contenido,
        userId: user.id,
        tareaTitulo: tareaTitulo || contenido.slice(0, 80),
        responsableId,
        fechaLimite: fechaLimite || null,
      });
    } else {
      ok = await agregarNota(contenido, user.id);
    }
    if (ok) {
      setContenido(''); setTareaTitulo(''); setResponsableId('');
      setFechaLimite(''); setConTarea(false);
      showToast(conTarea ? 'Nota + tarea creadas' : 'Nota agregada', 'success');
    } else {
      showToast('Error al guardar', 'error');
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
      </div>

      {/* Composer */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-3 space-y-3">
        <textarea
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          placeholder="Escribí una nota o novedad sobre el caso…"
          rows={3}
          className="w-full bg-transparent text-sm text-white placeholder-gray-500 resize-none focus:outline-none"
        />
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

        {conTarea && (
          <div className="space-y-2 border-t border-white/5 pt-3">
            <input
              type="text"
              value={tareaTitulo}
              onChange={(e) => setTareaTitulo(e.target.value)}
              placeholder="Título corto de la tarea (opcional)"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50"
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
            </div>
            {!responsableId && (
              <p className="text-[10px] text-amber-400/80 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Elegí un responsable para crear la tarea
              </p>
            )}
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
    </div>
  );
}
