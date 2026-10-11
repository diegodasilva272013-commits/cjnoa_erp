import { useCallback, useEffect, useState } from 'react';
import { X, Trash2, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export const PROFESIONALES_AGENDA = ['Alejandro', 'Fabricio'] as const;
export type ProfesionalAgenda = (typeof PROFESIONALES_AGENDA)[number];

const norm = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Alejandro / Fabricio según el nombre del perfil (misma regla difusa que usa la base en las RLS). */
export function profesionalDePerfil(nombre: string | null | undefined): ProfesionalAgenda | null {
  const n = norm(nombre ?? '');
  return PROFESIONALES_AGENDA.find(p => n.includes(norm(p))) ?? null;
}

type Bloque = {
  id: string;
  dia_semana: number | null;
  fecha: string | null;
  hora_desde: string;
  hora_hasta: string;
  duracion_min: number;
};

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const hhmm = (t: string) => t.slice(0, 5);

export default function DisponibilidadModal({
  profesionalPropio, perfilId, esAdmin, onClose,
}: { profesionalPropio: ProfesionalAgenda | null; perfilId: string; esAdmin: boolean; onClose: () => void }) {
  // Alejandro/Fabricio cargan lo suyo; el administrador elige de quién y ve ambos.
  const [profesional, setProfesional] = useState<ProfesionalAgenda>(profesionalPropio ?? 'Alejandro');
  const [bloques, setBloques] = useState<Bloque[]>([]);
  const [tipo, setTipo] = useState<'semanal' | 'fecha'>('semanal');
  const [dias, setDias] = useState<number[]>([1]);
  const [fecha, setFecha] = useState('');
  const [desde, setDesde] = useState('09:00');
  const [hasta, setHasta] = useState('13:00');
  const [duracion, setDuracion] = useState(30);
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('disponibilidad_horarios')
      .select('id, dia_semana, fecha, hora_desde, hora_hasta, duracion_min')
      .eq('profesional', profesional)
      .order('dia_semana', { nullsFirst: false })
      .order('fecha')
      .order('hora_desde');
    if (error) setMsg('No se pudieron cargar los horarios: ' + error.message);
    else setBloques((data ?? []) as Bloque[]);
  }, [profesional]);

  useEffect(() => { cargar(); }, [cargar]);

  async function agregar() {
    setMsg(null);
    if (hasta <= desde) return setMsg('La hora "hasta" debe ser mayor que "desde".');
    if (tipo === 'fecha' && !fecha) return setMsg('Elegí la fecha.');
    if (tipo === 'semanal' && dias.length === 0) return setMsg('Elegí al menos un día.');
    if ((timeToMin(hasta) - timeToMin(desde)) < duracion) return setMsg('El tramo es más corto que la duración del turno.');
    setGuardando(true);
    // El dueño del horario es el perfil del profesional (si lo carga el admin, se busca su perfil).
    let dueno = perfilId;
    if (profesional !== profesionalPropio) {
      const { data: perfs } = await supabase.from('perfiles').select('id, nombre').ilike('nombre', `%${profesional}%`);
      const perfil = (perfs ?? []).find(p => profesionalDePerfil(p.nombre) === profesional);
      // Si ningún perfil se llama como el profesional, lo carga el admin a su nombre: el agente lee por `profesional`, no por dueño.
      if (!perfil && !esAdmin) { setGuardando(false); return setMsg(`No hay un usuario de ${profesional} en el sistema para asociarle el horario.`); }
      if (perfil) dueno = perfil.id;
    }
    const base = { profesional, perfil_id: dueno, hora_desde: desde, hora_hasta: hasta, duracion_min: duracion };
    const filas = tipo === 'semanal'
      ? [...dias].sort().map(d => ({ ...base, dia_semana: d, fecha: null }))
      : [{ ...base, dia_semana: null, fecha }];
    const { error } = await supabase.from('disponibilidad_horarios').insert(filas);
    setGuardando(false);
    if (error) return setMsg('No se pudo guardar: ' + error.message);
    await cargar();
  }

  async function borrar(id: string) {
    const { error } = await supabase.from('disponibilidad_horarios').delete().eq('id', id);
    if (error) return setMsg('No se pudo borrar: ' + error.message);
    setBloques(b => b.filter(x => x.id !== id));
  }

  const input = 'w-full mt-1 px-3 py-2 rounded-md bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-white/30';
  const label = 'text-[11px] uppercase tracking-wider text-gray-500';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-white/10 bg-[#0a0a0a] p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-white font-semibold">Disponibilidad · {profesional}</h3>
            <p className="text-xs text-gray-500 mt-1">
              El agente de IA ofrece estos horarios y agenda solo en lo que esté libre. Para fraccionar el día, cargá varios tramos.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        {esAdmin && (
          <div className="flex gap-2">
            {PROFESIONALES_AGENDA.map(p => (
              <button key={p} onClick={() => setProfesional(p)}
                className={`px-3 py-1.5 text-xs rounded-md border ${p === profesional ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200' : 'bg-white/5 border-white/10 text-gray-400'}`}>
                {p}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Tipo</label>
            <select value={tipo} onChange={e => setTipo(e.target.value as 'semanal' | 'fecha')} className={input}>
              <option value="semanal">Todas las semanas</option>
              <option value="fecha">Una fecha puntual</option>
            </select>
          </div>
          {tipo === 'semanal' ? (
            <div className="col-span-2">
              <label className={label}>Días (podés elegir varios)</label>
              <div className="flex flex-wrap gap-2">
                {DIAS.map((d, i) => {
                  const activo = dias.includes(i + 1);
                  return (
                    <button key={d} type="button"
                      onClick={() => setDias(a => activo ? a.filter(x => x !== i + 1) : [...a, i + 1])}
                      className={`px-3 py-2 rounded-lg border text-sm ${activo ? 'bg-emerald-900/40 border-emerald-600/50 text-emerald-300' : 'bg-zinc-900 border-zinc-700 text-zinc-400'}`}>
                      {d.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-3 mt-2 text-xs">
                <button type="button" onClick={() => setDias([1, 2, 3, 4, 5])} className="text-emerald-400 hover:underline">Lunes a viernes</button>
                <button type="button" onClick={() => setDias([1, 2, 3, 4, 5, 6, 7])} className="text-emerald-400 hover:underline">Todos</button>
                <button type="button" onClick={() => setDias([])} className="text-zinc-500 hover:underline">Limpiar</button>
              </div>
            </div>
          ) : (
            <div>
              <label className={label}>Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={input} />
            </div>
          )}
          <div>
            <label className={label}>Desde</label>
            <input type="time" value={desde} onChange={e => setDesde(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Hasta</label>
            <input type="time" value={hasta} onChange={e => setHasta(e.target.value)} className={input} />
          </div>
          <div className="col-span-2">
            <label className={label}>Duración de cada turno</label>
            <select value={duracion} onChange={e => setDuracion(Number(e.target.value))} className={input}>
              {[15, 20, 30, 45, 60, 90].map(m => <option key={m} value={m}>{m} minutos</option>)}
            </select>
          </div>
        </div>

        <button onClick={agregar} disabled={guardando}
          className="px-3 py-2 text-xs rounded-md bg-emerald-500 hover:bg-emerald-400 text-black font-medium flex items-center gap-1.5 disabled:opacity-50">
          <Plus className="w-3.5 h-3.5" /> Agregar tramo
        </button>

        {msg && <p className="text-xs text-amber-300">{msg}</p>}

        <div className="space-y-1.5">
          {bloques.length === 0 && <p className="text-sm text-gray-500">Todavía no cargaste horarios.</p>}
          {bloques.map(b => (
            <div key={b.id} className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
              <span>
                {b.fecha ? b.fecha.split('-').reverse().join('/') : DIAS[(b.dia_semana ?? 1) - 1]}
                {' · '}{hhmm(b.hora_desde)} a {hhmm(b.hora_hasta)}
                <span className="text-gray-500"> · turnos de {b.duracion_min} min</span>
              </span>
              <button onClick={() => borrar(b.id)} className="text-rose-300 hover:text-rose-200" title="Quitar"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function timeToMin(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}
