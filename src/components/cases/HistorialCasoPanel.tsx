import { useState } from 'react';
import { Plus, History, Sparkles, User, Loader2, Lock } from 'lucide-react';
import { useHistorialCaso } from '../../hooks/useTareas';
import { useAuth } from '../../context/AuthContext';
import { CasoCompleto } from '../../types/database';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';

interface HistorialCasoPanelProps {
  caso: CasoCompleto;
}

interface ResumenIA {
  resumen: string;
  ultimos_avances: string[];
  proximos_pasos: string[];
  alertas: string[];
}

export default function HistorialCasoPanel({ caso }: HistorialCasoPanelProps) {
  const { user } = useAuth();
  const { historial, loading, agregar } = useHistorialCaso(caso.id);
  const { showToast } = useToast();

  const [adding, setAdding] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tareaSiguiente, setTareaSiguiente] = useState('');
  const [saving, setSaving] = useState(false);

  const [resumen, setResumen] = useState<ResumenIA | null>(null);
  const [generando, setGenerando] = useState(false);

  const handleSave = async () => {
    if (!titulo.trim()) { showToast('El título es obligatorio', 'error'); return; }
    setSaving(true);
    const ok = await agregar(titulo, descripcion, tareaSiguiente, user?.id || '');
    if (ok && tareaSiguiente.trim()) {
      await supabase.from('tareas').insert({
        titulo: tareaSiguiente.trim(),
        caso_id: caso.id,
        descripcion: `Originado desde avance: ${titulo}`,
        estado: 'en_curso',
        prioridad: 'media',
        created_by: user?.id || null,
        updated_by: user?.id || null,
      });
    }
    setSaving(false);
    if (ok) {
      setTitulo(''); setDescripcion(''); setTareaSiguiente('');
      setAdding(false);
    }
  };

  const handleResumen = async () => {
    setGenerando(true);
    setResumen(null);
    try {
      const res = await fetch('/api/copiloto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'resumen_caso',
          datos: {
            cliente_nombre: caso.nombre_apellido,
            expediente: caso.expediente,
            radicado: caso.radicado,
            materia: caso.materia,
            sistema: caso.sistema,
            personeria: caso.personeria,
            estado: caso.estado,
            prioridad: caso.prioridad,
            archivado: caso.archivado,
            historial: historial.map(h => ({
              fecha: h.created_at,
              autor: h.autor_nombre,
              titulo: h.titulo,
              descripcion: h.descripcion,
              tarea: h.tarea_siguiente,
            })),
          },
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt);
      }
      const data = await res.json();
      setResumen(data);
    } catch (err: any) {
      showToast('Error generando resumen: ' + (err.message || 'desconocido'), 'error');
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <History className="w-4 h-4 text-purple-400" />
          Historial del caso
          <span className="text-[10px] text-gray-600">({historial.length})</span>
          <span className="text-[10px] text-gray-700 flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> inmutable</span>
        </h3>
        <div className="flex gap-2">
          <button onClick={handleResumen} disabled={generando || historial.length === 0}
            className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-purple-200 hover:from-purple-500/30 hover:to-pink-500/30 disabled:opacity-50 flex items-center gap-1.5">
            {generando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Generar resumen
          </button>
          <button onClick={() => setAdding(s => !s)}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 flex items-center gap-1.5">
            <Plus className="w-3 h-3" /> Agregar avance
          </button>
        </div>
      </div>

      {/* Resumen IA */}
      {resumen && (
        <div className="glass-card p-4 border border-purple-500/20 bg-purple-500/[0.03] space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <h4 className="text-xs font-semibold text-white">Resumen generado por IA</h4>
            <button onClick={() => setResumen(null)} className="ml-auto text-[10px] text-gray-500 hover:text-white">cerrar</button>
          </div>
          <p className="text-xs text-gray-300 leading-relaxed">{resumen.resumen}</p>
          {resumen.ultimos_avances?.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Últimos avances</p>
              <ul className="text-xs text-gray-300 space-y-0.5 list-disc list-inside">
                {resumen.ultimos_avances.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}
          {resumen.proximos_pasos?.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Próximos pasos</p>
              <ul className="text-xs text-gray-300 space-y-0.5 list-disc list-inside">
                {resumen.proximos_pasos.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}
          {resumen.alertas?.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-amber-500 mb-1">Alertas</p>
              <ul className="text-xs text-amber-300 space-y-0.5 list-disc list-inside">
                {resumen.alertas.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Form agregar */}
      {adding && (
        <div className="glass-card p-4 space-y-3 border border-white/10">
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Título del avance *</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} autoFocus
              className="input-dark text-sm mt-1" placeholder="Ej: Participación en autos – Facundo López" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Descripción del avance</label>
            <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)}
              className="input-dark text-sm mt-1" rows={3} placeholder="Detalle del avance realizado..." />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">TAREA: lo que corresponde hacer ahora</label>
            <textarea value={tareaSiguiente} onChange={e => setTareaSiguiente(e.target.value)}
              className="input-dark text-sm mt-1" rows={2} placeholder="Próximo paso a realizar..." />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="btn-secondary text-xs px-3 py-1.5">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              Registrar
            </button>
          </div>
          <p className="text-[10px] text-gray-600 italic">⚠ Una vez registrado, no se puede editar ni eliminar (spec sección 4.2).</p>
        </div>
      )}

      {/* Lista historial */}
      {loading ? (
        <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-500" /></div>
      ) : historial.length === 0 ? (
        <div className="text-center py-8">
          <History className="w-8 h-8 text-gray-700 mx-auto mb-2" />
          <p className="text-xs text-gray-500">Sin avances registrados</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {historial.map(h => (
            <div key={h.id} className="glass-card p-3 border border-white/5">
              <div className="flex items-start justify-between gap-2">
                <h5 className="text-sm font-medium text-white">{h.titulo}</h5>
                <span className="text-[10px] text-gray-600 flex-shrink-0">
                  {new Date(h.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {h.autor_nombre && (
                <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                  <User className="w-2.5 h-2.5" /> {h.autor_nombre}
                </p>
              )}
              {h.descripcion && <p className="text-xs text-gray-300 mt-2 whitespace-pre-wrap">{h.descripcion}</p>}
              {h.tarea_siguiente && (
                <div className="mt-2 p-2 rounded-lg bg-blue-500/[0.04] border border-blue-500/10">
                  <p className="text-[10px] uppercase tracking-wider text-blue-400 mb-0.5">TAREA</p>
                  <p className="text-xs text-blue-100">{h.tarea_siguiente}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
