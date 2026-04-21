import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { usePermisos } from './hooks/usePermisos';

const Layout = lazy(() => import('./components/Layout'));
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Cases = lazy(() => import('./pages/Cases'));
const Ingresos = lazy(() => import('./pages/Ingresos'));
const Egresos = lazy(() => import('./pages/Egresos'));
const FlujoCaja = lazy(() => import('./pages/FlujoCaja'));
const Equipo = lazy(() => import('./pages/Equipo'));
const Agenda = lazy(() => import('./pages/Agenda'));
const FichasClientes = lazy(() => import('./pages/FichasClientes'));
const Seguimiento = lazy(() => import('./pages/Seguimiento'));
const PrevisionalCharts = lazy(() => import('./pages/PrevisionalCharts'));
const MiPanel = lazy(() => import('./pages/MiPanel'));
const Perfil = lazy(() => import('./pages/Perfil'));
const Timeline = lazy(() => import('./pages/Timeline'));
const Tareas = lazy(() => import('./pages/Tareas'));
const Audiencias = lazy(() => import('./pages/Audiencias'));
const Honorarios = lazy(() => import('./pages/Honorarios'));
const CargosHora = lazy(() => import('./pages/CargosHora'));

function ProtectedRoute({ modulo, children }: { modulo: 'dashboard' | 'casos' | 'finanzas' | 'equipo' | 'agenda' | 'previsional' | 'honorarios'; children: React.ReactNode }) {
  const { canSee } = usePermisos();
  if (!canSee(modulo)) return <Navigate to="/casos" replace />;
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
          <Route path="/casos" element={<Cases />} />
          <Route path="/tareas" element={<Tareas />} />
          <Route path="/audiencias" element={<Audiencias />} />
          <Route path="/cargos-hora" element={<CargosHora />} />
          <Route path="/honorarios" element={<ProtectedRoute modulo="honorarios"><Honorarios /></ProtectedRoute>} />
          <Route path="/ingresos" element={<ProtectedRoute modulo="finanzas"><Ingresos /></ProtectedRoute>} />
          <Route path="/egresos" element={<ProtectedRoute modulo="finanzas"><Egresos /></ProtectedRoute>} />
          <Route path="/flujo-caja" element={<ProtectedRoute modulo="finanzas"><FlujoCaja /></ProtectedRoute>} />
          <Route path="/equipo" element={<ProtectedRoute modulo="equipo"><Equipo /></ProtectedRoute>} />
          <Route path="/agenda" element={<ProtectedRoute modulo="agenda"><Agenda /></ProtectedRoute>} />
          <Route path="/previsional/fichas" element={<ProtectedRoute modulo="previsional"><FichasClientes /></ProtectedRoute>} />
          <Route path="/previsional/seguimiento" element={<ProtectedRoute modulo="previsional"><Seguimiento /></ProtectedRoute>} />
          <Route path="/previsional/dashboard" element={<ProtectedRoute modulo="previsional"><PrevisionalCharts /></ProtectedRoute>} />
          <Route path="/previsional/mi-panel" element={<ProtectedRoute modulo="previsional"><MiPanel /></ProtectedRoute>} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="*" element={<Navigate to="/casos" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
