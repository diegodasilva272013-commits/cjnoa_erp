import { Component, ErrorInfo, ReactNode } from 'react';
import { tryRecoverChunkError } from '../lib/chunkRecovery';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  route: string;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
    route: '',
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled app error', error, errorInfo);
    const msg = error.message || String(error);
    // Chunk stale tras redeploy -> reload duro automatico con guard rearmable.
    if (tryRecoverChunkError(error)) {
      return;
    }
    this.setState({
      errorMessage: msg,
      route: typeof window !== 'undefined' ? window.location.pathname : '',
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-6">
          <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center shadow-2xl shadow-black/40">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400/80">Error</p>
            <h1 className="mt-3 text-2xl font-semibold text-white">La app se trabo</h1>
            <p className="mt-3 text-sm leading-6 text-gray-400">
              Recarga la pagina para volver al ultimo estado estable. Si vuelve a pasar, revisa la consola y avísame el modulo exacto.
            </p>
            {this.state.route && (
              <p className="mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-left text-xs text-gray-300">
                Ruta: <span className="text-white">{this.state.route}</span>
              </p>
            )}
            {this.state.errorMessage && (
              <p className="mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-left text-xs leading-5 text-red-200 break-words">
                Error: {this.state.errorMessage}
              </p>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-gray-200"
            >
              Recargar app
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}