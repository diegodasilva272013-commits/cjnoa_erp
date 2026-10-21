/** Ilustración de Noa, el asistente de WhatsApp del estudio: una persona con auricular en un círculo con brillo y mensajes que flotan. */
const ESTILOS = `
@keyframes nw-flota { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
@keyframes nw-pulso { 0% { transform: scale(.92); opacity: .55 } 70% { transform: scale(1.12); opacity: 0 } 100% { transform: scale(1.12); opacity: 0 } }
@keyframes nw-parpadeo { 0%,92%,100% { transform: scaleY(1) } 95% { transform: scaleY(.1) } }
@keyframes nw-escribe { 0%,80%,100% { opacity: .25 } 40% { opacity: 1 } }
.nw-flota { animation: nw-flota 4.2s ease-in-out infinite; }
.nw-flota-2 { animation: nw-flota 5.4s ease-in-out infinite .8s; }
.nw-flota-3 { animation: nw-flota 4.8s ease-in-out infinite 1.6s; }
.nw-pulso { animation: nw-pulso 2.6s ease-out infinite; transform-origin: center; transform-box: fill-box; }
.nw-ojos { animation: nw-parpadeo 5s infinite; transform-origin: center; transform-box: fill-box; }
.nw-punto { animation: nw-escribe 1.2s infinite; }
.nw-punto:nth-of-type(2) { animation-delay: .2s }
.nw-punto:nth-of-type(3) { animation-delay: .4s }
@media (prefers-reduced-motion: reduce) { .nw-avatar *, .nw-avatar { animation: none !important; } }
`;

export default function AgenteAvatar({ activo = true, tam = 220 }: { activo?: boolean; tam?: number }) {
  return (
    <div className="nw-avatar relative shrink-0" style={{ width: tam, height: tam }} role="img" aria-label="Noa, asistente de WhatsApp">
      <style>{ESTILOS}</style>
      <svg viewBox="0 0 240 240" width={tam} height={tam}>
        <defs>
          <radialGradient id="nw-fondo" cx="50%" cy="38%" r="70%"><stop offset="0%" stopColor="#1f6f5b" /><stop offset="55%" stopColor="#0f3d3a" /><stop offset="100%" stopColor="#08201f" /></radialGradient>
          <linearGradient id="nw-aro" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#34d399" /><stop offset="100%" stopColor="#38bdf8" /></linearGradient>
          <linearGradient id="nw-blazer" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1e3a5f" /><stop offset="100%" stopColor="#0f2238" /></linearGradient>
          <clipPath id="nw-recorte"><circle cx="120" cy="120" r="96" /></clipPath>
        </defs>
        {activo && <circle className="nw-pulso" cx="120" cy="120" r="100" fill="none" stroke="#34d399" strokeWidth="3" />}
        <circle cx="120" cy="120" r="104" fill="none" stroke="url(#nw-aro)" strokeWidth="3.5" opacity=".9" />
        <circle cx="120" cy="120" r="96" fill="url(#nw-fondo)" />
        <g clipPath="url(#nw-recorte)">
          {/* hombros y saco */}
          <path d="M28 240 Q32 176 78 166 L162 166 Q208 176 212 240 Z" fill="url(#nw-blazer)" />
          <path d="M104 168 L120 206 L136 168 Z" fill="#f4f1ea" />
          <path d="M104 168 L120 206 L112 170 Z" fill="#dcd6c8" />
          {/* cuello y cara */}
          <rect x="107" y="146" width="26" height="26" rx="10" fill="#e9b98e" />
          <ellipse cx="120" cy="112" rx="38" ry="44" fill="#f2c9a0" />
          {/* pelo */}
          <path d="M80 112 Q74 60 120 56 Q168 60 160 112 Q156 84 138 78 Q112 90 92 80 Q84 92 80 112 Z" fill="#3b2a24" />
          <path d="M80 108 Q76 134 88 150 Q82 126 86 102 Z" fill="#3b2a24" />
          <path d="M160 108 Q164 134 152 150 Q158 126 154 102 Z" fill="#3b2a24" />
          {/* ojos y sonrisa */}
          <g className="nw-ojos"><ellipse cx="106" cy="114" rx="3.6" ry="4.4" fill="#22181a" /><ellipse cx="134" cy="114" rx="3.6" ry="4.4" fill="#22181a" /></g>
          <circle cx="107.2" cy="112.6" r="1.1" fill="#fff" /><circle cx="135.2" cy="112.6" r="1.1" fill="#fff" />
          <path d="M104 100 Q108 97 113 99 M127 99 Q132 97 136 100" stroke="#3b2a24" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M108 130 Q120 140 132 130" stroke="#b5524a" strokeWidth="3" fill="none" strokeLinecap="round" />
          <ellipse cx="97" cy="126" rx="6" ry="3.4" fill="#f08a7e" opacity=".35" /><ellipse cx="143" cy="126" rx="6" ry="3.4" fill="#f08a7e" opacity=".35" />
          {/* auricular */}
          <path d="M78 110 Q76 70 120 66 Q164 70 162 110" fill="none" stroke="#e5e7eb" strokeWidth="5" strokeLinecap="round" />
          <rect x="70" y="104" width="14" height="28" rx="7" fill="#e5e7eb" /><rect x="156" y="104" width="14" height="28" rx="7" fill="#e5e7eb" />
          <path d="M76 130 Q84 152 106 148" fill="none" stroke="#e5e7eb" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="108" cy="148" r="4.4" fill="#34d399" />
        </g>
        {/* globos de WhatsApp que flotan */}
        <g className="nw-flota">
          <rect x="168" y="30" width="58" height="36" rx="14" fill="#25d366" />
          <path d="M176 64 L170 76 L186 66 Z" fill="#25d366" />
          <g fill="#fff"><circle className="nw-punto" cx="184" cy="48" r="3.4" /><circle className="nw-punto" cx="197" cy="48" r="3.4" /><circle className="nw-punto" cx="210" cy="48" r="3.4" /></g>
        </g>
        <g className="nw-flota-2">
          <rect x="10" y="62" width="52" height="32" rx="13" fill="#f8fafc" />
          <path d="M52 92 L60 104 L44 94 Z" fill="#f8fafc" />
          <rect x="20" y="72" width="30" height="4.5" rx="2.2" fill="#94a3b8" /><rect x="20" y="82" width="20" height="4.5" rx="2.2" fill="#cbd5e1" />
        </g>
        <g className="nw-flota-3">
          <circle cx="206" cy="168" r="17" fill="#0ea5e9" />
          <path d="M198 168 l6 6 l11 -12" stroke="#fff" strokeWidth="3.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  );
}
