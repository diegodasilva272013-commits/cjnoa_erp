import { useState } from 'react';
import { MessageSquare, Send, Edit2, Trash2, Check, X, Loader2 } from 'lucide-react';
import { useComentariosCaso } from '../../hooks/useTareas';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

interface Props {
  casoId: string;
}

export default function ComentariosCasoPanel({ casoId }: Props) {
  const { user, perfil } = useAuth();
  const { comentarios, loading, agregar, editar, eliminar } = useComentariosCaso(casoId);
  const { showToast } = useToast();

  const [nuevo, setNuevo] = useState('');
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const esAdminSocio = perfil?.rol === 'admin' || perfil?.rol === 'socio';

  const handleSend = async () => {
    if (!nuevo.trim() || !user) return;
    setSaving(true);
    const ok = await agregar(nuevo, user.id);
    setSaving(false);
    if (ok) { setNuevo(''); showToast('Comentario agregado', 'success'); }
  };

  const handleEdit = async (id: string) => {
    if (!editText.trim()) return;
    const ok = await editar(id, editText);
    if (ok) { setEditId(null); setEditText(''); showToast('Comentario actualizado', 'success'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este comentario?')) return;
    const ok = await eliminar(id);
    if (ok) showToast('Comentario eliminado', 'success');
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-blue-400" />
        <h3 className="text-lg font-bold text-white">Comentarios del caso</h3>
        <span className="text-xs text-gray-400">({comentarios.length})</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
        </div>
      ) : comentarios.length === 0 ? (
        <p className="text-center text-gray-500 py-6 text-sm">Sin comentarios todavía. Sé el primero en agregar uno.</p>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
          {comentarios.map((c) => {
            const puedeEditar = user && (c.created_by === user.id || esAdminSocio);
            const enEdicion = editId === c.id;
            return (
              <div key={c.id} className="bg-white/5 border border-white/10 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  {c.autor_avatar ? (
                    <img src={c.autor_avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-blue-500/30 text-blue-200 text-xs flex items-center justify-center font-bold">
                      {(c.autor_nombre || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-semibold text-white">{c.autor_nombre || 'Usuario'}</span>
                  <span className="text-xs text-gray-500">{fmt(c.created_at)}</span>
                  {c.editado && <span className="text-xs text-gray-500 italic">(editado)</span>}
                  {puedeEditar && !enEdicion && (
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        onClick={() => { setEditId(c.id); setEditText(c.contenido); }}
                        className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-300"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {enEdicion ? (
                  <div className="space-y-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="input-dark w-full text-sm"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(c.id)}
                        className="px-3 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-medium flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" /> Guardar
                      </button>
                      <button
                        onClick={() => { setEditId(null); setEditText(''); }}
                        className="px-3 py-1 rounded bg-white/5 text-gray-300 hover:bg-white/10 text-xs flex items-center gap-1"
                      >
                        <X className="w-3 h-3" /> Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-200 whitespace-pre-wrap break-words">{c.contenido}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-start gap-2 pt-3 border-t border-white/10">
        <textarea
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend(); }}
          placeholder="Escribí un comentario... (Ctrl+Enter para enviar)"
          className="input-dark flex-1 text-sm"
          rows={2}
        />
        <button
          onClick={handleSend}
          disabled={saving || !nuevo.trim()}
          className="btn-primary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
