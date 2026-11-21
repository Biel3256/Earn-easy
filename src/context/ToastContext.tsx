import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastPayload {
  type: ToastType;
  title?: string;
  message: string;
  durationMs?: number;
}

interface ToastItem extends ToastPayload {
  id: string;
}

interface ToastContextValue {
  showToast: (toast: ToastPayload) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast deve ser usado dentro de ToastProvider');
  }
  return ctx;
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, title, message, durationMs = 4500 }: ToastPayload) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, type, title, message, durationMs }]);

      const timer = window.setTimeout(() => {
        dismissToast(id);
      }, Math.max(1800, durationMs));
      timersRef.current.set(id, timer);
    },
    [dismissToast]
  );

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed top-16 right-3 sm:right-5 z-[90] flex flex-col gap-2.5 w-[calc(100vw-24px)] max-w-sm pointer-events-none"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const isSuccess = toast.type === 'success';
            const isError = toast.type === 'error';
            const Icon = isSuccess ? CheckCircle2 : isError ? AlertCircle : Info;

            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: -12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-xl flex items-start gap-3 ${
                  isSuccess
                    ? 'bg-white/95 dark:bg-[#0d1912]/95 border-emerald-300 dark:border-lime-400/50 text-slate-900 dark:text-zinc-100'
                    : isError
                      ? 'bg-white/95 dark:bg-[#1b0e11]/95 border-red-300 dark:border-red-500/50 text-slate-900 dark:text-zinc-100'
                      : 'bg-white/95 dark:bg-[#0e1319]/95 border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-zinc-100'
                }`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    isSuccess
                      ? 'text-emerald-600 dark:text-lime-400'
                      : isError
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-sky-600 dark:text-sky-400'
                  }`}
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  {toast.title && (
                    <div className="text-xs font-extrabold leading-tight">{toast.title}</div>
                  )}
                  <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed break-words">
                    {toast.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  aria-label="Fechar notificação"
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 shrink-0 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
