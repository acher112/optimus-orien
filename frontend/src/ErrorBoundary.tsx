import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
  actionSlot?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleResetSession = () => {
    try {
      // Clear pending plan flag and query caches
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('optimus_pending_plan_') || k.startsWith('query_cache')) {
          localStorage.removeItem(k);
        }
      });
    } catch {}
    window.location.href = '/app';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '60vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div style={{
            padding: '40px 32px',
            maxWidth: 580,
            width: '100%',
            background: 'var(--card-bg, #ffffff)',
            borderRadius: 16,
            border: '1px solid var(--border-color, #e2e8f0)',
            boxShadow: '0 20px 35px -10px rgba(0,0,0,0.08)',
            textAlign: 'center'
          }}>
            <div style={{
              width: 54,
              height: 54,
              borderRadius: '50%',
              background: '#fee2e2',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <AlertCircle size={28} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: '#991b1b' }}>
              {this.props.fallbackTitle || 'Unable to display this view'}
            </h2>
            <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.5, marginBottom: 24 }}>
              {this.state.error?.message || 'An unexpected error occurred while loading this view.'}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  if (this.props.onReset) this.props.onReset();
                  else window.location.reload();
                }}
              >
                <RefreshCw size={14} /> Try Again
              </button>
              {this.props.actionSlot}
              <button
                type="button"
                className="outline-btn"
                onClick={this.handleResetSession}
              >
                <RotateCcw size={14} /> Reset Session & Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
export default ErrorBoundary;
