import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Global keyboard shortcuts:
 * - Ctrl+K / Cmd+K → Search (handled by CommandPalette)
 * - Ctrl+1..7 → Navigate to pages
 * - Escape → Already handled by modals
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Ctrl+number for quick navigation
      if (e.ctrlKey || e.metaKey) {
        const routes: Record<string, string> = {
          '1': '/',
          '2': '/casos-trabajo',
          '3': '/ingresos',
          '4': '/egresos',
          '5': '/flujo-caja',
          '6': '/equipo',
          '7': '/agenda',
        };
        if (routes[e.key]) {
          e.preventDefault();
          if (location.pathname !== routes[e.key]) {
            navigate(routes[e.key]);
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, location.pathname]);
}
