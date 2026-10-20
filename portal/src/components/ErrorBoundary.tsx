import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Atrapa los errores al dibujar una pantalla para que no quede en blanco todo
 * el portal. App.tsx lo monta con `key` = ruta: al navegar a otra página se
 * crea de nuevo y se recupera solo. Los errores de chunk que lazyConRecarga
 * relanza (tras ya haber recargado una vez) también caen aquí.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error al mostrar la pantalla:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 text-center text-sm">
        <h1 className="text-lg font-bold">Algo salió mal al mostrar esta pantalla</h1>
        <p className="opacity-70">Recarga la página para intentarlo de nuevo. Si vuelve a pasar, avísale a un administrador.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-brand-500 px-5 py-2 font-semibold text-white hover:bg-brand-600 dark:bg-brand-400 dark:text-slate-950"
        >
          Recargar
        </button>
      </div>
    );
  }
}
