export interface ChartDatum {
  label: string;
  value: number;
  color: string;
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-10 text-center text-sm text-gray-500">
      {message}
    </div>
  );
}

export function FinanceBars({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle?: string;
  data: ChartDatum[];
}) {
  if (data.length === 0) {
    return (
      <div className="glass-card p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <EmptyChart message="Todavia no hay datos suficientes para este grafico." />
      </div>
    );
  }

  const max = Math.max(...data.map(item => item.value), 1);

  return (
    <div className="glass-card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </div>
      <div className="space-y-3">
        {data.map((item, i) => (
          <div key={item.label} className="space-y-1.5 animate-slide-right" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-gray-300 truncate">{item.label}</span>
              <span className="text-white font-medium whitespace-nowrap count-up">{formatMoney(item.value)}</span>
            </div>
            <div className="h-2.5 rounded-full bg-white/[0.04] overflow-hidden">
              <div
                className="h-full rounded-full animate-bar-grow bar-origin-left"
                style={{ width: `${(item.value / max) * 100}%`, background: item.color, animationDelay: `${i * 80 + 200}ms` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinanceDonut({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle?: string;
  data: ChartDatum[];
}) {
  if (data.length === 0) {
    return (
      <div className="glass-card p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <EmptyChart message="No hay composicion para mostrar en este periodo." />
      </div>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  let accumulated = 0;
  const gradient = data
    .filter(item => item.value > 0)
    .map(item => {
      const start = total > 0 ? (accumulated / total) * 100 : 0;
      accumulated += item.value;
      const end = total > 0 ? (accumulated / total) * 100 : start;
      return `${item.color} ${start}% ${end}%`;
    })
    .join(', ');

  return (
    <div className="glass-card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </div>
      <div className="grid gap-5 md:grid-cols-[180px_1fr] items-center">
        <div className="relative mx-auto w-44 h-44 donut-spin">
          <div
            className="absolute inset-0 rounded-full border border-white/10 transition-all duration-700"
            style={{ background: gradient ? `conic-gradient(${gradient})` : 'rgba(255,255,255,0.06)' }}
          />
          <div className="absolute inset-[18px] rounded-full bg-[#0f1013] border border-white/[0.06] flex flex-col items-center justify-center text-center px-4">
            <span className="text-[10px] uppercase tracking-[0.25em] text-gray-500">Total</span>
            <span className="text-lg font-semibold text-white mt-2 count-up">{formatMoney(total)}</span>
          </div>
        </div>
        <div className="space-y-3">
          {data.map((item, i) => {
            const percentage = total > 0 ? (item.value / total) * 100 : 0;
            return (
              <div key={item.label} className="flex items-center justify-between gap-3 text-sm animate-slide-right hover:bg-white/[0.03] rounded-lg px-2 py-1 -mx-2 transition-colors duration-200" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-3 h-3 rounded-full shrink-0 animate-scale-in" style={{ background: item.color, animationDelay: `${i * 60 + 200}ms` }} />
                  <span className="text-gray-300 truncate">{item.label}</span>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-white font-medium">{formatMoney(item.value)}</p>
                  <p className="text-xs text-gray-500">{percentage.toFixed(1)}%</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function FinanceLineChart({
  title,
  subtitle,
  series,
  labels,
  projectionMonths = 0,
}: {
  title: string;
  subtitle?: string;
  series: Array<{ label: string; income: number; expense: number; net: number }>;
  labels?: { income: string; expense: string; net: string };
  projectionMonths?: number;
}) {
  if (series.length === 0) {
    return (
      <div className="glass-card p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <EmptyChart message="No hay serie temporal disponible todavia." />
      </div>
    );
  }

  const width = 720;
  const height = 240;
  const padding = 24;
  const values = series.flatMap(item => [item.income, item.expense, item.net]);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const legend = labels || { income: 'Ingresos', expense: 'Egresos', net: 'Neto' };

  // Build projected data using simple linear regression on last 3 data points
  const projected = (() => {
    if (projectionMonths <= 0 || series.length < 2) return [];
    const recent = series.slice(-3);
    const avgInc = recent.reduce((s, p, i) => s + (i > 0 ? p.income - recent[i - 1].income : 0), 0) / Math.max(recent.length - 1, 1);
    const avgExp = recent.reduce((s, p, i) => s + (i > 0 ? p.expense - recent[i - 1].expense : 0), 0) / Math.max(recent.length - 1, 1);
    const last = series[series.length - 1];
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const lastMonthIdx = months.indexOf(last.label.slice(0, 3));
    return Array.from({ length: projectionMonths }, (_, i) => {
      const inc = Math.max(last.income + avgInc * (i + 1), 0);
      const exp = Math.max(last.expense + avgExp * (i + 1), 0);
      const mIdx = (lastMonthIdx + i + 1) % 12;
      return { label: months[mIdx >= 0 ? mIdx : 0] + ' (p)', income: inc, expense: exp, net: inc - exp };
    });
  })();

  const allData = [...series, ...projected];
  const allValues = allData.flatMap(item => [item.income, item.expense, item.net]);
  const allMax = Math.max(...allValues, max);
  const allMin = Math.min(...allValues, min);
  const allRange = Math.max(allMax - allMin, 1);

  function buildPath(selector: (item: (typeof series)[number]) => number, dataSet = series) {
    return dataSet
      .map((item, index) => {
        const totalLen = allData.length;
        const baseIdx = dataSet === series ? index : series.length + index;
        const x = padding + (baseIdx * (width - padding * 2)) / Math.max(totalLen - 1, 1);
        const value = selector(item);
        const y = height - padding - ((value - allMin) / allRange) * (height - padding * 2);
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }

  // Bridge path connects last real point to first projected point
  function buildBridgePath(selector: (item: (typeof series)[number]) => number) {
    if (projected.length === 0) return '';
    const lastReal = series[series.length - 1];
    const firstProj = projected[0];
    const totalLen = allData.length;
    const x1 = padding + ((series.length - 1) * (width - padding * 2)) / Math.max(totalLen - 1, 1);
    const y1 = height - padding - ((selector(lastReal) - allMin) / allRange) * (height - padding * 2);
    const x2 = padding + (series.length * (width - padding * 2)) / Math.max(totalLen - 1, 1);
    const y2 = height - padding - ((selector(firstProj) - allMin) / allRange) * (height - padding * 2);
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  return (
    <div className="glass-card p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-400" />{legend.income}</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-rose-400" />{legend.expense}</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-cyan-300" />{legend.net}</span>
          {projected.length > 0 && <span className="flex items-center gap-2"><span className="w-6 border-t-2 border-dashed border-gray-500" />Proyección</span>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[680px] h-64">
          {[0, 0.25, 0.5, 0.75, 1].map(step => {
            const y = padding + step * (height - padding * 2);
            return <line key={step} x1={padding} x2={width - padding} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" />;
          })}
          {/* Projection zone background */}
          {projected.length > 0 && (
            <rect
              x={padding + ((series.length - 0.5) * (width - padding * 2)) / Math.max(allData.length - 1, 1)}
              y={padding}
              width={(projected.length * (width - padding * 2)) / Math.max(allData.length - 1, 1)}
              height={height - padding * 2}
              fill="rgba(255,255,255,0.02)"
              rx="4"
            />
          )}
          {/* Real data lines */}
          <path d={buildPath(item => item.income)} fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" className="line-draw" style={{ strokeDasharray: 2000, strokeDashoffset: 2000, animation: 'lineDraw 1.5s ease-out 0.2s forwards' }} />
          <path d={buildPath(item => item.expense)} fill="none" stroke="#fb7185" strokeWidth="3" strokeLinecap="round" className="line-draw" style={{ strokeDasharray: 2000, strokeDashoffset: 2000, animation: 'lineDraw 1.5s ease-out 0.4s forwards' }} />
          <path d={buildPath(item => item.net)} fill="none" stroke="#67e8f9" strokeWidth="3" strokeLinecap="round" className="line-draw" style={{ strokeDasharray: 2000, strokeDashoffset: 2000, animation: 'lineDraw 1.5s ease-out 0.6s forwards' }} />
          {/* Projected lines (dashed) */}
          {projected.length > 0 && (
            <>
              <path d={buildBridgePath(item => item.income)} fill="none" stroke="#34d399" strokeWidth="2" strokeDasharray="6 4" opacity="0.5" />
              <path d={buildBridgePath(item => item.expense)} fill="none" stroke="#fb7185" strokeWidth="2" strokeDasharray="6 4" opacity="0.5" />
              <path d={buildBridgePath(item => item.net)} fill="none" stroke="#67e8f9" strokeWidth="2" strokeDasharray="6 4" opacity="0.5" />
              <path d={buildPath(item => item.income, projected)} fill="none" stroke="#34d399" strokeWidth="2" strokeDasharray="6 4" opacity="0.5" />
              <path d={buildPath(item => item.expense, projected)} fill="none" stroke="#fb7185" strokeWidth="2" strokeDasharray="6 4" opacity="0.5" />
              <path d={buildPath(item => item.net, projected)} fill="none" stroke="#67e8f9" strokeWidth="2" strokeDasharray="6 4" opacity="0.5" />
            </>
          )}
          {/* Real data dots */}
          {series.map((item, index) => {
            const totalLen = allData.length;
            const x = padding + (index * (width - padding * 2)) / Math.max(totalLen - 1, 1);
            const valuesForDots = [
              { value: item.income, color: '#34d399' },
              { value: item.expense, color: '#fb7185' },
              { value: item.net, color: '#67e8f9' },
            ];

            return valuesForDots.map(dot => {
              const y = height - padding - ((dot.value - allMin) / allRange) * (height - padding * 2);
              return <circle key={`${item.label}-${dot.color}`} cx={x} cy={y} r="4" fill={dot.color} stroke="#0f1013" strokeWidth="2" className="animate-scale-in" style={{ animationDelay: `${0.8 + index * 0.1}s` }} />;
            });
          })}
          {/* Projected dots (hollow) */}
          {projected.map((item, index) => {
            const totalLen = allData.length;
            const x = padding + ((series.length + index) * (width - padding * 2)) / Math.max(totalLen - 1, 1);
            return [
              { value: item.income, color: '#34d399' },
              { value: item.expense, color: '#fb7185' },
              { value: item.net, color: '#67e8f9' },
            ].map(dot => {
              const y = height - padding - ((dot.value - allMin) / allRange) * (height - padding * 2);
              return <circle key={`proj-${item.label}-${dot.color}`} cx={x} cy={y} r="3" fill="transparent" stroke={dot.color} strokeWidth="1.5" opacity="0.6" />;
            });
          })}
        </svg>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mt-4">
        {allData.map((item, i) => {
          const isProj = i >= series.length;
          return (
          <div key={item.label} className={`rounded-2xl border bg-black/20 px-3 py-2 hover-lift animate-scale-in transition-all duration-300 ${isProj ? 'border-dashed border-white/[0.08]' : 'border-white/[0.06] hover:border-white/15'}`} style={{ animationDelay: `${i * 50}ms` }}>
            <p className="text-xs text-gray-500">{item.label}</p>
            <p className={`text-sm font-medium mt-1 ${item.net >= 0 ? 'text-emerald-400' : 'text-rose-400'} ${isProj ? 'opacity-60' : ''}`}>
              {formatMoney(item.net)}
            </p>
          </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Vertical Bar Chart ── */

export function FinanceVerticalBars({
  title,
  subtitle,
  data,
  height = 220,
}: {
  title: string;
  subtitle?: string;
  data: ChartDatum[];
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <div className="glass-card p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <EmptyChart message="Sin datos para graficar." />
      </div>
    );
  }

  const max = Math.max(...data.map(d => Math.abs(d.value)), 1);
  const hasNegative = data.some(d => d.value < 0);
  const barAreaH = hasNegative ? height * 0.5 : height;
  const negAreaH = hasNegative ? height * 0.5 : 0;

  return (
    <div className="glass-card p-5 animate-fade-in">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </div>
      <div className="relative" style={{ height: height + 40 }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(step => (
          <div
            key={step}
            className="absolute left-0 right-0 border-t border-white/[0.05]"
            style={{ top: `${(hasNegative ? step * 50 : step * 100)}%` }}
          />
        ))}

        {/* Zero line for mixed data */}
        {hasNegative && (
          <div className="absolute left-0 right-0 border-t border-white/15" style={{ top: '50%' }} />
        )}

        {/* Bars */}
        <div className="relative flex items-end justify-around gap-1 h-full px-2" style={{ height }}>
          {data.map((item, i) => {
            const absVal = Math.abs(item.value);
            const pct = (absVal / max) * 100;
            const isNeg = item.value < 0;
            const barH = hasNegative ? pct * 0.5 : pct;

            return (
              <div
                key={item.label}
                className="flex-1 flex flex-col items-center group relative"
                style={{ height: '100%', maxWidth: 64 }}
              >
                {/* Positive bar */}
                {!isNeg && (
                  <div className="w-full flex items-end justify-center" style={{ height: hasNegative ? '50%' : '100%' }}>
                    <div
                      className="w-full max-w-[40px] rounded-t-lg transition-all duration-300 group-hover:brightness-125 group-hover:shadow-lg"
                      style={{
                        height: `${barH}%`,
                        background: `linear-gradient(to top, ${item.color}cc, ${item.color})`,
                        animation: `barGrowUp 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 80}ms both`,
                      }}
                    />
                  </div>
                )}
                {/* Negative bar */}
                {isNeg && hasNegative && (
                  <>
                    <div style={{ height: '50%' }} />
                    <div className="w-full flex items-start justify-center" style={{ height: '50%' }}>
                      <div
                        className="w-full max-w-[40px] rounded-b-lg transition-all duration-300 group-hover:brightness-125 group-hover:shadow-lg"
                        style={{
                          height: `${barH}%`,
                          background: `linear-gradient(to bottom, ${item.color}cc, ${item.color})`,
                          animation: `barGrowDown 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 80}ms both`,
                        }}
                      />
                    </div>
                  </>
                )}

                {/* Tooltip on hover */}
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                  <div className="bg-[#1a1a1e] border border-white/15 rounded-lg px-2.5 py-1.5 shadow-xl whitespace-nowrap">
                    <p className="text-[10px] text-gray-400">{item.label}</p>
                    <p className="text-xs font-bold text-white">{formatMoney(item.value)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Labels */}
        <div className="flex justify-around gap-1 px-2 mt-2">
          {data.map(item => (
            <div key={item.label} className="flex-1 text-center max-w-[64px]">
              <p className="text-[9px] text-gray-500 truncate leading-tight">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Grouped Vertical Bar Chart (income vs expense per month) ── */

export function FinanceGroupedBars({
  title,
  subtitle,
  series,
  labels,
}: {
  title: string;
  subtitle?: string;
  series: Array<{ label: string; income: number; expense: number; net: number }>;
  labels?: { income: string; expense: string };
}) {
  if (series.length === 0) {
    return (
      <div className="glass-card p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <EmptyChart message="Sin datos para graficar." />
      </div>
    );
  }

  const visibleSeries = series.filter(item => item.income > 0 || item.expense > 0);

  if (visibleSeries.length === 0) {
    return (
      <div className="glass-card p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <EmptyChart message="No hubo ingresos ni egresos en el periodo seleccionado." />
      </div>
    );
  }

  const legend = labels || { income: 'Ingresos', expense: 'Egresos' };
  const max = Math.max(...visibleSeries.flatMap(s => [s.income, s.expense]), 1);
  const height = 200;

  return (
    <div className="glass-card p-5 animate-fade-in">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className="flex gap-3 text-[10px] text-gray-400 shrink-0">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />{legend.income}</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400" />{legend.expense}</span>
        </div>
      </div>

      <div className="relative" style={{ height: height + 32 }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(step => {
          const v = max * (1 - step);
          return (
            <div key={step} className="absolute left-8 right-0 flex items-center" style={{ top: `${step * 100 * (height / (height + 32))}%` }}>
              <span className="text-[9px] text-gray-600 w-8 text-right pr-2 shrink-0">{v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toFixed(0)}</span>
              <div className="flex-1 border-t border-white/[0.05]" />
            </div>
          );
        })}

        {/* Bars area */}
        <div className="absolute left-8 right-0 bottom-8 flex items-end justify-around gap-2" style={{ height }}>
          {visibleSeries.map((s, i) => {
            const incH = (s.income / max) * 100;
            const expH = (s.expense / max) * 100;
            return (
              <div key={s.label} className="flex-1 flex items-end justify-center gap-[3px] group relative" style={{ maxWidth: 80 }}>
                <div
                  className="w-[40%] rounded-t-md transition-all duration-200 group-hover:brightness-125"
                  style={{
                    height: `${incH}%`,
                    background: 'linear-gradient(to top, #059669, #34d399)',
                    animation: `barGrowUp 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 100}ms both`,
                  }}
                />
                <div
                  className="w-[40%] rounded-t-md transition-all duration-200 group-hover:brightness-125"
                  style={{
                    height: `${expH}%`,
                    background: 'linear-gradient(to top, #e11d48, #fb7185)',
                    animation: `barGrowUp 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 100 + 60}ms both`,
                  }}
                />
                {/* Hover tooltip */}
                <div className="absolute -top-14 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                  <div className="bg-[#1a1a1e] border border-white/15 rounded-lg px-2.5 py-1.5 shadow-xl whitespace-nowrap">
                    <p className="text-[10px] text-gray-400 mb-0.5">{s.label}</p>
                    <p className="text-[10px] text-emerald-300">{legend.income}: {formatMoney(s.income)}</p>
                    <p className="text-[10px] text-rose-300">{legend.expense}: {formatMoney(s.expense)}</p>
                    <p className={`text-[10px] font-bold ${s.net >= 0 ? 'text-white' : 'text-rose-400'}`}>Neto: {formatMoney(s.net)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* X-axis labels */}
        <div className="absolute left-8 right-0 bottom-0 flex justify-around gap-2">
          {visibleSeries.map(s => (
            <div key={s.label} className="flex-1 text-center" style={{ maxWidth: 80 }}>
              <p className="text-[9px] text-gray-500 truncate">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}