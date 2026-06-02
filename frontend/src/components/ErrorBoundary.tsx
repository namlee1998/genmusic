import React, { Component, ErrorInfo, ReactNode } from 'react';
import i18n from 'i18next';
import { AlertOctagon, RotateCcw, Home, Terminal } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/sdlc';
  };

  public render() {
    if (this.state.hasError) {
      const isEnglish = (i18n.language || 'vi').startsWith('en');
      const isDev = import.meta.env.DEV;

      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-900 text-slate-100 selection:bg-rose-500/30">
          {/* Decorative background grid and glowing circles */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none opacity-40" />
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-rose-500/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />

          {/* Error card */}
          <div className="relative w-full max-w-2xl backdrop-blur-xl bg-slate-950/60 border border-slate-800/80 rounded-2xl shadow-2xl overflow-hidden p-8 md:p-10 flex flex-col items-center text-center">
            {/* Header Icon */}
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center mb-6 text-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.1)]">
              <AlertOctagon className="w-8 h-8 animate-pulse" />
            </div>

            {/* Error Message */}
            <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-rose-400 via-orange-400 to-amber-300 mb-4 font-headline">
              {isEnglish ? 'Application Runtime Error' : 'Lỗi Thực Thi Hệ Thống'}
            </h1>
            <p className="text-slate-400 max-w-md text-sm md:text-base mb-8">
              {isEnglish
                ? 'An unexpected crash occurred in the application view rendering. You can try refreshing the page or navigating back.'
                : 'Đã xảy ra lỗi ngoài ý muốn trong quá trình kết xuất giao diện. Bạn có thể thử tải lại trang hoặc quay lại trang chính.'}
            </p>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4 w-full justify-center mb-8">
              <button
                onClick={this.handleReload}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 font-bold transition-all shadow-lg shadow-rose-950/30 hover:scale-[1.02] active:scale-[0.98]"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{isEnglish ? 'Reload Application' : 'Tải Lại Ứng Dụng'}</span>
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800/80 font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Home className="w-4 h-4 text-slate-400" />
                <span>{isEnglish ? 'Go to Dashboard' : 'Về Trang Dashboard'}</span>
              </button>
            </div>

            {/* Tech details (Dev-only / Collapsible) */}
            {this.state.error && (
              <div className="w-full text-left bg-slate-950 border border-slate-800/60 rounded-xl overflow-hidden">
                <details className="group">
                  <summary className="flex items-center justify-between px-4 py-3 bg-slate-900/50 cursor-pointer select-none text-slate-400 hover:text-slate-200 transition-colors text-xs font-semibold">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-3.5 h-3.5 text-blue-400" />
                      <span>{isEnglish ? 'TECHNICAL ERROR LOG' : 'MÃ LỖI KỸ THUẬT'}</span>
                    </div>
                    <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 group-open:hidden">
                      {isEnglish ? 'Show' : 'Hiện'}
                    </span>
                    <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 hidden group-open:inline">
                      {isEnglish ? 'Hide' : 'Ẩn'}
                    </span>
                  </summary>
                  <div className="p-4 text-xs font-mono text-rose-400 border-t border-slate-900/60 overflow-x-auto max-h-60 leading-relaxed bg-slate-950/40">
                    <p className="font-bold text-rose-300 mb-2">
                      {this.state.error.toString()}
                    </p>
                    {isDev && this.state.errorInfo?.componentStack && (
                      <pre className="text-slate-500 whitespace-pre text-[10px] mt-2">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    )}
                  </div>
                </details>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
