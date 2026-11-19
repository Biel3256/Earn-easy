import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  details: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
      details: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    let message = error.message || 'Erro inesperado na aplicação.';
    let details: string | null = null;

    try {
      const parsed = JSON.parse(error.message);
      if (parsed && parsed.error && parsed.operationType) {
        message = `Permissão ou operação bloqueada (${parsed.operationType} em ${parsed.path || 'coleção'}).`;
        details = parsed.error;
      }
    } catch {
      // Plain error message
    }

    return { hasError: true, message, details };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary captured error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-8">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="text-lg font-bold text-slate-900">Ops, ocorreu uma verificação de segurança ou falha de leitura</h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">{this.state.message}</p>
            {this.state.details && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-5 font-mono text-xs text-slate-700 break-words">
                {this.state.details}
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Recarregar Earn Easy
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
