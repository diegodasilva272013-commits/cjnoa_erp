import { useState } from 'react';
import { X, MessageSquare, ListChecks, Phone, MapPin, CreditCard, FileText, ExternalLink, Trash2, Check, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotasFederales, useTareasFederales } from '../../hooks/useFederales';
import {
  ClienteFederal,
  PIPELINE_FEDERAL_LABELS,
  PIPELINE_FEDERAL_COLORS,
  TIPO_CASO_FEDERAL_LABELS,
  TareaFederal,
} from '../../types/federales';

interface Props {
  ficha: ClienteFederal;
  onClose: () => void;
}

export default function FichaFederalDetalle({ ficha, onClose }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'datos' | 'seguimiento' | 'tareas'>('seguimiento');

  const { notas, add: addNota, remove: removeNota } = useNotasFederales(ficha.id);
  const { tareas, upsert: upsertTarea, remove: removeTarea, toggleEstado } = useTareasFederales(ficha.id);

  const [nuevaNota, setNuevaNota] = useState('');
  const [nuevaTareaTitulo, setNuevaTareaTitulo] = useState('');
  const [tareaEdit, setTareaEdit] = useState<TareaFederal | null>(null);

  async function handleAddNota() {
    if (!nuevaNota.trim()) return;
    const ok = await addNota(nuevaNota, user?.id || null);
    if (ok) setNuevaNota('');
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
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
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
              <div className="flex gap-2">
                <textarea
                  value={nuevaNota}
                  onChange={e => setNuevaNota(e.target.value)}
                  placeholder="Agregar nota de seguimiento..."
                  className="flex-1 min-h-[60px] px-3 py-2 bg-gray-800/60 border border-gray-700 rounded text-sm text-white focus:border-blue-500 outline-none"
                />
                <button
                  onClick={handleAddNota}
                  disabled={!nuevaNota.trim()}
                  className="px-3 py-2 self-stretch bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-sm font-semibold flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Nota
                </button>
              </div>

              {notas.length === 0
                ? <div className="text-center text-gray-500 text-sm py-8">Sin notas todavía.</div>
                : (
                  <ul className="space-y-2">
                    {notas.map(n => (
                      <li key={n.id} className="bg-gray-800/40 border border-gray-700 rounded p-3 group">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm text-gray-100 whitespace-pre-wrap flex-1">{n.contenido}</div>
                          <button
                            onClick={() => { if (confirm('¿Eliminar nota?')) removeNota(n.id); }}
                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1">{new Date(n.created_at).toLocaleString('es-AR')}</div>
                      </li>
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
                        </div>
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
