import { useState } from 'react';
import { ChevronUp, ChevronDown, Plus, Trash2, Users, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTareaFederalPasos, TareaFederalPaso } from '../../hooks/useTareaFederalPasos';

export interface PerfilLite { id: string; nombre: string; }

// ============================================================
// PasosFederalEditorLocal — para tareas NUEVAS (sin id todavía).
// Mantiene los pasos en estado local; al guardar la tarea se persisten.
// ============================================================
export function PasosFederalEditorLocal({ pasos, setPasos, perfiles }: {
  pasos: { descripcion: string; responsable_id: string }[];
  setPasos: React.Dispatch<React.SetStateAction<{ descripcion: string; responsable_id: string }[]>>;
  perfiles: PerfilLite[];
}) {
  const update = (idx: number, patch: Partial<{ descripcion: string; responsable_id: string }>) =>
    setPasos(arr => arr.map((p, i) => i === idx ? { ...p, ...patch } : p));
  const remove = (idx: number) => setPasos(arr => arr.filter((_, i) => i !== idx));
  const add = () => setPasos(arr => [...arr, { descripcion: '', responsable_id: '' }]);
  const move = (idx: number, dir: 'up' | 'down') => {
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= pasos.length) return;
    setPasos(arr => {
      const next = [...arr];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-violet-300" />
          <span className="text-[11px] uppercase tracking-widest font-semibold text-violet-300">
            Pasos compartidos (opcional)
          </span>
        </div>
        <button type="button" onClick={add}
          className="text-[10px] text-violet-200 hover:text-white flex items-center gap-1 px-2 py-1 rounded-md bg-violet-500/15 border border-violet-500/30">
          <Plus className="w-3 h-3" /> Agregar paso
        </button>
      </div>

      <p className="text-[11px] text-gray-500">
        Dividí la tarea entre varias personas. Al terminar un paso se notifica al siguiente. Se guardan al hacer click en <b>Agregar tarea</b>.
      </p>

      <div className="space-y-1.5">
        {pasos.length === 0 && (
          <p className="text-[11px] text-gray-600 italic px-1">
            Sin pasos. Si la hace una sola persona, dejá esto vacío.
          </p>
        )}
        {pasos.map((p, idx) => (
          <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <div className="flex flex-col">
              <button type="button" onClick={() => move(idx, 'up')} disabled={idx === 0}
                className="text-gray-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
                <ChevronUp className="w-3 h-3" />
              </button>
              <button type="button" onClick={() => move(idx, 'down')} disabled={idx === pasos.length - 1}
                className="text-gray-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
            <span className="text-[10px] font-mono text-violet-400 mt-1.5 w-4 text-center flex-shrink-0">{idx + 1}</span>
            <div className="flex-1 min-w-0 space-y-1">
              <input
                value={p.descripcion}
                onChange={e => update(idx, { descripcion: e.target.value })}
                className="w-full px-2 py-1 bg-gray-900/60 border border-gray-700 rounded text-xs text-white focus:border-violet-500 outline-none"
                placeholder="Qué hay que hacer en este paso"
              />
              <select
                value={p.responsable_id}
                onChange={e => update(idx, { responsable_id: e.target.value })}
                className="w-full px-2 py-0.5 bg-gray-900/60 border border-gray-700 rounded text-[10px] text-white focus:border-violet-500 outline-none"
              >
                <option value="">— Responsable —</option>
                {perfiles.map(pp => (
                  <option key={pp.id} value={pp.id}>{pp.nombre}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => remove(idx)}
              className="text-gray-600 hover:text-red-400 p-1 mt-1">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// PasosFederalEditor — pasos compartidos para una tarea EXISTENTE.
// ============================================================
export function PasosFederalEditor({ tareaFederalId, perfiles }: {
  tareaFederalId: string;
  perfiles: PerfilLite[];
}) {
  const { user } = useAuth();
  const { pasos, agregar, actualizar, eliminar, togglePaso, mover } = useTareaFederalPasos(tareaFederalId);
  const [nuevoDesc, setNuevoDesc] = useState('');
  const [nuevoResp, setNuevoResp] = useState('');

  const total = pasos.length;
  const hechos = pasos.filter(p => p.completado).length;

  const onAgregar = async () => {
    if (!nuevoDesc.trim()) return;
    const ok = await agregar(nuevoDesc, nuevoResp || null);
    if (ok) { setNuevoDesc(''); setNuevoResp(''); }
  };

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-3 space-y-3 mt-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-violet-300" />
          <span className="text-[11px] uppercase tracking-widest font-semibold text-violet-300">
            Pasos compartidos
          </span>
        </div>
        {total > 0 && (
          <span className="text-[10px] text-gray-400">{hechos}/{total} completados</span>
        )}
      </div>

      <p className="text-[11px] text-gray-500 -mt-1">
        Al cerrar el último paso, la tarea se marca como completada y queda registro automático en el seguimiento del caso federal.
      </p>

      <div className="space-y-1.5">
        {pasos.map((p: TareaFederalPaso, i: number) => (
          <div key={p.id} className={`flex items-start gap-2 p-2 rounded-lg border ${
            p.completado ? 'bg-emerald-500/[0.06] border-emerald-500/20' : 'bg-white/[0.03] border-white/[0.06]'
          }`}>
            <div className="flex flex-col">
              <button type="button" onClick={() => mover(p, 'up')} disabled={i === 0}
                className="text-gray-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
                <ChevronUp className="w-3 h-3" />
              </button>
              <button type="button" onClick={() => mover(p, 'down')} disabled={i === pasos.length - 1}
                className="text-gray-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            <span className="text-[10px] font-mono text-violet-400 mt-1.5 w-4 text-center flex-shrink-0">
              {p.orden}
            </span>

            <button type="button" onClick={() => togglePaso(p, user?.id || '')}
              className={`mt-1 w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                p.completado ? 'bg-emerald-500/30 border-emerald-500' : 'border-gray-600 hover:border-emerald-400'
              }`}>
              {p.completado && <CheckCircle className="w-3 h-3 text-emerald-300" />}
            </button>

            <div className="flex-1 min-w-0 space-y-1">
              <input
                value={p.descripcion}
                onChange={e => actualizar(p.id, { descripcion: e.target.value })}
                className={`w-full px-2 py-1 bg-gray-900/60 border border-gray-700 rounded text-xs text-white focus:border-violet-500 outline-none ${p.completado ? 'line-through text-gray-500' : ''}`}
                placeholder="Qué hay que hacer en este paso"
              />
              <div className="flex items-center gap-2">
                <select
                  value={p.responsable_id || ''}
                  onChange={e => actualizar(p.id, { responsable_id: e.target.value || null })}
                  className="flex-1 px-2 py-0.5 bg-gray-900/60 border border-gray-700 rounded text-[10px] text-white focus:border-violet-500 outline-none"
                >
                  <option value="">— Sin asignar —</option>
                  {perfiles.map(pp => (
                    <option key={pp.id} value={pp.id}>{pp.nombre}</option>
                  ))}
                </select>
                {p.completado && p.completado_por_nombre && (
                  <span className="text-[9px] text-emerald-400 whitespace-nowrap">
                    ✓ {p.completado_por_nombre}{p.completado_at ? ` · ${new Date(p.completado_at).toLocaleDateString('es-AR')}` : ''}
                  </span>
                )}
                <button type="button" onClick={() => eliminar(p.id)}
                  className="text-gray-600 hover:text-red-400 p-0.5">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-white/[0.05]">
        <input
          value={nuevoDesc}
          onChange={e => setNuevoDesc(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAgregar(); } }}
          className="flex-1 px-2 py-1 bg-gray-900/60 border border-gray-700 rounded text-xs text-white focus:border-violet-500 outline-none"
          placeholder="Descripción del nuevo paso"
        />
        <select
          value={nuevoResp}
          onChange={e => setNuevoResp(e.target.value)}
          className="px-2 py-1 bg-gray-900/60 border border-gray-700 rounded text-xs text-white focus:border-violet-500 outline-none sm:w-44"
        >
          <option value="">— Responsable —</option>
          {perfiles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <button type="button" onClick={onAgregar} disabled={!nuevoDesc.trim()}
          className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-xs font-semibold flex items-center gap-1">
          <Plus className="w-3 h-3" /> Agregar
        </button>
      </div>
    </div>
  );
}
