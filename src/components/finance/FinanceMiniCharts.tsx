import { useMemo } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, Legend,
} from 'recharts';

export interface ChartItem {
  fecha: string;
  monto: number;
  categoria: string;       // ej: doctor o pagador
  subcategoria?: string;   // ej: rama, tipo, concepto
  modalidad?: string;
}

const PALETTE = ['#38bdf8', '#a78bfa', '#fbbf24', '#fb7185', '#34d399', '#f472b6', '#60a5fa', '#facc15'];

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

function EmptyBox({ height = 240 }: { height?: number }) {
  return (
    <div style={{ height }} className="flex items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.02] text-xs text-zinc-500">
      Sin datos para graficar
    </div>
  );
}

function CardWrap({ title, children, accent = 'sky' }: { title: string; children: React.ReactNode; accent?: 'sky' | 'rose' | 'emerald' | 'violet' }) {
  const ring = accent === 'rose' ? 'before:from-rose-500/20'
    : accent === 'emerald' ? 'before:from-emerald-500/20'
    : accent === 'violet' ? 'before:from-violet-500/20'
    : 'before:from-sky-500/20';
  return (
    <div className={`relative rounded-xl border border-white/10 bg-white/[0.02] p-4 overflow-hidden before:content-[''] before:absolute before:-top-12 before:-right-12 before:w-40 before:h-40 before:rounded-full before:bg-gradient-to-br ${ring} before:to-transparent before:blur-2xl before:opacity-60`}>
      <div className="relative">
        <h3 className="text-xs uppercase tracking-wider text-zinc-400 mb-3 font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

interface Props {
  items: ChartItem[];
  pieTitle?: string;
  lineTitle?: string;
  barTitle?: string;
  barLabel?: string;
  accent?: 'sky' | 'rose' | 'emerald' | 'violet';
}

export default function FinanceMiniCharts({
  items,
  pieTitle = 'Distribución por persona',
  lineTitle = 'Evolución diaria',
  barTitle = 'Top conceptos',
  barLabel = 'Monto',
  accent = 'sky',
}: Props) {
  const pieData = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach(i => m.set(i.categoria || '—', (m.get(i.categoria || '—') || 0) + i.monto));
    return Array.from(m.entries())
      .map(([name, value], idx) => ({ name, value, color: PALETTE[idx % PALETTE.length] }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [items]);

  const lineData = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach(i => m.set(i.fecha, (m.get(i.fecha) || 0) + i.monto));
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, monto]) => ({ fecha: fecha.slice(5), monto }));
  }, [items]);

  const barData = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach(i => {
      const k = i.subcategoria || '—';
      m.set(k, (m.get(k) || 0) + i.monto);
    });
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [items]);

  const lineColor = accent === 'rose' ? '#fb7185' : accent === 'emerald' ? '#34d399' : accent === 'violet' ? '#a78bfa' : '#38bdf8';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <CardWrap title={pieTitle} accent={accent}>
        {pieData.length === 0 ? <EmptyBox /> : (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2}>
                {pieData.map((d, i) => <Cell key={i} fill={d.color} stroke="rgba(0,0,0,0.4)" strokeWidth={1} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: any) => fmt(Number(v))}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardWrap>

      <CardWrap title={lineTitle} accent={accent}>
        {lineData.length === 0 ? <EmptyBox /> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={lineData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#a1a1aa' }} />
              <YAxis tick={{ fontSize: 10, fill: '#a1a1aa' }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: any) => fmt(Number(v))}
              />
              <Line type="monotone" dataKey="monto" stroke={lineColor} strokeWidth={2.5} dot={{ r: 3, fill: lineColor }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardWrap>

      <CardWrap title={barTitle} accent={accent}>
        {barData.length === 0 ? <EmptyBox /> : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#a1a1aa' }} interval={0} angle={-20} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10, fill: '#a1a1aa' }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: any) => fmt(Number(v))}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <Bar dataKey="value" name={barLabel} radius={[6, 6, 0, 0]}>
                {barData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardWrap>
    </div>
  );
}
