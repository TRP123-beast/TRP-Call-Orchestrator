import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';
interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const COLORS: Record<ToastType, string> = {
  success: 'text-trp-success',
  error: 'text-trp-error',
  warning: 'text-trp-warning',
  info: 'text-trp-accent',
};

const ToastContext = createContext<(t: { type: ToastType; message: string }) => void>(() => {});

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((t: { type: ToastType; message: string }) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, ...t }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 5000);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((x) => x.id !== id));

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => {
          const Icon = ICONS[t.type];
          return (
            <div
              key={t.id}
              className="animate-trp-fade-in pointer-events-auto flex items-start gap-2.5 rounded-xl border border-trp-border bg-trp-surface p-3 shadow-lg"
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${COLORS[t.type]}`} />
              <p className="flex-1 text-sm text-trp-text">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="text-trp-muted transition hover:text-trp-text"
                aria-label="Dismiss"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
