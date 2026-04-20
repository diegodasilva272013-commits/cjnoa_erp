import { useState } from 'react';
import { Sparkles, Loader2, X, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';

interface AnalisisResult {
  resumen?: string;
  proximos_pasos?: string[];
  riesgos?: string[];
  score?: number;
  justificacion?: string;
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

  async function analizar() {
    setLoading(true);
    setError(null);
    setResult(null);
    setOpen(true);
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
    } catch (err: any) {
      setError(err.message || 'Error al consultar la IA');
    } finally {
      setLoading(false);
    }
  }

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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !loading && setOpen(false)}>
          <div className="w-full max-w-lg glass-panel rounded-2xl border border-white/[0.08] shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-white">Copiloto IA</h3>
              </div>
              {!loading && (
                <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Content */}
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {loading && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
                  <p className="text-sm text-gray-400">Analizando con GPT-4o mini...</p>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {result && (
                <div className="space-y-4">
                  {/* Score */}
                  {result.score !== undefined && (
                    <div className="flex items-center gap-4 p-4 bg-white/[0.03] rounded-xl border border-white/[0.06]">
                      <div className={`text-3xl font-bold ${result.score >= 70 ? 'text-emerald-400' : result.score >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                        {result.score}%
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Score calculado por IA</p>
                        <p className="text-sm text-gray-300">{result.justificacion}</p>
                      </div>
                    </div>
                  )}

                  {/* Resumen */}
                  {result.resumen && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Diagnóstico</p>
                      <p className="text-sm text-gray-300 leading-relaxed">{result.resumen}</p>
                    </div>
                  )}

                  {/* Próximos pasos */}
                  {result.proximos_pasos && result.proximos_pasos.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Próximos pasos</p>
                      <ol className="space-y-2">
                        {result.proximos_pasos.map((paso, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            <span className="text-sm text-gray-300">{paso}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Riesgos */}
                  {result.riesgos && result.riesgos.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Puntos de atención</p>
                      <ul className="space-y-2">
                        {result.riesgos.map((r, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-amber-400/90">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <button
                    onClick={analizar}
                    className="w-full mt-2 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center justify-center gap-1"
                  >
                    <ChevronRight className="w-3 h-3" /> Regenerar análisis
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
