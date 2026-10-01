'use client';

import * as React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  title?: string;
  message: string;
}

interface ToastContextType {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
  toast: {
    success: (message: string, title?: string) => void;
    error: (message: string, title?: string) => void;
    info: (message: string, title?: string) => void;
  };
}

const ToastContext = React.createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = React.useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => removeToast(id), 4000);
    },
    [removeToast],
  );

  const toast = React.useMemo(
    () => ({
      success: (message: string, title?: string) =>
        addToast({ type: 'success', message, title }),
      error: (message: string, title?: string) =>
        addToast({ type: 'error', message, title }),
      info: (message: string, title?: string) =>
        addToast({ type: 'info', message, title }),
    }),
    [addToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 p-4 rounded-lg shadow-lg border text-sm transition-all animate-in slide-in-from-bottom-2',
              t.type === 'success' && 'bg-card border-green-500/30 text-card-foreground',
              t.type === 'error' && 'bg-card border-destructive/40 text-card-foreground',
              t.type === 'info' && 'bg-card border-primary/30 text-card-foreground',
            )}
          >
            {t.type === 'success' && <CheckCircle2 className="size-5 text-emerald-500 shrink-0 mt-0.5" />}
            {t.type === 'error' && <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />}
            {t.type === 'info' && <Info className="size-5 text-primary shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              {t.title && <h4 className="font-semibold text-sm leading-tight mb-1">{t.title}</h4>}
              <p className="text-xs text-muted-foreground leading-relaxed">{t.message}</p>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    // Graceful fallback for components outside provider
    return {
      toast: {
        success: (msg: string) => console.log('[Toast Success]', msg),
        error: (msg: string) => console.error('[Toast Error]', msg),
        info: (msg: string) => console.info('[Toast Info]', msg),
      },
    };
  }
  return { toast: context.toast };
}
