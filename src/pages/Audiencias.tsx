import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Calendar as CalendarIcon, X, Edit2, Trash2, MapPin, User, Clock, CheckCircle, Briefcase } from 'lucide-react';
import { useAudienciasGeneral } from '../hooks/useTareas';
import { useCases } from '../hooks/useCases';
import { useCasosGenerales } from '../hooks/useCasosGenerales';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { AudienciaGeneralCompleta } from '../types/database';

interface PerfilLite { id: string; nombre: string }

export default function Audiencias() {
  const { user } = useAuth();
  const { audiencias, loading, upsert, remove } = useAudienciasGeneral();
  const { casos } = useCases();
  const { casos: casosGenerales } = useCasosGenerales();
  const [perfiles, setPerfiles] = useState<PerfilLite[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'todas' | 'proximas' | 'pasadas' | 'semana'>('proximas');
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<AudienciaGeneralCompleta | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('perfiles').select('id, nombre').eq('activo', true).then(({ data }) => {
      if (data) setPerfiles(data as PerfilLite[]);
    });
  }, []);

  const filtered = useMemo(() => {
    const ahora = new Date();
    const en7 = new Date(); en7.setDate(ahora.getDate() + 7);
    return audiencias.filter(a => {
      const f = new Date(a.fecha);
      const s = search.toLowerCase();
      const matchSearch = !s || (a.cliente_nombre || '').toLowerCase().includes(s) ||
        (a.juzgado || '').toLowerCase().includes(s) || (a.tipo || '').toLowerCase().includes(s) ||
        (a.caso_general_titulo || '').toLowerCase().includes(s);
      const matchFilter =
        filter === 'todas' ? true :
        filter === 'proximas' ? f >= ahora :
        filter === 'pasadas' ? f < ahora :
        filter === 'semana' ? f >= ahora && f <= en7 : true;
      return matchSearch && matchFilter;
    });
  }, [audiencias, search, filter]);

  const handleDel = async (a: AudienciaGeneralCompleta) => {
    if (confirmDel === a.id) {
      await remove(a.id);
      setConfirmDel(null);
    } else {
      setConfirmDel(a.id);
      setTimeout(() => setConfirmDel(null), 3000);
    }
  };

  const proximasSemana = audiencias.filter(a => {
    const f = new Date(a.fecha);
    const ahora = new Date();
    const en7 = new Date(); en7.setDate(ahora.getDate() + 7);
    return f >= ahora && f <= en7;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <CalendarIcon className="w-5 h-5 text-white" />
            </div>
            Audiencias
          </h1>
          <p className="text-sm text-gray-500 mt-1 ml-[52px]">
            {audiencias.length} totales {proximasSemana > 0 && <span className="text-orange-400">· {proximasSemana} esta semana</span>}
          </p>
        </div>
        <button onClick={() => { setSelected(null); setModalOpen(true); }} className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Nueva audiencia
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="input-dark pl-10 text-sm" placeholder="Buscar por cliente, juzgado, tipo..." />
        </div>
        <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl">
          {[
            { id: 'proximas', label: 'Próximas' },
            { id: 'semana', label: 'Esta semana' },
            { id: 'pasadas', label: 'Pasadas' },
            { id: 'todas', label: 'Todas' },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === f.id ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'
              }`}>{f.label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12"><div className="w-6 h-6 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <CalendarIcon className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No hay audiencias</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a, i) => {
            const f = new Date(a.fecha);
            const isPast = f < new Date();
            return (
              <div key={a.id}
                className={`glass-card p-4 cursor-pointer hover:bg-white/[0.03] transition-all animate-fade-in ${isPast ? 'opacity-60' : ''} ${a.realizada ? 'border-emerald-500/20' : ''}`}
                style={{ animationDelay: `${i * 20}ms` }}
                onClick={() => { setSelected(a); setModalOpen(true); }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="text-center flex-shrink-0 w-14">
                      <div className="text-[10px] text-gray-500 uppercase">{f.toLocaleDateString('es-AR', { month: 'short' })}</div>
                      <div className="text-2xl font-bold text-white">{f.getDate()}</div>
                      <div className="text-[10px] text-gray-500">{f.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-medium text-white">{a.cliente_nombre || a.caso_general_titulo || '— Sin caso —'}</h4>
                        {a.caso_general_titulo && !a.cliente_nombre && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30 flex items-center gap-1">
                            <Briefcase className="w-2.5 h-2.5" /> Caso general
                          </span>
                        )}
                        {a.realizada && <span className="text-[10px] text-emerald-400 flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" /> Realizada</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px] text-gray-500">
                        {a.tipo && <span>{a.tipo}</span>}
                        {a.juzgado && <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" /> {a.juzgado}</span>}
                        {a.abogado_nombre && <span className="flex items-center gap-1"><User className="w-2.5 h-2.5" /> {a.abogado_nombre}</span>}
                      </div>
                      {a.notas && <p className="text-[11px] text-gray-400 mt-1.5 italic line-clamp-2">{a.notas}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await upsert({ ...a, realizada: !a.realizada }, user?.id || '');
                      }}
                      title={a.realizada ? 'Marcar como pendiente' : 'Marcar como realizada'}
                      className={`p-1.5 rounded-lg transition-colors ${
                        a.realizada
                          ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                          : 'text-gray-600 hover:text-emerald-400 hover:bg-emerald-500/10'
                      }`}
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); handleDel(a); }}
                      className={`p-1.5 rounded-lg transition-colors ${
                        confirmDel === a.id ? 'bg-red-500/20 text-red-400' : 'text-gray-600 hover:text-red-400 hover:bg-red-500/10'
                      }`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <AudienciaModal
          audiencia={selected}
          casos={casos}
          casosGenerales={casosGenerales}
          perfiles={perfiles}
          onClose={() => { setModalOpen(false); setSelected(null); }}
          onSave={async (a) => { const ok = await upsert(a, user?.id || ''); if (ok) { setModalOpen(false); setSelected(null); } }}
        />
      )}
    </div>
  );
}

function AudienciaModal({ audiencia, casos, casosGenerales, perfiles, onClose, onSave }: {
  audiencia: AudienciaGeneralCompleta | null;
  casos: any[]; casosGenerales: any[]; perfiles: PerfilLite[];
  onClose: () => void; onSave: (a: any) => void;
}) {
  const initialFecha = audiencia ? new Date(audiencia.fecha).toISOString().slice(0, 16) : '';
  const [form, setForm] = useState({
    id: audiencia?.id,
    caso_id: audiencia?.caso_id || '',
    caso_general_id: audiencia?.caso_general_id || '',
    fecha: initialFecha,
    juzgado: audiencia?.juzgado || '',
    tipo: audiencia?.tipo || '',
    abogado_id: audiencia?.abogado_id || '',
    notas: audiencia?.notas || '',
    realizada: audiencia?.realizada || false,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fecha) return;
    onSave({
      ...form,
      caso_id: form.caso_id || null,
      caso_general_id: form.caso_general_id || null,
      abogado_id: form.abogado_id || null,
      fecha: new Date(form.fecha).toISOString(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <form onSubmit={submit} className="glass-card w-full max-w-xl my-8 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            {audiencia ? <><Edit2 className="w-4 h-4" /> Editar audiencia</> : <><Plus className="w-4 h-4" /> Nueva audiencia</>}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Cliente / Caso legal</label>
          <select value={form.caso_id} onChange={e => setForm(s => ({ ...s, caso_id: e.target.value }))} className="select-dark text-sm mt-1">
            <option value="">— Sin vincular —</option>
            {casos.map((c: any) => (
              <option key={c.id} value={c.id}>{c.nombre_apellido} {c.expediente ? `· ${c.expediente}` : ''}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Caso general</label>
          <select value={form.caso_general_id} onChange={e => setForm(s => ({ ...s, caso_general_id: e.target.value }))} className="select-dark text-sm mt-1">
            <option value="">— Sin vincular —</option>
            {casosGenerales.map((c: any) => (
              <option key={c.id} value={c.id}>{c.titulo} {c.expediente ? `· ${c.expediente}` : ''}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Fecha y hora *</label>
            <input type="datetime-local" required value={form.fecha} onChange={e => setForm(s => ({ ...s, fecha: e.target.value }))}
              className="input-dark text-sm mt-1" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Tipo</label>
            <input value={form.tipo} onChange={e => setForm(s => ({ ...s, tipo: e.target.value }))}
              className="input-dark text-sm mt-1" placeholder="Ej: Conciliatoria, prueba, sentencia..." />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Juzgado</label>
            <input value={form.juzgado} onChange={e => setForm(s => ({ ...s, juzgado: e.target.value }))}
              className="input-dark text-sm mt-1" placeholder="Ej: Juzgado Civil 3 - Sec 6" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Abogado a cargo</label>
            <select value={form.abogado_id} onChange={e => setForm(s => ({ ...s, abogado_id: e.target.value }))} className="select-dark text-sm mt-1">
              <option value="">— Sin asignar —</option>
              {perfiles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Notas</label>
          <textarea value={form.notas} onChange={e => setForm(s => ({ ...s, notas: e.target.value }))}
            className="input-dark text-sm mt-1" rows={3} />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={form.realizada} onChange={e => setForm(s => ({ ...s, realizada: e.target.checked }))}
            className="rounded border-white/20 bg-white/5" />
          <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Marcar como realizada</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary text-xs px-4 py-2">Cancelar</button>
          <button type="submit" className="btn-primary text-xs px-4 py-2">Guardar</button>
        </div>
      </form>
    </div>
  );
}
