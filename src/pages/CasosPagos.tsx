import { useEffect, useState, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, Search, Filter, X, ChevronDown, ChevronRight,
  CheckCircle2, AlertTriangle, Clock, CircleDollarSign, TrendingUp,
  CalendarDays, Wallet, Trash, MessageSquare, History,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSocios } from '../hooks/useSocios';
import Modal from '../components/Modal';
import { formatMoney } from '../lib/financeFormat';

// ============================================================================
// Tipos
// ============================================================================
interface CasoPago {
  id: string;
  caso_id: string | null;
  estado_caso: string | null;
  cliente_nombre: string;
  telefono: string | null;
  socio_carga: string;
  fecha_carga: string;
  honorarios: number;                     // Monto Total acordado
  observaciones: string | null;
  pago_inicial: number;
  pago_inicial_modalidad: 'Efectivo' | 'Transferencia' | null;
  pago_inicial_fecha: string | null;
  pago_inicial_pagado: boolean;
  ingreso_pago_inicial_id: string | null;
  created_at: string;
}

interface Cuota {
  id: string;
  caso_pago_id: string;
  numero: number;
  fecha_vencimiento: string;
  monto: number;
  estado: 'Pendiente' | 'Pagada';
  fecha_pago: string | null;
  modalidad_pago: 'Efectivo' | 'Transferencia' | null;
  cobrado_por: string | null;
  motivo_atraso: string | null;
  observaciones: string | null;
  ingreso_id: string | null;
}

interface MoraNota {
  id: string;
  cuota_id: string;
  caso_pago_id: string;
  fecha: string;
  motivo: string;
  autor_nombre: string | null;
}

type EstadoCuota = 'pagada' | 'vencida' | 'proxima' | 'a_cobrar';

const ESTADOS_CASO = ['Vino a consulta', 'Trámite no judicial', 'Cliente Judicial'] as const;
const MODALIDADES = ['Efectivo', 'Transferencia'] as const;

