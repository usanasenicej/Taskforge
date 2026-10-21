import { AlertCircle, Bell, CheckCircle2, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Tone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  title: string;
  body?: string;
  tone: Tone;
  action?: { label: string; onClick: () => void };
}

type ToastInput = Omit<ToastItem, "id" | "tone"> & { tone?: Tone };

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Bell };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((current) => current.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-3), { tone: "info", ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.tone === "error" ? 6000 : 4200);
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toasts" aria-live="polite">
          {items.map((toast) => {
            const Icon = ICONS[toast.tone];
            return (
              <div className={`toast ${toast.tone}`} key={toast.id}>
                <Icon size={18} className="toast-icon" />
                <div className="toast-text">
                  <strong>{toast.title}</strong>
                  {toast.body && <span>{toast.body}</span>}
                </div>
                {toast.action && (
                  <button
                    className="toast-action"
                    type="button"
                    onClick={() => {
                      toast.action?.onClick();
                      dismiss(toast.id);
                    }}
                  >
                    {toast.action.label}
                  </button>
                )}
                <button className="toast-close" type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
