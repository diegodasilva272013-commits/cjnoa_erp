import { Pause, AlertTriangle, Cog } from 'lucide-react';
import { hace, type EstadoAgente } from '../../lib/agentesApi';

/** Animaciones de la oficina. Se apagan solas si la persona pidió menos movimiento en su sistema. */
const ESTILOS = `
@keyframes ag-respira { 0%,100% { transform: translateY(0) } 50% { transform: translateY(1.6px) } }
@keyframes ag-teclea-i { 0%,100% { transform: rotate(8deg) } 50% { transform: rotate(-4deg) } }
@keyframes ag-teclea-d { 0%,100% { transform: rotate(-8deg) } 50% { transform: rotate(4deg) } }
@keyframes ag-cabeza { 0%,100% { transform: rotate(0deg) } 25% { transform: rotate(-2deg) } 75% { transform: rotate(2deg) } }
@keyframes ag-pantalla { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
@keyframes ag-barra { 0%,100% { transform: scaleY(.45) } 50% { transform: scaleY(1) } }
@keyframes ag-linea { 0% { transform: scaleX(.2) } 60%,100% { transform: scaleX(1) } }
@keyframes ag-zzz { 0% { opacity: 0; transform: translate(0,8px) scale(.7) } 30% { opacity: 1 } 100% { opacity: 0; transform: translate(12px,-20px) scale(1.15) } }
@keyframes ag-puntos { 0%,80%,100% { opacity: .25 } 40% { opacity: 1 } }
@keyframes ag-brillo { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
@keyframes ag-giro { to { transform: rotate(360deg) } }
.ag-trabajando .ag-torso { animation: ag-respira 1.6s ease-in-out infinite; transform-box: fill-box; }
.ag-trabajando .ag-cabeza { animation: ag-cabeza 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: bottom center; }
.ag-trabajando .ag-brazo-i { animation: ag-teclea-i .38s ease-in-out infinite; transform-box: fill-box; transform-origin: top center; }
.ag-trabajando .ag-brazo-d { animation: ag-teclea-d .38s ease-in-out infinite .19s; transform-box: fill-box; transform-origin: top center; }
.ag-trabajando .ag-pantalla { animation: ag-pantalla 1.2s ease-in-out infinite; }
.ag-trabajando .ag-barra { animation: ag-barra 1s ease-in-out infinite; transform-box: fill-box; transform-origin: bottom center; }
.ag-trabajando .ag-linea { animation: ag-linea 1.4s ease-in-out infinite; transform-box: fill-box; transform-origin: left center; }
.ag-inactivo .ag-torso { animation: ag-respira 4.2s ease-in-out infinite; transform-box: fill-box; }
.ag-inactivo .ag-z { animation: ag-zzz 3.2s ease-in-out infinite; }
.ag-inactivo .ag-z:nth-of-type(2) { animation-delay: 1s }
.ag-inactivo .ag-z:nth-of-type(3) { animation-delay: 2s }
.ag-punto { animation: ag-puntos 1.2s infinite; }
.ag-punto:nth-child(2) { animation-delay: .2s }
.ag-punto:nth-child(3) { animation-delay: .4s }
.ag-progreso { background-image: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.35) 50%, rgba(255,255,255,0) 100%); background-size: 200% 100%; animation: ag-brillo 1.4s linear infinite; }
.ag-engranaje { animation: ag-giro 2.4s linear infinite; }
@media (prefers-reduced-motion: reduce) { .ag-escena *, .ag-escena { animation: none !important; } }
`;

type Ficha = { piel: string; pelo: string; camisa: string; acento: string; lentes?: boolean };
const FICHAS: Record<EstadoAgente['agente'], Ficha> = {
  analista: { piel: '#f1c27d', pelo: '#2d2a26', camisa: '#3b82f6', acento: '#60a5fa', lentes: true },
  redactor: { piel: '#e0ac69', pelo: '#7c4a1d', camisa: '#8b5cf6', acento: '#a78bfa' },
  tester: { piel: '#c68642', pelo: '#111827', camisa: '#10b981', acento: '#34d399' },
  auditor: { piel: '#f5d0b0', pelo: '#9ca3af', camisa: '#f59e0b', acento: '#fbbf24', lentes: true },
};

