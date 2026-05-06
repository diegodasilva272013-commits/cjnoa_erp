import { useEffect, useState } from 'react';
import { History, Loader2, Shield, ToggleLeft, ToggleRight, User } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AuditEntry {
  id: string;
  perfil_id: string | null;
  changed_by: string | null;
  campo: string;
  valor_anterior: unknown;
  valor_nuevo: unknown;
  created_at: string;
  perfil_nombre: string | null;
  perfil_email: string | null;
  changed_by_nombre: string | null;
}

export default function AuditLogPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expand, setExpand] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('audit_log_permisos_completo')
        .select('*')
        .limit(expand ? 200 : 15);
      if (error) setError(error.message);
      else setEntries((data as AuditEntry[]) || []);
      setLoading(false);
    };
    fetch();
  }, [expand]);

  const fmt = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const describeValor = (v: unknown): string => {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return v ? 'activo' : 'inactivo';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return '(permisos custom)';
    return String(v);
  };

  const iconoCampo = (c: string) => {
    if (c === 'rol') return <Shield className="w-4 h-4 text-violet-300" />;
    if (c === 'activo') return <ToggleRight className="w-4 h-4 text-emerald-300" />;
    return <User className="w-4 h-4 text-blue-300" />;
  };

  return (
    <div className="glass-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg font-bold text-white">Auditoría de permisos</h3>
        </div>
        <button
          onClick={() => setExpand(!expand)}
          className="text-xs text-blue-300 hover:text-blue-200"
        >
          {expand ? 'Ver menos' : 'Ver todo'}
        </button>
      </div>
      <p className="text-xs text-gray-500">Registro inmutable de cambios de rol, permisos y estado activo.</p>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
        </div>
      ) : error ? (
        <div className="text-xs py-3 space-y-1">
          <p className="text-amber-400">⚠ Auditoría de permisos no disponible.</p>
          <p className="text-gray-500">
            Falta aplicar la migración <code className="bg-white/5 px-1 rounded">supabase/migration_audit_permisos.sql</code> en Supabase. (Esto no afecta el alta del usuario.)
          </p>
        </div>
      ) : entries.length === 0 ? (
        <p className="text-center text-gray-500 py-6 text-sm">Sin cambios registrados.</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
          {entries.map(e => (
            <div key={e.id} className="bg-white/5 border border-white/10 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                {iconoCampo(e.campo)}
                <span className="text-sm text-white">
                  <span className="font-semibold">{e.perfil_nombre || e.perfil_email || 'Usuario eliminado'}</span>
                </span>
                <span className="ml-auto text-xs text-gray-500">{fmt(e.created_at)}</span>
              </div>
              <p className="text-xs text-gray-300">
                <span className="text-gray-500">{e.campo === 'rol' ? 'Rol' : e.campo === 'activo' ? 'Estado' : 'Permisos'}:</span>{' '}
                <span className="text-red-300 line-through">{describeValor(e.valor_anterior)}</span>
                {' → '}
                <span className="text-emerald-300 font-medium">{describeValor(e.valor_nuevo)}</span>
              </p>
              {e.changed_by_nombre && (
                <p className="text-xs text-gray-500 mt-1">Por: {e.changed_by_nombre}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
