import { Component, ErrorInfo, ReactNode } from 'react';
import { loggerService } from '../services/logger.service';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error | any): State {
    // Ensure we have a proper Error object
    const errorObj = error instanceof Error 
      ? error 
      : new Error(String(error || 'Unknown error'));
    
    return { hasError: true, error: errorObj };
  }

  public componentDidCatch(error: Error | any, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    
    // Ensure we have a proper Error object for logging
    const errorObj = error instanceof Error 
      ? error 
      : new Error(String(error || 'Unknown error'));
    
    loggerService.logError(errorObj, {
      componentStack: errorInfo.componentStack
    }).catch(console.error);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 p-8 max-w-md w-full">
            <div className="flex items-center space-x-3 mb-4">
              <div className="bg-red-500/20 p-3 rounded-lg border border-red-500/30">
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Something went wrong</h2>
                <p className="text-sm text-slate-400">We've logged this error and will fix it</p>
              </div>
            </div>

            {this.state.error && (
              <div className="bg-slate-900/50 p-4 rounded-lg mb-4 border border-slate-700">
                <p className="text-sm text-slate-300 font-mono">
                  {this.state.error.message || String(this.state.error) || 'Unknown error occurred'}
                </p>
              </div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={this.handleRetry}
                className="flex-1 btn-secondary"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 btn-primary"
              >
                Reload Page
              </button>
            </div>

            <p className="text-xs text-slate-400 text-center mt-4">
              If this problem persists, please contact support
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