/** Lo que muestra el monitor de cada agente (barras, texto, tildes, escudo). */
function Pantalla({ agente, color }: { agente: EstadoAgente['agente']; color: string }) {
  if (agente === 'analista') {
    return (<g className="ag-pantalla">
      {[0, 1, 2, 3].map(i => <rect key={i} className="ag-barra" x={150 + i * 9} y={104 + (3 - i) * 4} width="6" height={20 - (3 - i) * 4} rx="1" fill={color} style={{ animationDelay: `${i * 0.18}s` }} />)}
    </g>);
  }
  if (agente === 'redactor') {
    return (<g className="ag-pantalla">
      {[0, 1, 2, 3].map(i => <rect key={i} className="ag-linea" x="150" y={105 + i * 6} width={36 - (i % 2) * 10} height="3" rx="1.5" fill={color} style={{ animationDelay: `${i * 0.25}s` }} />)}
    </g>);
  }
  if (agente === 'tester') {
    return (<g className="ag-pantalla" stroke={color} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M150 108 l3 3 l6 -6" /><path d="M150 120 l3 3 l6 -6" /><path d="M164 108 h22 M164 120 h22" strokeWidth="2" />
    </g>);
  }
  return (<g className="ag-pantalla"><path d="M168 103 l14 5 v9 c0 7 -6 11 -14 14 c-8 -3 -14 -7 -14 -14 v-9 z" fill={color} opacity=".9" /><path d="M162 117 l4 4 l8 -9" stroke="#0a0a0a" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>);
}

function Persona({ a }: { a: EstadoAgente }) {
  const f = FICHAS[a.agente];
  const dormido = a.estado === 'inactivo';
  const pausa = a.estado === 'pausado';
  const apagado = pausa || a.estado === 'error';
  const camisa = pausa ? '#6b7280' : f.camisa;
  return (
    <svg viewBox="0 0 220 175" className="w-full" role="img" aria-label={`${a.nombre}: ${a.estado}`}>
      <ellipse cx="110" cy="166" rx="86" ry="6" fill="#000" opacity=".35" />
      {/* silla y escritorio */}
      <rect x="82" y="96" width="56" height="48" rx="12" fill="#1f2937" />
      <rect x="18" y="140" width="184" height="9" rx="3" fill="#374151" />
      <rect x="30" y="149" width="6" height="16" fill="#1f2937" /><rect x="184" y="149" width="6" height="16" fill="#1f2937" />
      {/* monitor */}
      <rect x="143" y="96" width="50" height="36" rx="4" fill="#0b0f17" stroke={apagado ? '#4b5563' : f.acento} strokeWidth="1.6" />
      <rect x="165" y="132" width="6" height="8" fill="#4b5563" />
      {!apagado && !dormido && <Pantalla agente={a.agente} color={f.acento} />}
      {dormido && <rect x="147" y="100" width="42" height="28" rx="2" fill={f.acento} opacity=".07" />}
      {/* teclado */}
      <rect x="82" y="134" width="46" height="6" rx="2" fill="#9ca3af" />
      {/* persona */}
      <g className="ag-torso">
        <rect x="80" y="92" width="60" height="46" rx="15" fill={camisa} />
        <rect x="104" y="84" width="12" height="12" fill={f.piel} />
        <g className="ag-cabeza">
          <circle cx="110" cy="70" r="17" fill={f.piel} />
          <path d="M92 69 Q92 49 110 49 Q128 49 128 69 Q121 58 110 58 Q99 58 92 69Z" fill={f.pelo} />
          {dormido ? <path d="M100 72 h6 M114 72 h6" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
            : <><circle cx="103" cy="72" r="1.9" fill="#1f2937" /><circle cx="117" cy="72" r="1.9" fill="#1f2937" /></>}
          {f.lentes && <g stroke="#1f2937" strokeWidth="1.3" fill="none"><circle cx="103" cy="72" r="5.2" /><circle cx="117" cy="72" r="5.2" /><path d="M108.2 72 h3.6" /></g>}
          <path d={a.estado === 'error' ? 'M105 82 Q110 78 115 82' : dormido ? 'M106 80 h8' : 'M105 79 Q110 83 115 79'} stroke="#1f2937" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </g>
        <g className="ag-brazo-i"><rect x="72" y="100" width="12" height="38" rx="6" fill={camisa} transform="rotate(8 78 100)" /><circle cx="86" cy="138" r="5" fill={f.piel} /></g>
        <g className="ag-brazo-d"><rect x="136" y="100" width="12" height="38" rx="6" fill={camisa} transform="rotate(-8 142 100)" /><circle cx="128" cy="138" r="5" fill={f.piel} /></g>
      </g>
      {dormido && <g fill="#9ca3af" fontWeight="700" fontFamily="system-ui,sans-serif">
        <text className="ag-z" x="128" y="58" fontSize="13">z</text><text className="ag-z" x="136" y="50" fontSize="16">Z</text><text className="ag-z" x="146" y="40" fontSize="19">Z</text>
      </g>}
    </svg>
  );
}

