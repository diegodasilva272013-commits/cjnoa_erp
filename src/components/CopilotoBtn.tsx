import { useState, useRef } from 'react';
import { Sparkles, Loader2, X, AlertTriangle, RotateCcw, Volume2, VolumeX, ChevronRight, CheckCircle2 } from 'lucide-react';

interface AnalisisResult {
  resumen?: string;
  proximos_pasos?: string[];
  riesgos?: string[];
  score?: number;
  justificacion?: string;
  ultimos_avances?: string[];
  alertas?: string[];
}

interface CopilotoProps {
  tipo: 'analizar_caso' | 'analizar_previsional' | 'calcular_score';
  datos: Record<string, unknown>;
  label?: string;
}

export default function CopilotoBtn({ tipo, datos, label }: CopilotoProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalisisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  async function analizar() {
    setLoading(true);
    setError(null);
    setResult(null);
    setOpen(true);
    stopSpeech();
    try {
      const res = await fetch('/api/copiloto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, datos }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Error del servidor');
      }
      const data = await res.json();
      setResult(data);
      startSpeech(data);
    } catch (err: any) {
      setError(err.message || 'Error al consultar la IA');
    } finally {
      setLoading(false);
    }
  }

  function buildSpeechText(r: AnalisisResult): string {
    const parts: string[] = [];
    if (r.resumen) parts.push(`Diagnóstico. ${r.resumen}`);
    if (r.proximos_pasos?.length) parts.push(`Próximos pasos. ${r.proximos_pasos.join('. ')}`);
    if (r.riesgos?.length) parts.push(`Puntos de atención. ${r.riesgos.join('. ')}`);
    if (r.alertas?.length) parts.push(`Alertas. ${r.alertas.join('. ')}`);
    return parts.join('. ');
  }

  function startSpeech(r: AnalisisResult) {
    stopSpeech();
    const text = buildSpeechText(r);
    if (!text) return;
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'es-AR';
    utt.rate = 0.92;
    utt.pitch = 1;
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    synthRef.current = utt;
    window.speechSynthesis.speak(utt);
    setSpeaking(true);
  }

  function toggleSpeech() {
    if (speaking) { stopSpeech(); return; }
    if (result) startSpeech(result);
  }

  function stopSpeech() {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }

  function handleClose() {
    if (loading) return;
    stopSpeech();
    setOpen(false);
  }

  const scoreColor = result?.score !== undefined
    ? result.score >= 70 ? '#34d399' : result.score >= 40 ? '#fbbf24' : '#f87171'
    : '#a78bfa';

  return (
    <>
      <button
        onClick={analizar}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 rounded-xl text-xs text-violet-300 font-medium transition-colors disabled:opacity-50"
        title="Analizar con IA"
      >
        <Sparkles className="w-3.5 h-3.5" />
        {label || 'Copiloto IA'}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
          onClick={handleClose}
        >
          <div
            className="w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: '#0f0f1a', border: '1px solid rgba(139,92,246,0.25)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header con gradiente */}
            <div style={{ background: 'linear-gradient(135deg,rgba(109,40,217,0.6),rgba(79,70,229,0.3),rgba(15,15,26,0))', borderBottom: '1px solid rgba(139,92,246,0.15)' }}
              className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', boxShadow: '0 0 20px rgba(124,58,237,0.4)' }}>
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Copiloto IA</h3>
                  <p className="text-[10px] text-violet-400/70">Análisis previsional · GPT-4o mini</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {result && (
                  <button
                    onClick={toggleSpeech}
                    title={speaking ? 'Detener lectura' : 'Leer análisis en voz alta'}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={speaking
                      ? { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }
                      : { background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' }}
                  >
                    {speaking ? <><VolumeX className="w-3.5 h-3.5" /> Detener</> : <><Volume2 className="w-3.5 h-3.5" /> Escuchar</>}
                  </button>
                )}
                {!loading && (
                  <button onClick={handleClose}
                    className="p-2 rounded-lg text-gray-500 hover:text-white transition-colors"
                    style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 max-h-[68vh] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(139,92,246,0.3) transparent' }}>

              {loading && (
                <div className="flex flex-col items-center gap-4 py-10">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg,rgba(109,40,217,0.3),rgba(79,70,229,0.2))', border: '1px solid rgba(139,92,246,0.3)' }}>
                      <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
                    </div>
                    <div className="absolute inset-0 rounded-2xl animate-pulse"
                      style={{ background: 'radial-gradient(circle,rgba(124,58,237,0.2),transparent 70%)' }} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-white">Analizando con IA...</p>
                    <p className="text-xs text-gray-500 mt-1">Procesando datos del cliente</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-3 p-4 rounded-xl"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-400">Error</p>
                    <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
                  </div>
                </div>
              )}

              {result && (
                <div className="space-y-4">
                  {/* Score */}
                  {result.score !== undefined && (
                    <div className="p-4 rounded-xl flex items-center gap-4"
                      style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${scoreColor}30` }}>
                      <div className="relative w-16 h-16 shrink-0">
                        <svg viewBox="0 0 60 60" className="w-16 h-16 -rotate-90">
                          <circle cx="30" cy="30" r="24" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                          <circle cx="30" cy="30" r="24" fill="none" stroke={scoreColor} strokeWidth="6"
                            strokeDasharray={2 * Math.PI * 24}
                            strokeDashoffset={2 * Math.PI * 24 * (1 - (result.score || 0) / 100)}
                            strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${scoreColor}88)` }} />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-sm font-black" style={{ color: scoreColor }}>{result.score}%</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Probabilidad de éxito</p>
                        <p className="text-sm text-gray-200 leading-snug">{result.justificacion}</p>
                      </div>
                    </div>
                  )}

                  {/* Resumen */}
                  {result.resumen && (
                    <div className="p-4 rounded-xl" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
                      <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest mb-2">Diagnóstico</p>
                      <p className="text-sm text-gray-200 leading-relaxed">{result.resumen}</p>
                    </div>
                  )}

                  {/* Próximos pasos */}
                  {result.proximos_pasos && result.proximos_pasos.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Próximos pasos</p>
                      <div className="space-y-2">
                        {result.proximos_pasos.map((paso, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 rounded-xl"
                            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center mt-0.5"
                              style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)' }}>
                              <span className="text-[10px] font-black text-violet-400">{i + 1}</span>
                            </div>
                            <span className="text-sm text-gray-300 leading-snug">{paso}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Últimos avances */}
                  {result.ultimos_avances && result.ultimos_avances.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Últimos avances</p>
                      <div className="space-y-2">
                        {result.ultimos_avances.map((av, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500/60 shrink-0 mt-0.5" />
                            <span className="text-sm text-gray-400">{av}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Riesgos / Alertas */}
                  {((result.riesgos?.length ?? 0) > 0 || (result.alertas?.length ?? 0) > 0) && (
                    <div className="p-4 rounded-xl" style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)' }}>
                      <p className="text-[10px] font-bold text-amber-400/80 uppercase tracking-widest mb-3">Puntos de atención</p>
                      <div className="space-y-2">
                        {[...(result.riesgos ?? []), ...(result.alertas ?? [])].map((r, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400/70 shrink-0 mt-0.5" />
                            <span className="text-sm text-amber-300/80">{r}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Regenerar */}
                  <button onClick={analizar}
                    className="w-full py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-colors"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#d1d5db')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#6b7280')}
                  >
                    <RotateCcw className="w-3 h-3" /> Regenerar análisis
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
