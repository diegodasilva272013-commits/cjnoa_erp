import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, DollarSign, ArrowDownCircle, ArrowUpCircle, BarChart3, Shield, Calendar, LayoutDashboard, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SearchResult {
  id: string;
  type: 'caso' | 'ingreso' | 'egreso' | 'pagina' | 'previsional';
  title: string;
  subtitle: string;
  route: string;
}

const PAGES: SearchResult[] = [
  { id: 'p-dashboard', type: 'pagina', title: 'Panel de Control', subtitle: 'Dashboard principal', route: '/' },
  { id: 'p-casos', type: 'pagina', title: 'Casos', subtitle: 'Gestión de casos y clientes', route: '/casos' },
  { id: 'p-ingresos', type: 'pagina', title: 'Ingresos', subtitle: 'Módulo de ingresos', route: '/ingresos' },
  { id: 'p-egresos', type: 'pagina', title: 'Egresos', subtitle: 'Módulo de egresos', route: '/egresos' },
  { id: 'p-flujo', type: 'pagina', title: 'Flujo de Caja', subtitle: 'Resultado financiero', route: '/flujo-caja' },
  { id: 'p-equipo', type: 'pagina', title: 'Equipo', subtitle: 'Gestión de usuarios', route: '/equipo' },
  { id: 'p-agenda', type: 'pagina', title: 'Agenda', subtitle: 'Recordatorios y calendario', route: '/agenda' },
  { id: 'p-prev-fichas', type: 'pagina', title: 'Fichas Previsional', subtitle: 'Clientes previsionales', route: '/previsional/fichas' },
  { id: 'p-prev-seg', type: 'pagina', title: 'Seguimiento Previsional', subtitle: 'Tareas y audiencias', route: '/previsional/seguimiento' },
];

const ICONS: Record<string, React.ReactNode> = {
  caso: <Users className="w-4 h-4 text-blue-400" />,
  ingreso: <ArrowDownCircle className="w-4 h-4 text-emerald-400" />,
  egreso: <ArrowUpCircle className="w-4 h-4 text-rose-400" />,
  pagina: <LayoutDashboard className="w-4 h-4 text-gray-400" />,
  previsional: <FileText className="w-4 h-4 text-violet-400" />,
};

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Search
  const search = useCallback(async (q: string) => {
    const normalizedQuery = q.trim();

    if (!normalizedQuery) {
      setResults(PAGES);
      return;
    }

    setSearching(true);
    const lower = normalizedQuery.toLowerCase();
    const pageResults = PAGES.filter(p => p.title.toLowerCase().includes(lower) || p.subtitle.toLowerCase().includes(lower));

    if (normalizedQuery.length < 2) {
      setResults(pageResults);
      setSearching(false);
      return;
    }

    try {
      const [casosRes, ingresosRes, egresosRes, prevRes] = await Promise.all([
        supabase.from('casos_completos').select('id, nombre_apellido, materia, estado').ilike('nombre_apellido', `%${normalizedQuery}%`).limit(5),
        supabase.from('ingresos').select('id, cliente_nombre, concepto, monto_cj_noa').or(`cliente_nombre.ilike.%${normalizedQuery}%,concepto.ilike.%${normalizedQuery}%`).limit(5),
        supabase.from('egresos').select('id, concepto, concepto_detalle, monto').or(`concepto.ilike.%${normalizedQuery}%,concepto_detalle.ilike.%${normalizedQuery}%`).limit(5),
        supabase.from('clientes_previsional').select('id, apellido_nombre, pipeline, cuil').or(`apellido_nombre.ilike.%${normalizedQuery}%,cuil.ilike.%${normalizedQuery}%`).limit(5),
      ]);

      const casos: SearchResult[] = (casosRes.data || []).map(c => ({
        id: `c-${c.id}`,
        type: 'caso',
        title: c.nombre_apellido,
        subtitle: `${c.materia} · ${c.estado}`,
        route: '/casos',
      }));

      const ingresos: SearchResult[] = (ingresosRes.data || []).map(i => ({
        id: `i-${i.id}`,
        type: 'ingreso',
        title: i.cliente_nombre || i.concepto || 'Ingreso',
        subtitle: `$${Number(i.monto_cj_noa || 0).toLocaleString('es-AR')}`,
        route: '/ingresos',
      }));

      const egresos: SearchResult[] = (egresosRes.data || []).map(e => ({
        id: `e-${e.id}`,
        type: 'egreso',
        title: e.concepto,
        subtitle: e.concepto_detalle || `$${Number(e.monto || 0).toLocaleString('es-AR')}`,
        route: '/egresos',
      }));

      const previsional: SearchResult[] = (prevRes.data || []).map((c: any) => ({
        id: `prev-${c.id}`,
        type: 'previsional' as const,
        title: c.apellido_nombre,
        subtitle: `Previsional · ${c.pipeline || ''}${c.cuil ? ' · ' + c.cuil : ''}`,
        route: '/previsional/fichas',
      }));

      setResults([...pageResults, ...casos, ...ingresos, ...egresos, ...previsional]);
    } catch {
      setResults(pageResults);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => search(query), 200);
    return () => clearTimeout(timer);
  }, [query, search]);

  function handleSelect(result: SearchResult) {
    navigate(result.route);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(s => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(s => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && results[selected]) {
      handleSelect(results[selected]);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[8vh] sm:pt-[15vh] px-3 sm:px-0" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#141418] shadow-2xl shadow-black/50 animate-slide-up overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
          <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar casos, ingresos, egresos, paginas..."
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-500">
            ESC
          </kbd>
        </div>

        <div className="max-h-[320px] overflow-y-auto py-2">
          {searching && (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-gray-500">
              <div className="h-3 w-3 animate-spin rounded-full border border-white/20 border-t-transparent" />
              Buscando...
            </div>
          )}
          {!searching && results.length === 0 && query && (
            <p className="px-4 py-6 text-center text-sm text-gray-500">Sin resultados para "{query}"</p>
          )}
          {results.map((result, i) => (
            <button
              key={result.id}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setSelected(i)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                i === selected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
              }`}
            >
              <div className="p-1.5 rounded-lg bg-white/5">{ICONS[result.type]}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">{result.title}</p>
                <p className="text-xs text-gray-500 truncate">{result.subtitle}</p>
              </div>
              <span className="text-[10px] text-gray-600 uppercase">{result.type}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