// ============================================================================
// Helpers
// ============================================================================
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function diasEntre(desdeISO: string, hastaISO: string) {
  const a = new Date(desdeISO + 'T00:00:00');
  const b = new Date(hastaISO + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function calcularEstadoCuota(c: Cuota): EstadoCuota {
  if (c.estado === 'Pagada') return 'pagada';
  const diff = diasEntre(hoyISO(), c.fecha_vencimiento);
  if (diff < 0) return 'vencida';
  if (diff <= 1) return 'proxima';
  return 'a_cobrar';
}

const ESTADO_VISUAL: Record<EstadoCuota, { label: string; chip: string; dot: string; text: string }> = {
  a_cobrar: {
    label: 'A Cobrar',
    chip: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    dot: 'bg-blue-400',
    text: 'text-blue-300',
  },
  proxima: {
    label: 'Próxima a vencer',
    chip: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400',
    text: 'text-amber-300',
  },
  vencida: {
    label: 'Vencida',
    chip: 'bg-red-500/10 text-red-300 border-red-500/40',
    dot: 'bg-red-500',
    text: 'text-red-300',
  },
  pagada: {
    label: 'Pagada',
    chip: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
    dot: 'bg-gray-500',
    text: 'text-gray-400',
  },
};

function addMonths(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const fecha = new Date(y, (m - 1) + n, d);
  return fecha.toISOString().slice(0, 10);
}

function monthKey(iso: string) { return iso.slice(0, 7); }

function monthLabel(yyyymm: string) {
  const [y, m] = yyyymm.split('-').map(Number);
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${names[m - 1]} ${y}`;
}

// ============================================================================
// Página principal
// ============================================================================
export default function CasosPagos() {
  const { perfil } = useAuth();
  const { showToast } = useToast();
  const socios = useSocios();
  const [searchParams] = useSearchParams();

  const [casos, setCasos] = useState<CasoPago[]>([]);
  const [cuotas, setCuotas] = useState<Cuota[]>([]);
  const [moraNotas, setMoraNotas] = useState<MoraNota[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [filtroEstadoCuota, setFiltroEstadoCuota] = useState<EstadoCuota | ''>('');
  const [filtroModalidad, setFiltroModalidad] = useState<'Efectivo' | 'Transferencia' | ''>('');
  const [filtroSocio, setFiltroSocio] = useState<string>('');

  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CasoPago | null>(null);

  const canAccess = perfil?.rol === 'socio' || perfil?.rol === 'admin' || perfil?.rol === 'abogado' || (perfil?.permisos?.finanzas === true);

  async function load() {
    setLoading(true);
    const [casosRes, cuotasRes, moraRes] = await Promise.all([
      supabase.from('casos_pagos').select('*').order('created_at', { ascending: false }),
      supabase.from('casos_pagos_cuotas').select('*').order('numero'),
      supabase.from('casos_pagos_cuotas_mora_historial').select('*').order('fecha', { ascending: false }),
    ]);
    if (casosRes.error) showToast(casosRes.error.message, 'error');
    else setCasos(casosRes.data || []);
    if (cuotasRes.error) showToast(cuotasRes.error.message, 'error');
    else setCuotas((cuotasRes.data || []) as Cuota[]);
    if (!moraRes.error) setMoraNotas((moraRes.data || []) as MoraNota[]);
    setLoading(false);
  }

  useEffect(() => { if (canAccess) load(); }, [canAccess]);

  // Auto-open desde URL
  useEffect(() => {
    const openId = searchParams.get('openId');
    if (!openId || casos.length === 0) return;
    const target = casos.find(c => c.id === openId);
    if (target) { setEditing(target); setModalOpen(true); }
  }, [casos, searchParams]);

  // Mapa cuotas por caso
  const cuotasPorCaso = useMemo(() => {
    const m = new Map<string, Cuota[]>();
    cuotas.forEach(c => {
      if (!m.has(c.caso_pago_id)) m.set(c.caso_pago_id, []);
      m.get(c.caso_pago_id)!.push(c);
    });
    return m;
  }, [cuotas]);

  // KPIs y proyección
  const kpis = useMemo(() => {
    const hoy = hoyISO();
    let totalMora = 0;
    let totalACobrar = 0;
    let cobradoMesActual = 0;
    const mesHoy = monthKey(hoy);
    const proyeccion = new Map<string, number>();
    cuotas.forEach(c => {
      const est = calcularEstadoCuota(c);
      const monto = Number(c.monto) || 0;
      if (est === 'vencida') totalMora += monto;
      if (est === 'a_cobrar' || est === 'proxima' || est === 'vencida') {
        totalACobrar += monto;
        const k = monthKey(c.fecha_vencimiento);
        proyeccion.set(k, (proyeccion.get(k) || 0) + monto);
      }
      if (est === 'pagada' && c.fecha_pago && monthKey(c.fecha_pago) === mesHoy) {
        cobradoMesActual += monto;
      }
    });
    const proyeccionOrdenada = Array.from(proyeccion.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 12);
    return { totalMora, totalACobrar, cobradoMesActual, totalCasos: casos.length, proyeccionOrdenada };
  }, [cuotas, casos]);

  // Aplicar filtros a la lista de casos
  const casosFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return casos.filter(caso => {
      if (q && !(
        caso.cliente_nombre.toLowerCase().includes(q) ||
        (caso.telefono || '').toLowerCase().includes(q) ||
        caso.socio_carga.toLowerCase().includes(q)
      )) return false;
      if (filtroSocio && caso.socio_carga !== filtroSocio) return false;

      const cuotasCaso = cuotasPorCaso.get(caso.id) || [];
      if (filtroEstadoCuota) {
        const matchEstado = cuotasCaso.some(c => calcularEstadoCuota(c) === filtroEstadoCuota);
        if (!matchEstado) return false;
      }
      if (filtroModalidad) {
        const matchMod =
          caso.pago_inicial_modalidad === filtroModalidad ||
          cuotasCaso.some(c => c.modalidad_pago === filtroModalidad);
        if (!matchMod) return false;
      }
      return true;
    });
  }, [casos, cuotasPorCaso, search, filtroEstadoCuota, filtroModalidad, filtroSocio]);

  const hayFiltros = !!(search || filtroEstadoCuota || filtroModalidad || filtroSocio);

  function limpiarFiltros() {
    setSearch(''); setFiltroEstadoCuota(''); setFiltroModalidad(''); setFiltroSocio('');
  }

  function toggleExpand(id: string) {
    const next = new Set(expandido);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandido(next);
  }

  async function handleDelete(caso: CasoPago) {
    if (!confirm(`¿Eliminar el caso de "${caso.cliente_nombre}"? Se eliminan también sus cuotas e historial. Los ingresos vinculados quedan en finanzas.`)) return;
    const { error } = await supabase.from('casos_pagos').delete().eq('id', caso.id);
    if (error) showToast(error.message, 'error');
    else { showToast('Caso eliminado'); load(); }
  }

  const [borrandoTodo, setBorrandoTodo] = useState(false);
  async function handleDeleteAll() {
    if (casos.length === 0) { showToast('No hay registros para borrar', 'info'); return; }
    const ok1 = window.confirm(`¿Eliminar TODOS los ${casos.length} casos?\n\nTambién se eliminan cuotas e historial. Acción irreversible.`);
    if (!ok1) return;
    const c = window.prompt('Para confirmar, escribí BORRAR TODO');
    if (c !== 'BORRAR TODO') { showToast('Cancelado', 'error'); return; }
    setBorrandoTodo(true);
    try {
      let ok = 0; const errores: string[] = [];
      for (const caso of casos) {
        const { error } = await supabase.from('casos_pagos').delete().eq('id', caso.id);
        if (error) errores.push(error.message);
        else ok++;
      }
      showToast(errores.length === 0 ? `${ok} casos eliminados` : `${ok} eliminados, ${errores.length} con error: ${errores[0]}`, errores.length === 0 ? 'success' : 'error');
      await load();
    } finally { setBorrandoTodo(false); }
  }

  if (!canAccess) {
    return (
      <div className="glass-card p-8 text-center">
        <h2 className="text-lg font-semibold text-white mb-2">Acceso restringido</h2>
        <p className="text-sm text-gray-400">El módulo "Casos - Pagos" es exclusivo para socios y administradores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Casos - Pagos</h1>
          <p className="text-sm text-gray-500 mt-1">Plan de pagos, seguimiento de cuotas y proyección de cobros.</p>
        </div>
        <div className="flex items-center gap-2">
          {casos.length > 0 && (
            <button
              onClick={handleDeleteAll}
              disabled={borrandoTodo}
              className="px-3 py-2 rounded-xl text-sm bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-2 disabled:opacity-40"
              title="Borrar todos los casos"
            >
              <Trash className="w-4 h-4" />
              {borrandoTodo ? 'Borrando…' : 'Borrar todos'}
            </button>
          )}
          <button onClick={() => { setEditing(null); setModalOpen(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nuevo caso
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="Total en Mora"
          value={formatMoney(kpis.totalMora)}
          tone="red"
          highlight
        />
        <KpiCard
          icon={<CircleDollarSign className="w-5 h-5" />}
          label="Total a Cobrar"
          value={formatMoney(kpis.totalACobrar)}
          tone="blue"
        />
        <KpiCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Cobrado este mes"
          value={formatMoney(kpis.cobradoMesActual)}
          tone="emerald"
        />
        <KpiCard
          icon={<CalendarDays className="w-5 h-5" />}
          label="Casos activos"
          value={String(kpis.totalCasos)}
          tone="violet"
        />
      </div>

      {/* Proyección mensual */}
      {kpis.proyeccionOrdenada.length > 0 && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Proyección de cobros por mes
            </h3>
            <span className="text-[10px] uppercase tracking-wider text-gray-500">Próximos {kpis.proyeccionOrdenada.length} meses</span>
          </div>
          <ProyeccionGrafico data={kpis.proyeccionOrdenada} />
        </div>
      )}

      {/* Filtros */}
      <div className="glass-card p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-500 shrink-0" />
          <input
            type="text"
            placeholder="Buscar por cliente, teléfono o socio…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
          />
          {hayFiltros && (
            <button
              onClick={limpiarFiltros}
              className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300 hover:bg-white/10 flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Limpiar
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <FiltroSelect
            label="Estado de cuota"
            value={filtroEstadoCuota}
            onChange={v => setFiltroEstadoCuota(v as any)}
            options={[
              { value: 'a_cobrar', label: '🔵 A Cobrar' },
              { value: 'proxima', label: '🟡 Próxima a vencer' },
              { value: 'vencida', label: '🔴 Vencida' },
              { value: 'pagada', label: '⚪ Pagada' },
            ]}
            icon={<Filter className="w-3 h-3" />}
          />
          <FiltroSelect
            label="Medio de pago"
            value={filtroModalidad}
            onChange={v => setFiltroModalidad(v as any)}
            options={MODALIDADES.map(m => ({ value: m, label: m }))}
            icon={<Wallet className="w-3 h-3" />}
          />
          <FiltroSelect
            label="Socio"
            value={filtroSocio}
            onChange={setFiltroSocio}
            options={socios.map(s => ({ value: s, label: s }))}
          />
        </div>
      </div>

      {/* Tabla de casos */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Cargando…</div>
        ) : casosFiltrados.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-gray-500 text-sm">{casos.length === 0 ? 'Todavía no hay casos cargados.' : 'Ningún caso coincide con los filtros.'}</div>
            {casos.length === 0 && (
              <button onClick={() => { setEditing(null); setModalOpen(true); }} className="btn-primary mt-4 inline-flex items-center gap-2">
                <Plus className="w-4 h-4" /> Cargar el primero
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {casosFiltrados.map(caso => (
              <FilaCaso
                key={caso.id}
                caso={caso}
                cuotas={cuotasPorCaso.get(caso.id) || []}
                moraNotas={moraNotas.filter(m => m.caso_pago_id === caso.id)}
                socios={socios}
                expandido={expandido.has(caso.id)}
                onToggle={() => toggleExpand(caso.id)}
                onEdit={() => { setEditing(caso); setModalOpen(true); }}
                onDelete={() => handleDelete(caso)}
                onReload={load}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal alta/edición */}
      {modalOpen && (
        <ModalCasoPago
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          editing={editing}
          socios={socios}
          cuotasIniciales={editing ? (cuotasPorCaso.get(editing.id) || []) : []}
          onSaved={() => { setModalOpen(false); load(); }}
        />
      )}
    </div>
  );
}

// ============================================================================
// KPI Card
// ============================================================================
function KpiCard({ icon, label, value, tone, highlight }: {
  icon: React.ReactNode; label: string; value: string;
  tone: 'red' | 'blue' | 'emerald' | 'violet'; highlight?: boolean;
}) {
  const styles: Record<string, { bg: string; border: string; text: string; icon: string; ring: string }> = {
    red:     { bg: 'bg-red-500/10',     border: 'border-red-500/30',     text: 'text-red-200',     icon: 'text-red-400',     ring: 'ring-red-500/30' },
    blue:    { bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    text: 'text-blue-100',    icon: 'text-blue-400',    ring: 'ring-blue-500/30' },
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-100', icon: 'text-emerald-400', ring: 'ring-emerald-500/30' },
    violet:  { bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  text: 'text-violet-100',  icon: 'text-violet-400',  ring: 'ring-violet-500/30' },
  };
  const s = styles[tone];
  return (
    <div className={`rounded-xl border ${s.bg} ${s.border} ${highlight ? `ring-1 ${s.ring}` : ''} p-4 transition hover:-translate-y-0.5 hover:shadow-lg`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] uppercase tracking-wider ${s.icon}`}>{label}</span>
        <span className={s.icon}>{icon}</span>
      </div>
      <div className={`text-xl sm:text-2xl font-bold ${s.text}`}>{value}</div>
    </div>
  );
}