const ETIQUETA: Record<EstadoAgente['estado'], { texto: string; clase: string }> = {
  inactivo: { texto: 'Descansando', clase: 'bg-gray-500/15 text-gray-300' },
  trabajando: { texto: 'Trabajando', clase: 'bg-emerald-500/15 text-emerald-300' },
  pausado: { texto: 'En pausa', clase: 'bg-amber-500/15 text-amber-300' },
  error: { texto: 'Con un error', clase: 'bg-red-500/15 text-red-300' },
};

function Escritorio({ a }: { a: EstadoAgente }) {
  const f = FICHAS[a.agente];
  const e = ETIQUETA[a.estado];
  const trabajando = a.estado === 'trabajando';
  return (
    <article className={`ag-${a.estado} relative flex flex-col rounded-2xl border bg-[#0a0a0a] p-4 transition-colors ${trabajando ? 'border-emerald-500/40 shadow-[0_0_28px_-10px_rgba(16,185,129,.55)]' : a.estado === 'error' ? 'border-red-500/40' : 'border-white/10'}`}>
      {/* globo con lo que está haciendo */}
      <div className={`mb-2 min-h-[58px] rounded-xl border px-3 py-2 text-xs leading-snug transition-opacity ${trabajando ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-white/10 bg-white/5 text-gray-400'}`}>
        <div className="flex items-start gap-2">
          {trabajando ? <Cog className="ag-engranaje mt-0.5 size-3.5 shrink-0" /> : a.estado === 'pausado' ? <Pause className="mt-0.5 size-3.5 shrink-0" /> : a.estado === 'error' ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-400" /> : <span className="mt-0.5 size-3.5 shrink-0" />}
          <span className="min-w-0 flex-1">{a.tarea || '—'}</span>
          {trabajando && <span className="mt-1 flex shrink-0 gap-0.5"><i className="ag-punto size-1 rounded-full bg-emerald-300" /><i className="ag-punto size-1 rounded-full bg-emerald-300" /><i className="ag-punto size-1 rounded-full bg-emerald-300" /></span>}
        </div>
        {trabajando && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="ag-progreso h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(4, a.progreso)}%`, backgroundColor: f.acento }} />
          </div>
        )}
      </div>
      <Persona a={a} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">{a.nombre}</h3>
          <p className="truncate text-[11px] text-gray-500" title={a.rol}>{a.rol}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${e.clase}`}>{e.texto}</span>
          <p className="mt-1 text-[10px] text-gray-600">{hace(a.actualizado_at)}</p>
        </div>
      </div>
    </article>
  );
}

export default function OficinaAgentes({ agentes }: { agentes: EstadoAgente[] }) {
  return (
    <div className="ag-escena">
      <style>{ESTILOS}</style>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {agentes.map(a => <Escritorio key={a.agente} a={a} />)}
      </div>
    </div>
  );
}
