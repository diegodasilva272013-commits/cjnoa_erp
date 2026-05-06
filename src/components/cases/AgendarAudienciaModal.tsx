import { useState, useEffect } from 'react';
import { Gavel, X, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

interface Props {
  casoGeneralId: string;
  casoTitulo?: string | null;
  onClose: () => void;
  onCreated?: () => void;
}

interface PerfilLite { id: string; nombre: string }

export default function AgendarAudienciaModal({ casoGeneralId, casoTitulo, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [perfiles, setPerfiles] = useState<PerfilLite[]>([]);
  const [fecha, setFecha] = useState('');
  const [tipo, setTipo] = useState('');
  const [juzgado, setJuzgado] = useState('');
  const [abogadoId, setAbogadoId] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    supabase.from('perfiles').select('id, nombre').eq('activo', true).then(({ data }) => {
      if (data) setPerfiles(data as PerfilLite[]);
    });
  }, []);

  async function handleAgendar() {
    if (!user?.id || !fecha) {
      showToast('Falta la fecha y hora', 'error');
      return;
    }
    setGuardando(true);
    const fechaIso = new Date(fecha).toISOString();
    const notaPrefix = casoTitulo ? `[Caso: ${casoTitulo}] ` : '';
    const payloadFull: any = {
      caso_general_id: casoGeneralId,
      fecha: fechaIso,
      juzgado: juzgado || null,
      tipo: tipo || null,
      abogado_id: abogadoId || null,
      notas: (notaPrefix + (notas || '')).trim() || null,
      created_by: user.id,
    };
    let insertedId: string | null = null;
    let { data: insData, error } = await supabase.from('audiencias_general').insert(payloadFull).select('id').maybeSingle();
    if (insData?.id) insertedId = insData.id;

    // Fallback si la migration aun no se aplico (columna caso_general_id no existe)
    if (error && /caso_general_id/i.test(error.message)) {
      const fallback: any = { ...payloadFull };
      delete fallback.caso_general_id;
      // metemos referencia al caso en notas
      fallback.notas = `[CasoGeneralID:${casoGeneralId}] ${fallback.notas || ''}`.trim();
      const r2 = await supabase.from('audiencias_general').insert(fallback).select('id').maybeSingle();
      error = r2.error;
      if (r2.data?.id) insertedId = r2.data.id;
      if (!error) {
        showToast('Audiencia creada (corre la migracion para vinculo formal con caso general)', 'success');
      }
    }

    if (error) {
      showToast('Error al crear audiencia: ' + error.message, 'error');
      setGuardando(false);
      return;
    }

    // Tambien agregar nota al seguimiento
    try {
      const fechaLegible = new Date(fecha).toLocaleString('es-AR', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      const partes = [
        `📅 Audiencia agendada para ${fechaLegible}`,
        tipo ? `Tipo: ${tipo}` : '',
        juzgado ? `Juzgado: ${juzgado}` : '',
        notas ? `Notas: ${notas}` : '',
      ].filter(Boolean).join('\n');
      await supabase.from('caso_general_notas').insert({
        caso_general_id: casoGeneralId,
        contenido: partes,
        created_by: user.id,
      });
    } catch { /* noop si no existe la tabla aun */ }

    // Sincronizar con Google Calendar (fire-and-forget)
    if (insertedId) {
      void fetch('/api/google/sync-audiencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audiencia_id: insertedId }),
      }).catch(() => {});
    }

    showToast('Audiencia agendada y agregada al seguimiento', 'success');
    setGuardando(false);
    onCreated?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={() => !guardando && onClose()}>
      <div className="glass-card w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Gavel className="w-4 h-4 text-orange-300" /> Agendar audiencia
          </h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        {casoTitulo && (
          <p className="text-[11px] text-gray-400">
            Caso: <span className="text-white font-semibold">{casoTitulo}</span>
          </p>
        )}
        <p className="text-[11px] text-gray-400">
          Se crea la audiencia y aparece automaticamente en el menu <span className="text-orange-300 font-semibold">Audiencias</span>.
        </p>
        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Fecha y hora *</label>
          <input type="datetime-local" required value={fecha}
            onChange={e => setFecha(e.target.value)}
            className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Tipo</label>
            <input value={tipo} onChange={e => setTipo(e.target.value)}
              placeholder="Ej: Conciliatoria"
              className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Abogado</label>
            <select value={abogadoId} onChange={e => setAbogadoId(e.target.value)}
              className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50">
              <option value="">— Sin asignar —</option>
              {perfiles.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <MapPin className="w-3 h-3" /> Juzgado
          </label>
          <input value={juzgado} onChange={e => setJuzgado(e.target.value)}
            placeholder="Ej: Juzgado Civil 3 - Sec 6"
            className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Notas</label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)}
            rows={3}
            className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            disabled={guardando}
            className="text-xs px-3 py-2 rounded-lg text-gray-300 hover:bg-white/5">Cancelar</button>
          <button type="button" onClick={handleAgendar}
            disabled={!fecha || guardando}
            className="text-xs px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-semibold flex items-center gap-1.5 disabled:opacity-40">
            <Gavel className="w-3.5 h-3.5" /> {guardando ? 'Agendando…' : 'Agendar audiencia'}
          </button>
        </div>
      </div>
    </div>
  );
}
