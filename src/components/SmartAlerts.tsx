import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, Zap, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SmartAlert {
  id: string;
  icon: React.ReactNode;
  message: string;
  type: 'positive' | 'warning' | 'info';
}

export default function SmartAlerts() {
  const [alerts, setAlerts] = useState<SmartAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function compute() {
      const now = new Date();
      const curMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const curEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
      const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];

      const [curIng, prevIng, curEgr, prevEgr, cuotasRes] = await Promise.all([
        supabase.from('ingresos').select('monto_cj_noa').gte('fecha', curMonth).lte('fecha', curEnd),
        supabase.from('ingresos').select('monto_cj_noa').gte('fecha', prevMonth).lte('fecha', prevEnd),
        supabase.from('egresos').select('monto').gte('fecha', curMonth).lte('fecha', curEnd),
        supabase.from('egresos').select('monto').gte('fecha', prevMonth).lte('fecha', prevEnd),
        supabase.from('cuotas').select('id, fecha').eq('estado', 'Pendiente').gte('fecha', now.toISOString().split('T')[0]).lte('fecha', new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]),
      ]);

      // Spec alertas: tareas sin avanzar >2d, tareas acumuladas, cargos cerca sin tarea
      const hace2 = new Date(now.getTime() - 2 * 86400000).toISOString();
      const hoyStr = now.toISOString().split('T')[0];
      const in3 = new Date(now.getTime() + 3 * 86400000).toISOString().split('T')[0];
      const [tareasStale, tareasPend, cargosRes] = await Promise.all([
        supabase.from('tareas_previsional').select('id').neq('estado', 'completada').lt('updated_at', hace2),
        supabase.from('tareas_previsional').select('id').eq('estado', 'pendiente'),
        supabase.from('tareas_previsional').select('id,cargo_hora,cargo_hora_fecha').neq('estado', 'completada').not('cargo_hora_fecha', 'is', null).gte('cargo_hora_fecha', hoyStr).lte('cargo_hora_fecha', in3),
      ]);

      const curIngTotal = (curIng.data || []).reduce((s, r) => s + Number(r.monto_cj_noa || 0), 0);
      const prevIngTotal = (prevIng.data || []).reduce((s, r) => s + Number(r.monto_cj_noa || 0), 0);
      const curEgrTotal = (curEgr.data || []).reduce((s, r) => s + Number(r.monto || 0), 0);
      const prevEgrTotal = (prevEgr.data || []).reduce((s, r) => s + Number(r.monto || 0), 0);
      const cuotasSemana = cuotasRes.data?.length || 0;

      const result: SmartAlert[] = [];

      // Income comparison
      if (prevIngTotal > 0) {
        const pct = ((curIngTotal - prevIngTotal) / prevIngTotal) * 100;
        if (pct > 15) {
          result.push({
            id: 'ing-up',
            icon: <ArrowUpRight className="w-4 h-4" />,
            message: `Ingresos crecieron ${Math.round(pct)}% respecto al mes anterior`,
            type: 'positive',
          });
        } else if (pct < -15) {
          result.push({
            id: 'ing-down',
            icon: <ArrowDownRight className="w-4 h-4" />,
            message: `Ingresos bajaron ${Math.abs(Math.round(pct))}% respecto al mes anterior`,
            type: 'warning',
          });
        }
      }

      // Expense comparison
      if (prevEgrTotal > 0) {
        const pct = ((curEgrTotal - prevEgrTotal) / prevEgrTotal) * 100;
        if (pct > 20) {
          result.push({
            id: 'egr-up',
            icon: <TrendingUp className="w-4 h-4" />,
            message: `Egresos aumentaron ${Math.round(pct)}% — revisar gastos del periodo`,
            type: 'warning',
          });
        } else if (pct < -10) {
          result.push({
            id: 'egr-down',
            icon: <TrendingDown className="w-4 h-4" />,
            message: `Egresos se redujeron ${Math.abs(Math.round(pct))}% — buen control de gastos`,
            type: 'positive',
          });
        }
      }

      // Net flow
      const net = curIngTotal - curEgrTotal;
      if (net < 0) {
        result.push({
          id: 'net-neg',
          icon: <AlertTriangle className="w-4 h-4" />,
          message: `Flujo neto negativo este mes: los egresos superan los ingresos`,
          type: 'warning',
        });
      }

      // Upcoming cuotas
      if (cuotasSemana > 0) {
        result.push({
          id: 'cuotas-week',
          icon: <Calendar className="w-4 h-4" />,
          message: `${cuotasSemana} cuota${cuotasSemana > 1 ? 's' : ''} vence${cuotasSemana > 1 ? 'n' : ''} esta semana`,
          type: 'info',
        });
      }

      // Days into month progress vs expected
      const dayOfMonth = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const monthProgress = dayOfMonth / daysInMonth;
      if (prevIngTotal > 0 && curIngTotal > prevIngTotal * monthProgress * 1.3) {
        result.push({
          id: 'pace-good',
          icon: <Zap className="w-4 h-4" />,
          message: `Ritmo de cobranza por encima de lo esperado para este punto del mes`,
          type: 'positive',
        });
      }

      // Tareas acumuladas / sin avanzar / cargos proximos (spec)
      const stale = tareasStale.data?.length || 0;
      const pend = tareasPend.data?.length || 0;
      const cargos = cargosRes.data?.length || 0;
      if (stale > 0) {
        result.push({
          id: 'tareas-stale',
          icon: <AlertTriangle className="w-4 h-4" />,
          message: `${stale} tarea${stale > 1 ? 's' : ''} sin avanzar hace mas de 2 dias`,
          type: 'warning',
        });
      }
      if (pend >= 10) {
        result.push({
          id: 'tareas-acum',
          icon: <AlertTriangle className="w-4 h-4" />,
          message: `${pend} tareas pendientes acumuladas — priorizar esta semana`,
          type: 'warning',
        });
      }
      if (cargos > 0) {
        result.push({
          id: 'cargos-cerca',
          icon: <Calendar className="w-4 h-4" />,
          message: `${cargos} cargo${cargos > 1 ? 's' : ''} de hora vence${cargos > 1 ? 'n' : ''} en los proximos 3 dias`,
          type: 'info',
        });
      }

      setAlerts(result);
      setLoading(false);
    }
    compute();
  }, []);

  const colorMap = {
    positive: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    warning: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    info: { text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  };

  if (loading || alerts.length === 0) return null;

  return (
    <div className="glass-card p-6 animate-slide-up" style={{ animationDelay: '400ms' }}>
      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        <Zap className="w-4 h-4 text-white/60" />
        Insights Inteligentes
      </h3>
      <div className="space-y-2">
        {alerts.map((alert, i) => {
          const c = colorMap[alert.type];
          return (
            <div
              key={alert.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${c.border} ${c.bg} animate-slide-right`}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <span className={c.text}>{alert.icon}</span>
              <p className="text-sm text-gray-200">{alert.message}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
