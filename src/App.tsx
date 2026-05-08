import { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { usePermisos } from './hooks/usePermisos';
import { lazyWithRetry } from './lib/lazyWithRetry';

const Layout = lazyWithRetry(() => import('./components/Layout'));
const Login = lazyWithRetry(() => import('./pages/Login'));
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const Cases = lazyWithRetry(() => import('./pages/Cases'));
const CasosGenerales = lazyWithRetry(() => import('./pages/CasosGenerales'));
const CasosFederales = lazyWithRetry(() => import('./pages/CasosFederales'));
const AgendamientoConsultas = lazyWithRetry(() => import('./pages/AgendamientoConsultas'));
const CasosPagos = lazyWithRetry(() => import('./pages/CasosPagos'));
const Ingresos = lazyWithRetry(() => import('./pages/Ingresos'));
const Egresos = lazyWithRetry(() => import('./pages/Egresos'));
const FlujoCaja = lazyWithRetry(() => import('./pages/FlujoCaja'));
const Cambios = lazyWithRetry(() => import('./pages/Cambios'));
const Historial = lazyWithRetry(() => import('./pages/Historial'));
const Equipo = lazyWithRetry(() => import('./pages/Equipo'));
const Agenda = lazyWithRetry(() => import('./pages/Agenda'));
const FichasClientes = lazyWithRetry(() => import('./pages/FichasClientes'));
const Seguimiento = lazyWithRetry(() => import('./pages/Seguimiento'));
const PrevisionalCharts = lazyWithRetry(() => import('./pages/PrevisionalCharts'));
const MiPanel = lazyWithRetry(() => import('./pages/MiPanel'));
const Perfil = lazyWithRetry(() => import('./pages/Perfil'));
const Timeline = lazyWithRetry(() => import('./pages/Timeline'));
const Tareas = lazyWithRetry(() => import('./pages/Tareas'));
const Audiencias = lazyWithRetry(() => import('./pages/Audiencias'));
const Calendario = lazyWithRetry(() => import('./pages/Calendario'));
const Honorarios = lazyWithRetry(() => import('./pages/Honorarios'));
const CargosHora = lazyWithRetry(() => import('./pages/CargosHora'));
const ControlTareas = lazyWithRetry(() => import('./pages/ControlTareas'));
const MiDia = lazyWithRetry(() => import('./pages/MiDia'));
const Chat = lazyWithRetry(() => import('./pages/Chat'));

function ProtectedRoute({ modulo, children }: { modulo: 'dashboard' | 'casos' | 'finanzas' | 'equipo' | 'agenda' | 'previsional' | 'honorarios'; children: React.ReactNode }) {
  const { canSee } = usePermisos();
  if (!canSee(modulo)) return <Navigate to="/casos-generales" replace />;
  return <>{children}</>;
}

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-transparent" />
        <p className="text-sm text-gray-500">Cargando modulo...</p>
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Conectando con el servidor...</p>
          <p className="text-gray-700 text-xs mt-2">Si tarda mucho, revisá la consola (F12)</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Login />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<ProtectedRoute modulo="dashboard"><Dashboard /></ProtectedRoute>} />
          <Route path="/casos" element={<Navigate to="/casos-generales" replace />} />
          <Route path="/casos-trabajo" element={<Navigate to="/casos-generales" replace />} />
          <Route path="/casos-generales" element={<CasosGenerales />} />
          <Route path="/casos-federales" element={<CasosFederales />} />
          <Route path="/agendamiento-consultas" element={<AgendamientoConsultas />} />
          <Route path="/casos-pagos" element={<CasosPagos />} />
          <Route path="/tareas" element={<Tareas />} />
          <Route path="/audiencias" element={<Audiencias />} />
          <Route path="/calendario" element={<Calendario />} />
          <Route path="/cargos-hora" element={<CargosHora />} />
          <Route path="/control-tareas" element={<ControlTareas />} />
          <Route path="/mi-dia" element={<MiDia />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/honorarios" element={<ProtectedRoute modulo="honorarios"><Honorarios /></ProtectedRoute>} />
          <Route path="/ingresos" element={<ProtectedRoute modulo="finanzas"><Ingresos /></ProtectedRoute>} />
          <Route path="/egresos" element={<ProtectedRoute modulo="finanzas"><Egresos /></ProtectedRoute>} />
          <Route path="/flujo-caja" element={<ProtectedRoute modulo="finanzas"><FlujoCaja /></ProtectedRoute>} />
          <Route path="/cambios" element={<ProtectedRoute modulo="finanzas"><Cambios /></ProtectedRoute>} />
          <Route path="/historial-finanzas" element={<ProtectedRoute modulo="finanzas"><Historial /></ProtectedRoute>} />
          <Route path="/equipo" element={<ProtectedRoute modulo="equipo"><Equipo /></ProtectedRoute>} />
          <Route path="/agenda" element={<ProtectedRoute modulo="agenda"><Agenda /></ProtectedRoute>} />
          <Route path="/previsional/fichas" element={<ProtectedRoute modulo="previsional"><FichasClientes /></ProtectedRoute>} />
          <Route path="/previsional/seguimiento" element={<ProtectedRoute modulo="previsional"><Seguimiento /></ProtectedRoute>} />
          <Route path="/previsional/dashboard" element={<ProtectedRoute modulo="previsional"><PrevisionalCharts /></ProtectedRoute>} />
          <Route path="/previsional/mi-panel" element={<ProtectedRoute modulo="previsional"><MiPanel /></ProtectedRoute>} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="*" element={<Navigate to="/casos-generales" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
