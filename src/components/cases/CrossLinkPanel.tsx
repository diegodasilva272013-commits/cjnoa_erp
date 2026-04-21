import { useEffect, useState } from 'react';
import { ExternalLink, Link2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface FichaVinculada {
  id: string;
  nombre_apellido: string;
  dni: string | null;
  pipeline: string | null;
}

interface CasoVinculado {
  id: string;
  materia: string;
  estado: string;
  expediente: string | null;
  socio: string | null;
}

/**
 * Muestra entidades vinculadas por nombre/teléfono entre casos y fichas previsional.
 */
export default function CrossLinkPanel({ clienteId, tipo }: {
  clienteId: string;
  tipo: 'caso' | 'previsional';
}) {
  const [fichas, setFichas] = useState<FichaVinculada[]>([]);
  const [casos, setCasos] = useState<CasoVinculado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      if (tipo === 'caso') {
        const { data, error } = await supabase.rpc('buscar_ficha_previsional_por_cliente', { p_cliente_id: clienteId });
        if (error) setError(error.message);
        else setFichas((data as FichaVinculada[]) || []);
      } else {
        const { data, error } = await supabase.rpc('buscar_casos_por_cliente_previsional', { p_cp_id: clienteId });
        if (error) setError(error.message);
        else setCasos((data as CasoVinculado[]) || []);
      }
      setLoading(false);
    };
    fetch();
  }, [clienteId, tipo]);

  if (loading) return null;
  if (error) return null; // silenciosamente no mostrar si la migration no está aplicada
  if (tipo === 'caso' && fichas.length === 0) return null;
  if (tipo === 'previsional' && casos.length === 0) return null;

  return (
    <div className="glass-card p-4 border border-blue-500/20 bg-blue-500/[0.03]">
      <div className="flex items-center gap-2 mb-2">
        <Link2 className="w-4 h-4 text-blue-400" />
        <h4 className="text-sm font-semibold text-white">
          {tipo === 'caso' ? 'Fichas previsionales vinculadas' : 'Casos judiciales vinculados'}
        </h4>
      </div>
      <p className="text-xs text-gray-500 mb-3">Detectados por coincidencia de nombre o teléfono.</p>
      <div className="space-y-2">
        {tipo === 'caso' && fichas.map(f => (
          <a
            key={f.id}
            href={`/previsional/fichas?cliente=${f.id}`}
            className="flex items-center justify-between p-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-sm transition"
          >
            <div>
              <p className="text-white">{f.nombre_apellido}</p>
              <p className="text-xs text-gray-400">
                {f.dni && `DNI ${f.dni} · `}Pipeline: {f.pipeline || '—'}
              </p>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
          </a>
        ))}
        {tipo === 'previsional' && casos.map(c => (
          <a
            key={c.id}
            href={`/casos?caso=${c.id}`}
            className="flex items-center justify-between p-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-sm transition"
          >
            <div>
              <p className="text-white">{c.materia} · {c.estado}</p>
              <p className="text-xs text-gray-400">
                {c.expediente && `Exp. ${c.expediente} · `}Socio: {c.socio || '—'}
              </p>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
          </a>
        ))}
      </div>
    </div>
  );
}
