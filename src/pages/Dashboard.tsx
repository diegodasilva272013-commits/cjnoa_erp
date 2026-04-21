import { useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  Users,
  Star,
  UserPlus,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  FileText,
  CalendarDays,
} from 'lucide-react';
import { useDashboardStats, useIngresos } from '../hooks/useFinances';
import { useSocios } from '../hooks/useSocios';
import { usePrevisionalStats } from '../hooks/usePrevisional';
import ActivityFeed from '../components/ActivityFeed';
import SmartAlerts from '../components/SmartAlerts';
import { formatMoney } from '../lib/financeFormat';

export default function Dashboard() {
  const { stats, loading } = useDashboardStats();
  const { ingresos } = useIngresos();
  const socios = useSocios();
  const { stats: prevStats, loading: prevLoading } = usePrevisionalStats();

  const materiaColors: Record<string, string> = {
    'Jubilaciones': 'from-blue-500 to-blue-600',
    'Sucesorios': 'from-purple-500 to-purple-600',
    'Reajuste': 'from-emerald-500 to-emerald-600',
    'Otro': 'from-gray-500 to-gray-600',
  };

  const materias = useMemo(() => Object.entries(stats.casosPorMateria), [stats.casosPorMateria]);

  const cobranzaPorSocio = useMemo(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    return socios.map(socio => {
      const socioIngresos = ingresos.filter(ingreso => (
        ingreso.socio_cobro === socio &&
        ingreso.fecha >= firstDay &&
        ingreso.fecha <= lastDay
      ));

      return {
        socio,
        neto: socioIngresos.reduce((sum, ingreso) => sum + Number(ingreso.monto_cj_noa || 0), 0),
        registros: socioIngresos.length,
      };
    });
  }, [ingresos, socios]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">Panel de Control</h1>
        <p className="text-gray-500 text-sm mt-1">Resumen general del estudio</p>
      </div>

      {/* Main stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Por Cobrar */}
        <div className="stat-card group hover-lift animate-slide-up" style={{ animationDelay: '0ms' }}>
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-white/40 to-white/10" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Por Cobrar Neto Est.</p>
              <p className="text-2xl font-bold text-white mt-2 count-up">{formatMoney(stats.porCobrar)}</p>
            </div>
            <div className="p-2.5 bg-white/[0.06] rounded-xl">
              <DollarSign className="w-5 h-5 text-white/70" />
            </div>
          </div>
        </div>

        {/* Cobrado este mes */}
        <div className="stat-card hover-lift animate-slide-up" style={{ animationDelay: '100ms' }}>
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 to-emerald-600" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Cobrado Neto (mes)</p>
              <p className="text-2xl font-bold text-white mt-2 count-up">{formatMoney(stats.cobradoMes)}</p>
            </div>
            <div className="p-2.5 bg-emerald-500/10 rounded-xl">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            </div>
          </div>
        </div>

        {/* Flujo neto */}
        <div className="stat-card hover-lift animate-slide-up" style={{ animationDelay: '200ms' }}>
          <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${stats.flujoNeto >= 0 ? 'from-emerald-500 to-emerald-600' : 'from-red-500 to-red-600'}`} />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Flujo Neto (mes)</p>
              <p className={`text-2xl font-bold mt-2 ${stats.flujoNeto >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {stats.flujoNeto >= 0 ? '+' : ''}{formatMoney(stats.flujoNeto)}
              </p>
            </div>
            <div className={`p-2.5 rounded-xl ${stats.flujoNeto >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              <TrendingUp className={`w-5 h-5 ${stats.flujoNeto >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
            </div>
          </div>
        </div>
      </div>

      {/* Secondary cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Clientes por materia */}
        <div className="glass-card p-6 animate-slide-up" style={{ animationDelay: '200ms' }}>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-white/60" />
            Casos por Materia
          </h3>
          <div className="space-y-3">
            {materias.length === 0 ? (
              <p className="text-gray-500 text-sm">Sin casos registrados</p>
            ) : (
              materias.map(([materia, count]) => {
                const pct = stats.totalCasos > 0 ? Math.round((count / stats.totalCasos) * 100) : 0;
                return (
                  <div key={materia}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-gray-300">{materia}</span>
                      <span className="text-xs text-gray-500">{count} casos ({pct}%)</span>
                    </div>
                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${materiaColors[materia] || 'from-gray-500 to-gray-600'} animate-bar-grow bar-origin-left`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Alertas importantes */}
        <div className="glass-card p-6 animate-slide-up" style={{ animationDelay: '300ms' }}>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-white/60" />
            Alertas Importantes
          </h3>
          <div className="space-y-3">
            <AlertItem
              icon={<AlertTriangle className="w-4 h-4" />}
              color="text-red-400 bg-red-500/10"
              label="Cuotas vencidas"
              value={stats.cuotasVencidas}
            />
            <AlertItem
              icon={<Receipt className="w-4 h-4" />}
              color="text-yellow-400 bg-yellow-500/10"
              label="Sin pagar consulta"
              value={stats.sinPagarConsulta}
            />
            <AlertItem
              icon={<Star className="w-4 h-4" />}
              color="text-purple-400 bg-purple-500/10"
              label="Casos muy interesantes en consulta"
              value={stats.muyInteresantes}
            />
            <AlertItem
              icon={<UserPlus className="w-4 h-4" />}
              color="text-blue-400 bg-blue-500/10"
              label="Nuevos clientes (7 días)"
              value={stats.nuevosClientes7d}
            />
            <AlertItem
              icon={<Wallet className="w-4 h-4" />}
              color="text-orange-400 bg-orange-500/10"
              label="Casos con fondos bajos"
              value={stats.casosFondosBajos}
            />
          </div>
        </div>
      </div>

      {/* Resumen financiero del mes */}
      <div className="glass-card p-6 animate-slide-up" style={{ animationDelay: '350ms' }}>
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-white/60" />
          Resumen Financiero del Mes
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="flex items-center gap-3 p-4 bg-white/[0.02] rounded-xl border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all duration-200">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Ingresos CJ NOA</p>
              <p className="text-lg font-bold text-emerald-400 count-up">{formatMoney(stats.ingresosMes)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-white/[0.02] rounded-xl border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all duration-200">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <ArrowDownRight className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Egresos</p>
              <p className="text-lg font-bold text-red-400 count-up">{formatMoney(stats.egresosMes)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-white/[0.02] rounded-xl border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all duration-200">
            <div className={`p-2 rounded-lg ${stats.flujoNeto >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              <TrendingUp className={`w-4 h-4 ${stats.flujoNeto >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
            </div>
            <div>
              <p className="text-xs text-gray-500">Neto</p>
              <p className={`text-lg font-bold ${stats.flujoNeto >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {stats.flujoNeto >= 0 ? '+' : ''}{formatMoney(stats.flujoNeto)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Smart Alerts */}
      <SmartAlerts />

      {/* Cobranza por socio este mes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
      <div className="glass-card p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-white/60" />
          Cobranza por Socio (este mes)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {cobranzaPorSocio.map(({ socio, neto, registros }) => {
            return (
              <div key={socio} className="p-4 bg-white/[0.02] rounded-xl border border-white/5">
                <p className="text-xs text-gray-500">{socio}</p>
                <p className="text-xl font-bold text-emerald-400 mt-1">{formatMoney(neto)}</p>
                <p className="text-[10px] text-gray-500 mt-1">{registros} cobros</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Activity Feed */}
      <ActivityFeed />

      {/* Previsional KPIs */}
      {!prevLoading && (
        <div className="glass-card p-6 animate-slide-up">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-violet-400" />
            Módulo Previsional
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/10">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-violet-400" />
                <p className="text-[10px] text-gray-500 uppercase">Total Clientes</p>
              </div>
              <p className="text-2xl font-bold text-white">{prevStats.totalClientes}</p>
            </div>
            <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <p className="text-[10px] text-gray-500 uppercase">Cobrado Prev.</p>
              </div>
              <p className="text-2xl font-bold text-emerald-400">
                ${(prevStats.cobradoTotal / 1000).toFixed(0)}k
              </p>
            </div>
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <p className="text-[10px] text-gray-500 uppercase">Tareas Activas</p>
              </div>
              <p className="text-2xl font-bold text-white">{prevStats.tareasActivas}</p>
              {prevStats.tareasVencidas > 0 && (
                <p className="text-[10px] text-red-400">{prevStats.tareasVencidas} vencidas</p>
              )}
            </div>
            <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/10">
              <div className="flex items-center gap-2 mb-2">
                <CalendarDays className="w-4 h-4 text-purple-400" />
                <p className="text-[10px] text-gray-500 uppercase">Audiencias (7d)</p>
              </div>
              <p className="text-2xl font-bold text-white">{prevStats.audienciasProximas}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <p className="text-[10px] text-gray-500 uppercase mb-1">Pendiente de cobro</p>
              <p className="text-lg font-bold text-amber-400">${prevStats.pendienteTotal.toLocaleString('es-AR')}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <p className="text-[10px] text-gray-500 uppercase mb-1">Semáforo rojo</p>
              <p className="text-lg font-bold text-red-400">{prevStats.porSemaforo.rojo} clientes sin contacto {'>'} 15d</p>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function AlertItem({ icon, color, label, value }: { icon: React.ReactNode; color: string; label: string; value: number }) {
  const [textColor, bgColor] = color.split(' ');
  return (
    <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all duration-200 animate-slide-right">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${bgColor}`}>
          <span className={textColor}>{icon}</span>
        </div>
        <span className="text-sm text-gray-300">{label}</span>
      </div>
      <span className={`text-lg font-bold ${textColor} count-up`}>{value}</span>
    </div>
  );
}