// ============================================================================
// Proyección — mini gráfico de barras
// ============================================================================
function ProyeccionGrafico({ data }: { data: Array<[string, number]> }) {
  const max = Math.max(...data.map(([, v]) => v), 1);
  return (
    <div className="space-y-2">
      {data.map(([mes, monto]) => {
        const pct = (monto / max) * 100;
        const isCurrentMonth = mes === hoyISO().slice(0, 7);
        return (
          <div key={mes} className="grid grid-cols-[110px_1fr_120px] items-center gap-3 text-xs">
            <span className={`text-gray-400 ${isCurrentMonth ? 'text-white font-semibold' : ''}`}>{monthLabel(mes)}</span>
            <div className="h-5 rounded-md bg-white/[0.03] overflow-hidden relative">
              <div
                className={`h-full rounded-md ${isCurrentMonth ? 'bg-emerald-500/50' : 'bg-blue-500/40'} transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-right font-mono text-white">{formatMoney(monto)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Filtro select
// ============================================================================
function FiltroSelect({ label, value, onChange, options, icon }: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>; icon?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1">{icon}{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="select-dark text-xs py-1.5">
        <option value="">Todos</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

// ============================================================================
// Fila de caso (con expandible)
// ============================================================================
function FilaCaso({ caso, cuotas, moraNotas, socios, expandido, onToggle, onEdit, onDelete, onReload }: {
  caso: CasoPago;
  cuotas: Cuota[];
  moraNotas: MoraNota[];
  socios: string[];
  expandido: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReload: () => void;
}) {
  const total = Number(caso.honorarios) || 0;
  const pagoInicial = caso.pago_inicial_pagado ? Number(caso.pago_inicial) : 0;
  const cobradoCuotas = cuotas.filter(c => c.estado === 'Pagada').reduce((s, c) => s + Number(c.monto), 0);
  const cobrado = pagoInicial + cobradoCuotas;
  const pendiente = Math.max(0, total - cobrado);

  // Contadores por estado
  const conteoEstados = cuotas.reduce((acc, c) => {
    const e = calcularEstadoCuota(c);
    acc[e] = (acc[e] || 0) + 1;
    return acc;
  }, {} as Record<EstadoCuota, number>);

  return (
    <div className={`${expandido ? 'bg-white/[0.02]' : 'hover:bg-white/[0.02]'} transition-colors`}>
      <div className="px-4 py-3 flex items-center gap-3">
        <button onClick={onToggle} className="text-gray-500 hover:text-white shrink-0">
          {expandido ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-medium truncate">{caso.cliente_nombre}</span>
            {caso.telefono && <span className="text-xs text-gray-500">· {caso.telefono}</span>}
            {caso.estado_caso && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/20">
                {caso.estado_caso}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
            <span>Socio: <strong className="text-gray-300">{caso.socio_carga}</strong></span>
            <span>{cuotas.length} cuota{cuotas.length === 1 ? '' : 's'}</span>
            {conteoEstados.vencida > 0 && <span className="text-red-400 font-semibold">{conteoEstados.vencida} vencida(s)</span>}
            {conteoEstados.proxima > 0 && <span className="text-amber-400 font-semibold">{conteoEstados.proxima} próxima(s)</span>}
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-end shrink-0 w-32">
          <span className="text-xs text-gray-500">Total</span>
          <span className="text-white font-semibold">{formatMoney(total)}</span>
        </div>
        <div className="hidden md:flex flex-col items-end shrink-0 w-32">
          <span className="text-xs text-gray-500">Cobrado</span>
          <span className="text-emerald-300 font-semibold">{formatMoney(cobrado)}</span>
        </div>
        <div className="hidden md:flex flex-col items-end shrink-0 w-32">
          <span className="text-xs text-gray-500">Pendiente</span>
          <span className={`${pendiente > 0 ? 'text-amber-300' : 'text-gray-500'} font-semibold`}>{formatMoney(pendiente)}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-white" title="Editar">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400" title="Eliminar">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expandido && (
        <div className="px-4 pb-4 pt-1 border-t border-white/[0.04]">
          <DetalleCaso
            caso={caso}
            cuotas={cuotas}
            moraNotas={moraNotas}
            socios={socios}
            onReload={onReload}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Detalle del caso expandido — cuotas + acciones + mora
// ============================================================================
function DetalleCaso({ caso, cuotas, moraNotas, socios, onReload }: {
  caso: CasoPago;
  cuotas: Cuota[];
  moraNotas: MoraNota[];
  socios: string[];
  onReload: () => void;
}) {
  const { showToast } = useToast();
  const { perfil } = useAuth();
  const [pagandoId, setPagandoId] = useState<string | null>(null);
  const [moraEditId, setMoraEditId] = useState<string | null>(null);
  const [historialAbierto, setHistorialAbierto] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ fecha_pago: hoyISO(), modalidad_pago: '', cobrado_por: socios[0] || '' });
  const [moraTxt, setMoraTxt] = useState('');

  async function marcarPagada(cuota: Cuota) {
    if (!payForm.modalidad_pago || !payForm.cobrado_por) {
      showToast('Indicá modalidad y quién cobró', 'error');
      return;
    }
    const { error } = await supabase.from('casos_pagos_cuotas')
      .update({
        estado: 'Pagada',
        fecha_pago: payForm.fecha_pago,
        modalidad_pago: payForm.modalidad_pago,
        cobrado_por: payForm.cobrado_por,
      })
      .eq('id', cuota.id);
    if (error) { showToast(error.message, 'error'); return; }
    setPagandoId(null);
    showToast(`Cuota #${cuota.numero} marcada como pagada`);
    onReload();
  }

  async function desmarcar(cuota: Cuota) {
    if (!confirm(`Desmarcar la cuota #${cuota.numero}? El ingreso vinculado, si existe, también se borra.`)) return;
    const { error } = await supabase.from('casos_pagos_cuotas')
      .update({ estado: 'Pendiente', fecha_pago: null, modalidad_pago: null, cobrado_por: null })
      .eq('id', cuota.id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Cuota desmarcada');
    onReload();
  }

  async function guardarMora(cuota: Cuota) {
    if (!moraTxt.trim()) { showToast('Escribí el motivo del atraso', 'error'); return; }
    // Guardar en cuota (motivo rápido) + historial (nota acumulable)
    const { error: e1 } = await supabase.from('casos_pagos_cuotas')
      .update({ motivo_atraso: moraTxt.trim() })
      .eq('id', cuota.id);
    if (e1) { showToast(e1.message, 'error'); return; }

    const { error: e2 } = await supabase.from('casos_pagos_cuotas_mora_historial').insert({
      cuota_id: cuota.id,
      caso_pago_id: caso.id,
      motivo: moraTxt.trim(),
      autor_id: perfil?.id || null,
      autor_nombre: perfil?.nombre || null,
    });
    if (e2) showToast('Guardado en cuota, falló historial: ' + e2.message, 'error');
    else showToast('Motivo de atraso registrado');
    setMoraEditId(null);
    setMoraTxt('');
    onReload();
  }

  // Pago inicial info
  const tienePagoInicial = (Number(caso.pago_inicial) || 0) > 0;

  return (
    <div className="space-y-4">
      {/* Pago inicial */}
      {tienePagoInicial && (
        <div className={`rounded-xl border p-3 ${caso.pago_inicial_pagado ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {caso.pago_inicial_pagado
                ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                : <Clock className="w-4 h-4 text-amber-400" />}
              <span className="text-sm text-white font-medium">Pago inicial</span>
              <span className="text-xs text-gray-400">
                {caso.pago_inicial_pagado ? 'Cobrado' : 'Pendiente'}
                {caso.pago_inicial_modalidad ? ` · ${caso.pago_inicial_modalidad}` : ''}
                {caso.pago_inicial_fecha ? ` · ${caso.pago_inicial_fecha}` : ''}
              </span>
            </div>
            <span className="text-white font-semibold">{formatMoney(Number(caso.pago_inicial))}</span>
          </div>
        </div>
      )}

      {/* Cuotas */}
      {cuotas.length === 0 ? (
        <div className="text-center text-gray-500 text-sm py-6 rounded-lg border border-dashed border-white/10">
          Este caso todavía no tiene cuotas. Editalo para agregar un plan de pagos.
        </div>
      ) : (
        <div className="space-y-2">
          {cuotas.map(cuota => {
            const estado = calcularEstadoCuota(cuota);
            const vis = ESTADO_VISUAL[estado];
            const hist = moraNotas.filter(m => m.cuota_id === cuota.id);
            return (
              <div key={cuota.id} className={`rounded-xl border ${estado === 'vencida' ? 'border-red-500/30 bg-red-500/[0.04]' : estado === 'proxima' ? 'border-amber-500/30 bg-amber-500/[0.03]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                <div className="px-3 py-2.5 flex items-center gap-3 flex-wrap">
                  <span className={`w-2 h-2 rounded-full ${vis.dot} shrink-0`} />
                  <span className="text-gray-500 w-8 text-xs font-mono">#{cuota.numero}</span>
                  <div className="flex-1 min-w-[120px]">
                    <div className="text-sm text-white">{cuota.fecha_vencimiento}</div>
                    {cuota.fecha_pago && (
                      <div className="text-[10px] text-gray-500">Pagada {cuota.fecha_pago} · {cuota.modalidad_pago} · {cuota.cobrado_por}</div>
                    )}
                  </div>
                  <span className="text-white font-semibold whitespace-nowrap">{formatMoney(Number(cuota.monto))}</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${vis.chip}`}>
                    {vis.label}
                  </span>

                  {estado !== 'pagada' ? (
                    <button
                      onClick={() => { setPagandoId(pagandoId === cuota.id ? null : cuota.id); setPayForm({ fecha_pago: hoyISO(), modalidad_pago: '', cobrado_por: socios[0] || caso.socio_carga }); }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30"
                    >
                      Cobrar
                    </button>
                  ) : (
                    <button onClick={() => desmarcar(cuota)} className="px-2.5 py-1 rounded-lg text-xs bg-white/5 text-gray-400 hover:bg-red-500/15 hover:text-red-300 border border-white/10">
                      Desmarcar
                    </button>
                  )}

                  {estado === 'vencida' && (
                    <button
                      onClick={() => { setMoraEditId(moraEditId === cuota.id ? null : cuota.id); setMoraTxt(cuota.motivo_atraso || ''); }}
                      className="px-2.5 py-1 rounded-lg text-xs bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/30 flex items-center gap-1"
                      title="Registrar motivo de atraso"
                    >
                      <MessageSquare className="w-3 h-3" /> Motivo
                    </button>
                  )}

                  {hist.length > 0 && (
                    <button
                      onClick={() => setHistorialAbierto(historialAbierto === cuota.id ? null : cuota.id)}
                      className="px-2 py-1 rounded-lg text-[10px] bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/10 flex items-center gap-1"
                      title="Ver historial de mora"
                    >
                      <History className="w-3 h-3" /> {hist.length}
                    </button>
                  )}
                </div>

                {/* Motivo de atraso actual */}
                {estado === 'vencida' && cuota.motivo_atraso && moraEditId !== cuota.id && (
                  <div className="px-3 pb-2 -mt-1 text-[11px] text-red-300/80 italic">
                    "{cuota.motivo_atraso}"
                  </div>
                )}

                {/* Form cobrar */}
                {pagandoId === cuota.id && (
                  <div className="border-t border-white/[0.06] p-3 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                    <FieldMini label="Fecha de pago">
                      <input type="date" value={payForm.fecha_pago} onChange={e => setPayForm(p => ({ ...p, fecha_pago: e.target.value }))} className="input-dark text-xs py-1.5" />
                    </FieldMini>
                    <FieldMini label="Modalidad *">
                      <select value={payForm.modalidad_pago} onChange={e => setPayForm(p => ({ ...p, modalidad_pago: e.target.value }))} className="select-dark text-xs py-1.5">
                        <option value="">—</option>
                        {MODALIDADES.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </FieldMini>
                    <FieldMini label="Cobrado por *">
                      <select value={payForm.cobrado_por} onChange={e => setPayForm(p => ({ ...p, cobrado_por: e.target.value }))} className="select-dark text-xs py-1.5">
                        <option value="">—</option>
                        {socios.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </FieldMini>
                    <button onClick={() => marcarPagada(cuota)} className="btn-primary text-xs py-1.5">Confirmar cobro</button>
                  </div>
                )}

                {/* Form mora */}
                {moraEditId === cuota.id && (
                  <div className="border-t border-white/[0.06] p-3 space-y-2">
                    <label className="block text-[10px] uppercase tracking-wider text-red-300">Motivo de atraso *</label>
                    <textarea
                      value={moraTxt}
                      onChange={e => setMoraTxt(e.target.value)}
                      rows={2}
                      className="input-dark w-full text-xs"
                      placeholder="Ej: el cliente pidió prórroga hasta el viernes"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setMoraEditId(null); setMoraTxt(''); }} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white">Cancelar</button>
                      <button onClick={() => guardarMora(cuota)} className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-200 hover:bg-red-500/30 border border-red-500/30">
                        Guardar y registrar
                      </button>
                    </div>
                  </div>
                )}

                {/* Historial mora */}
                {historialAbierto === cuota.id && hist.length > 0 && (
                  <div className="border-t border-white/[0.06] p-3 space-y-1.5">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                      <History className="w-3 h-3" /> Historial de gestión de mora
                    </div>
                    {hist.map(h => (
                      <div key={h.id} className="text-xs text-gray-300 bg-white/[0.02] rounded-lg px-2.5 py-1.5 border border-white/[0.04]">
                        <div className="text-[10px] text-gray-500 mb-0.5">
                          {new Date(h.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                          {h.autor_nombre ? ` · ${h.autor_nombre}` : ''}
                        </div>
                        {h.motivo}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {caso.observaciones && (
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3 text-xs text-gray-400">
          <span className="text-gray-500 uppercase tracking-wider text-[10px] block mb-1">Observaciones</span>
          {caso.observaciones}
        </div>
      )}
    </div>
  );
}

function FieldMini({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

// ============================================================================
// Modal alta / edición de caso
// ============================================================================
interface PlanCuota {
  id: string;             // local id (también el id de DB si existe)
  dbId?: string;          // si existe en DB
  numero: number;
  fecha_vencimiento: string;
  monto: string;
  estado: 'Pendiente' | 'Pagada';
}

function ModalCasoPago({ open, onClose, editing, socios, cuotasIniciales, onSaved }: {
  open: boolean;
  onClose: () => void;
  editing: CasoPago | null;
  socios: string[];
  cuotasIniciales: Cuota[];
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const isEditing = !!editing;

  const [form, setForm] = useState({
    cliente_nombre: '',
    telefono: '',
    estado_caso: '',
    socio_carga: socios[0] || 'Rodrigo',
    honorarios: '',
    observaciones: '',
    pago_inicial: '',
    pago_inicial_modalidad: '' as '' | 'Efectivo' | 'Transferencia',
    pago_inicial_fecha: hoyISO(),
    pago_inicial_pagado: false,
  });

  // Plan de cuotas (lista editable)
  const [planCuotas, setPlanCuotas] = useState<PlanCuota[]>([]);

  // Generador
  const [gen, setGen] = useState({ cantidad: '3', primeraFecha: addMonths(hoyISO(), 1) });

  const [saving, setSaving] = useState(false);

  // Init
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        cliente_nombre: editing.cliente_nombre,
        telefono: editing.telefono || '',
        estado_caso: editing.estado_caso || '',
        socio_carga: editing.socio_carga,
        honorarios: String(editing.honorarios || ''),
        observaciones: editing.observaciones || '',
        pago_inicial: editing.pago_inicial ? String(editing.pago_inicial) : '',
        pago_inicial_modalidad: editing.pago_inicial_modalidad || '',
        pago_inicial_fecha: editing.pago_inicial_fecha || hoyISO(),
        pago_inicial_pagado: editing.pago_inicial_pagado || false,
      });
      setPlanCuotas(cuotasIniciales.map(c => ({
        id: c.id, dbId: c.id, numero: c.numero,
        fecha_vencimiento: c.fecha_vencimiento,
        monto: String(c.monto),
        estado: c.estado,
      })));
    } else {
      setForm({
        cliente_nombre: '', telefono: '', estado_caso: '',
        socio_carga: socios[0] || 'Rodrigo',
        honorarios: '', observaciones: '',
        pago_inicial: '', pago_inicial_modalidad: '', pago_inicial_fecha: hoyISO(),
        pago_inicial_pagado: false,
      });
      setPlanCuotas([]);
    }
  }, [open, editing, cuotasIniciales, socios]);

  // Cálculos derivados
  const total = parseFloat(form.honorarios) || 0;
  const pagoInicialNum = parseFloat(form.pago_inicial) || 0;
  const saldo = Math.max(0, total - pagoInicialNum);
  const totalPlan = planCuotas.reduce((s, c) => s + (parseFloat(c.monto) || 0), 0);
  const diferenciaPlan = totalPlan - saldo;

  function generarPlan() {
    const cant = parseInt(gen.cantidad) || 0;
    if (cant <= 0) { showToast('Indicá cuántas cuotas generar', 'error'); return; }
    if (saldo <= 0) { showToast('No hay saldo a financiar (monto total - pago inicial)', 'error'); return; }
    if (!gen.primeraFecha) { showToast('Indicá la fecha de la primera cuota', 'error'); return; }
    const montoCuota = Math.round((saldo / cant) * 100) / 100;
    const cuotas: PlanCuota[] = [];
    // Mantener cuotas pagadas (no se reescriben)
    const pagadas = planCuotas.filter(c => c.estado === 'Pagada');
    let nextNum = pagadas.length + 1;
    for (let i = 0; i < cant; i++) {
      cuotas.push({
        id: crypto.randomUUID(),
        numero: nextNum++,
        fecha_vencimiento: addMonths(gen.primeraFecha, i),
        monto: String(montoCuota),
        estado: 'Pendiente',
      });
    }
    // Ajustar la última para compensar redondeo
    const sumGen = cuotas.reduce((s, c) => s + parseFloat(c.monto), 0);
    const diff = saldo - sumGen;
    if (Math.abs(diff) > 0.001 && cuotas.length > 0) {
      const last = cuotas[cuotas.length - 1];
      last.monto = String(Math.round((parseFloat(last.monto) + diff) * 100) / 100);
    }
    setPlanCuotas([...pagadas, ...cuotas]);
  }

  function updateCuota(idx: number, patch: Partial<PlanCuota>) {
    setPlanCuotas(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  }

  function removeCuota(idx: number) {
    setPlanCuotas(prev => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, numero: i + 1 })));
  }

  function addCuotaManual() {
    const next = planCuotas.length + 1;
    setPlanCuotas(prev => [...prev, {
      id: crypto.randomUUID(), numero: next,
      fecha_vencimiento: addMonths(hoyISO(), next),
      monto: '0', estado: 'Pendiente',
    }]);
  }

  async function handleSave() {
    if (!form.cliente_nombre.trim()) { showToast('El nombre del cliente es obligatorio', 'error'); return; }
    if (total <= 0) { showToast('El monto total debe ser mayor a 0', 'error'); return; }
    if (form.pago_inicial_pagado && (!form.pago_inicial_modalidad || !form.pago_inicial_fecha)) {
      showToast('Completá modalidad y fecha del pago inicial', 'error'); return;
    }
    if (pagoInicialNum > total) { showToast('El pago inicial no puede ser mayor al monto total', 'error'); return; }

    setSaving(true);
    try {
      const payload: any = {
        cliente_nombre: form.cliente_nombre.trim(),
        telefono: form.telefono.trim() || null,
        estado_caso: form.estado_caso || null,
        socio_carga: form.socio_carga,
        honorarios: total,
        observaciones: form.observaciones.trim() || null,
        pago_inicial: pagoInicialNum,
        pago_inicial_modalidad: form.pago_inicial_modalidad || null,
        pago_inicial_fecha: form.pago_inicial_fecha || null,
        pago_inicial_pagado: form.pago_inicial_pagado,
        modalidad_pago: planCuotas.length > 0 ? 'En cuotas' : 'Único',
      };

      let casoId: string;
      if (isEditing) {
        const { error } = await supabase.from('casos_pagos').update(payload).eq('id', editing!.id);
        if (error) throw error;
        casoId = editing!.id;
      } else {
        const { data, error } = await supabase.from('casos_pagos').insert(payload).select('id').single();
        if (error) throw error;
        casoId = data!.id;
      }

      // Sincronizar cuotas: estrategia simple → borrar todas las no pagadas y reinsertar el plan.
      // Las pagadas las dejamos intactas (no se tocan).
      if (isEditing) {
        const existentes = cuotasIniciales;
        const pagadasIds = existentes.filter(c => c.estado === 'Pagada').map(c => c.id);
        const idsPlanConDb = new Set(planCuotas.filter(c => c.dbId).map(c => c.dbId!));
        const aBorrar = existentes
          .filter(c => c.estado !== 'Pagada' && !idsPlanConDb.has(c.id))
          .map(c => c.id);
        if (aBorrar.length > 0) {
          await supabase.from('casos_pagos_cuotas').delete().in('id', aBorrar);
        }
        // Update existentes (las que se mantienen)
        for (const c of planCuotas) {
          if (c.dbId && !pagadasIds.includes(c.dbId)) {
            await supabase.from('casos_pagos_cuotas').update({
              numero: c.numero,
              fecha_vencimiento: c.fecha_vencimiento,
              monto: parseFloat(c.monto) || 0,
            }).eq('id', c.dbId);
          }
        }
        // Insert nuevas
        const nuevas = planCuotas.filter(c => !c.dbId);
        if (nuevas.length > 0) {
          const rows = nuevas.map(c => ({
            caso_pago_id: casoId,
            numero: c.numero,
            fecha_vencimiento: c.fecha_vencimiento,
            monto: parseFloat(c.monto) || 0,
          }));
          const { error } = await supabase.from('casos_pagos_cuotas').insert(rows);
          if (error) throw error;
        }
      } else if (planCuotas.length > 0) {
        const rows = planCuotas.map(c => ({
          caso_pago_id: casoId,
          numero: c.numero,
          fecha_vencimiento: c.fecha_vencimiento,
          monto: parseFloat(c.monto) || 0,
        }));
        const { error } = await supabase.from('casos_pagos_cuotas').insert(rows);
        if (error) throw error;
      }

      showToast(isEditing ? 'Caso actualizado' : 'Caso creado con su plan de pagos');
      onSaved();
    } catch (err: any) {
      showToast(err?.message || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar caso' : 'Nuevo caso con plan de pagos'}
      subtitle="Cliente · Monto total · Pago inicial · Cuotas mensuales"
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-2">
        {/* Cliente */}
        <Section title="Cliente">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nombre y apellido *">
              <input type="text" value={form.cliente_nombre}
                onChange={e => setForm({ ...form, cliente_nombre: e.target.value })}
                className="input-dark" placeholder="Ej: Juan Pérez" />
            </Field>
            <Field label="Teléfono">
              <input type="tel" value={form.telefono}
                onChange={e => setForm({ ...form, telefono: e.target.value })}
                className="input-dark" placeholder="Ej: 3885 123456" />
            </Field>
            <Field label="Estado del caso">
              <select value={form.estado_caso}
                onChange={e => setForm({ ...form, estado_caso: e.target.value })}
                className="select-dark">
                <option value="">—</option>
                {ESTADOS_CASO.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </Field>
            <Field label="Socio que carga *">
              <select value={form.socio_carga}
                onChange={e => setForm({ ...form, socio_carga: e.target.value })}
                className="select-dark">
                {socios.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
        </Section>

        {/* Plan de pagos */}
        <Section title="Plan de pagos">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Monto total acordado *">
              <input type="number" step="0.01" placeholder="0"
                value={form.honorarios}
                onChange={e => setForm({ ...form, honorarios: e.target.value })}
                className="input-dark" />
            </Field>
            <Field label="Pago inicial">
              <input type="number" step="0.01" placeholder="0"
                value={form.pago_inicial}
                onChange={e => setForm({ ...form, pago_inicial: e.target.value })}
                className="input-dark" />
            </Field>
            <Field label="Saldo a financiar">
              <div className="input-dark bg-white/[0.04] text-emerald-300 font-semibold">{formatMoney(saldo)}</div>
            </Field>
          </div>

          {/* Datos del pago inicial */}
          {pagoInicialNum > 0 && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <Field label="Modalidad pago inicial *">
                <select value={form.pago_inicial_modalidad}
                  onChange={e => setForm({ ...form, pago_inicial_modalidad: e.target.value as any })}
                  className="select-dark">
                  <option value="">—</option>
                  {MODALIDADES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Fecha pago inicial">
                <input type="date" value={form.pago_inicial_fecha}
                  onChange={e => setForm({ ...form, pago_inicial_fecha: e.target.value })}
                  className="input-dark" />
              </Field>
              <Field label="¿Ya está cobrado?">
                <label className="flex items-center gap-2 cursor-pointer mt-2.5 text-sm text-gray-300">
                  <input type="checkbox" checked={form.pago_inicial_pagado}
                    onChange={e => setForm({ ...form, pago_inicial_pagado: e.target.checked })}
                    className="checkbox-dark" />
                  Sí, ya entró
                </label>
              </Field>
            </div>
          )}
        </Section>

        {/* Generador de cuotas */}
        <Section title={`Cuotas mensuales${planCuotas.length > 0 ? ` (${planCuotas.length})` : ''}`}>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end p-3 rounded-xl bg-violet-500/5 border border-violet-500/20">
            <Field label="Cantidad de cuotas">
              <input type="number" min={1} value={gen.cantidad}
                onChange={e => setGen({ ...gen, cantidad: e.target.value })}
                className="input-dark" />
            </Field>
            <Field label="Fecha primera cuota">
              <input type="date" value={gen.primeraFecha}
                onChange={e => setGen({ ...gen, primeraFecha: e.target.value })}
                className="input-dark" />
            </Field>
            <button onClick={generarPlan} type="button" className="btn-primary whitespace-nowrap">
              Generar plan
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            Se generan {gen.cantidad || 0} cuotas mensuales sobre el saldo de {formatMoney(saldo)}. Después podés editar montos y fechas individualmente.
          </p>

          {/* Lista editable */}
          {planCuotas.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-[40px_1fr_1fr_auto_auto] gap-2 px-2 text-[10px] uppercase tracking-wider text-gray-500">
                <span>#</span>
                <span>Vencimiento</span>
                <span>Monto</span>
                <span>Estado</span>
                <span></span>
              </div>
              {planCuotas.map((c, i) => (
                <div key={c.id} className="grid grid-cols-[40px_1fr_1fr_auto_auto] gap-2 items-center">
                  <span className="text-xs text-gray-500 text-center">#{c.numero}</span>
                  <input type="date" value={c.fecha_vencimiento}
                    disabled={c.estado === 'Pagada'}
                    onChange={e => updateCuota(i, { fecha_vencimiento: e.target.value })}
                    className="input-dark text-xs py-1.5 disabled:opacity-60" />
                  <input type="number" step="0.01" value={c.monto}
                    disabled={c.estado === 'Pagada'}
                    onChange={e => updateCuota(i, { monto: e.target.value })}
                    className="input-dark text-xs py-1.5 disabled:opacity-60" />
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${c.estado === 'Pagada' ? 'bg-gray-500/10 text-gray-400 border-gray-500/30' : 'bg-amber-500/10 text-amber-300 border-amber-500/30'}`}>
                    {c.estado}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCuota(i)}
                    disabled={c.estado === 'Pagada'}
                    className="p-1 text-gray-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={c.estado === 'Pagada' ? 'No se puede borrar una cuota pagada' : 'Eliminar cuota'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs">
                <button type="button" onClick={addCuotaManual} className="text-violet-300 hover:text-violet-200 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Agregar cuota manual
                </button>
                <div className="text-gray-400">
                  Suma del plan: <span className="text-white font-semibold">{formatMoney(totalPlan)}</span>
                  {Math.abs(diferenciaPlan) > 0.01 && (
                    <span className={`ml-2 ${diferenciaPlan > 0 ? 'text-amber-300' : 'text-red-300'}`}>
                      ({diferenciaPlan > 0 ? '+' : ''}{formatMoney(diferenciaPlan)} vs saldo)
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* Observaciones */}
        <Section title="Observaciones">
          <textarea value={form.observaciones}
            onChange={e => setForm({ ...form, observaciones: e.target.value })}
            className="input-dark w-full" rows={2}
            placeholder="Notas adicionales sobre el caso…" />
        </Section>
      </div>

      <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/[0.06] mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancelar</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Guardando…' : (isEditing ? 'Actualizar caso' : 'Crear caso')}
        </button>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <h3 className="text-sm font-semibold text-white mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
