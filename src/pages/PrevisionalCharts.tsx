import { useMemo } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import {
  TrendingUp, Users, DollarSign, AlertTriangle,
  Calendar, BarChart3, PieChart as PieChartIcon
} from 'lucide-react';
import { usePrevisionalStats, useClientesPrevisional } from '../hooks/usePrevisional';
import { PIPELINE_LABELS, PipelinePrevisional } from '../types/previsional';

const PIPELINE_CHART_COLORS: Record<string, string> = {
  consulta: '#3b82f6',
  seguimiento: '#f59e0b',
  ingreso: '#a855f7',
  cobro: '#10b981',
  finalizado: '#6b7280',
  descartado: '#ef4444',
};

const SEMAFORO_CHART_COLORS = {
  verde: '#10b981',
  amarillo: '#f59e0b',
  rojo: '#ef4444',
  gris: '#4b5563',
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card p-3 border border-white/10 text-xs shadow-2xl">
      {label && <p className="text-gray-400 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }} className="font-medium">
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString('es-AR') : p.value}
        </p>
      ))}
    </div>
  );
};

export default function PrevisionalCharts() {
  const { stats, loading } = usePrevisionalStats();
  const { clientes } = useClientesPrevisional();

  // Pipeline data
  const pipelineData = useMemo(() => {
    return Object.entries(stats.porPipeline).map(([key, value]) => ({
      name: PIPELINE_LABELS[key as PipelinePrevisional] || key,
      value,
      fill: PIPELINE_CHART_COLORS[key] || '#6b7280',
    }));
  }, [stats.porPipeline]);

  // Semáforo data
  const semaforoData = useMemo(() => [
    { name: 'Al día (0-7d)', value: stats.porSemaforo.verde, fill: SEMAFORO_CHART_COLORS.verde },
    { name: 'Alerta (8-15d)', value: stats.porSemaforo.amarillo, fill: SEMAFORO_CHART_COLORS.amarillo },
    { name: 'Urgente (>15d)', value: stats.porSemaforo.rojo, fill: SEMAFORO_CHART_COLORS.rojo },
    { name: 'Sin contacto', value: stats.porSemaforo.gris, fill: SEMAFORO_CHART_COLORS.gris },
  ].filter(d => d.value > 0), [stats.porSemaforo]);

  // Captadores data
  const captadoresData = useMemo(() => {
    return Object.entries(stats.clientesPorCaptador)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [stats.clientesPorCaptador]);

  // Cobro distribution
  const cobroData = useMemo(() => {
    const cobrado = stats.cobradoTotal;
    const pendiente = stats.pendienteTotal;
    if (cobrado === 0 && pendiente === 0) return [];
    return [
      { name: 'Cobrado', value: cobrado, fill: '#10b981' },
      { name: 'Pendiente', value: pendiente, fill: '#f59e0b' },
    ];
  }, [stats.cobradoTotal, stats.pendienteTotal]);

  // Monthly trend from clientes created_at
  const trendData = useMemo(() => {
    const months: Record<string, { fichas: number; cobrado: number }> = {};
    clientes.forEach(c => {
      const d = new Date(c.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!months[key]) months[key] = { fichas: 0, cobrado: 0 };
      months[key].fichas++;
      months[key].cobrado += c.monto_cobrado || 0;
    });
    return Object.entries(months)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([key, val]) => ({
        mes: new Date(key + '-01').toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }),
        fichas: val.fichas,
        cobrado: val.cobrado,
      }));
  }, [clientes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          Dashboard Previsional
        </h1>
        <p className="text-sm text-gray-500 mt-1 ml-[52px]">Métricas y análisis del módulo</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-blue-400" />
            <p className="text-[10px] text-gray-500 uppercase">Total Clientes</p>
          </div>
          <p className="text-2xl font-bold text-white">{stats.totalClientes}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <p className="text-[10px] text-gray-500 uppercase">Cobrado</p>
          </div>
          <p className="text-2xl font-bold text-emerald-400">${(stats.cobradoTotal / 1000).toFixed(0)}k</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <p className="text-[10px] text-gray-500 uppercase">Tareas Activas</p>
          </div>
          <p className="text-2xl font-bold text-white">{stats.tareasActivas}</p>
          {stats.tareasVencidas > 0 && (
            <p className="text-[10px] text-red-400 mt-0.5">{stats.tareasVencidas} vencidas</p>
          )}
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-purple-400" />
            <p className="text-[10px] text-gray-500 uppercase">Audiencias (7d)</p>
          </div>
          <p className="text-2xl font-bold text-white">{stats.audienciasProximas}</p>
        </div>
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline distribution - Donut */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-purple-400" /> Pipeline
          </h3>
          {pipelineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pipelineData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {pipelineData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  formatter={(value) => <span className="text-xs text-gray-400">{value}</span>}
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-gray-600 text-xs">Sin datos</div>
          )}
        </div>

        {/* Semáforo - Bar */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" /> Semáforo de Contacto
          </h3>
          {semaforoData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={semaforoData} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {semaforoData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-gray-600 text-xs">Sin datos</div>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Captadores - Horizontal bar */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400" /> Clientes por Captador
          </h3>
          {captadoresData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={captadoresData} layout="vertical" barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} width={120} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 6, 6, 0]} name="Clientes" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-gray-600 text-xs">Sin datos</div>
          )}
        </div>

        {/* Cobro distribution - Donut */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" /> Cobros
          </h3>
          {cobroData.length > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={cobroData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                    stroke="none"
                  >
                    {cobroData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    formatter={(value) => <span className="text-xs text-gray-400">{value}</span>}
                    iconSize={8}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="text-center p-2 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                  <p className="text-base font-bold text-emerald-400">${stats.cobradoTotal.toLocaleString('es-AR')}</p>
                  <p className="text-[10px] text-gray-500">Cobrado</p>
                </div>
                <div className="text-center p-2 rounded-xl bg-amber-500/5 border border-amber-500/10">
                  <p className="text-base font-bold text-amber-400">${stats.pendienteTotal.toLocaleString('es-AR')}</p>
                  <p className="text-[10px] text-gray-500">Pendiente</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-gray-600 text-xs">Sin datos</div>
          )}
        </div>
      </div>

      {/* Trend line */}
      {trendData.length > 1 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-violet-400" /> Tendencia Mensual
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis dataKey="mes" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend formatter={(value) => <span className="text-xs text-gray-400">{value}</span>} iconSize={8} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="fichas"
                stroke="#a855f7"
                strokeWidth={2}
                dot={{ fill: '#a855f7', r: 4 }}
                name="Fichas creadas"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cobrado"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: '#10b981', r: 4 }}
                name="Cobrado ($)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
