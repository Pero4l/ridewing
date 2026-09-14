"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckIcon, InfoIcon, XIcon } from "./icons";

type ToastKind = "success" | "error" | "info";

type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
};

type ToastContextValue = {
  toast: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const KIND_STYLES: Record<ToastKind, { icon: ReactNode; bar: string }> = {
  success: { icon: <CheckIcon size={16} />, bar: "bg-emerald-500" },
  error: { icon: <XIcon size={16} />, bar: "bg-red-500" },
  info: { icon: <InfoIcon size={16} />, bar: "bg-sky-500" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list, { id, kind, message }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  const value: ToastContextValue = {
    toast,
    success: (message) => toast(message, "success"),
    error: (message) => toast(message, "error"),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex w-auto max-w-sm items-center gap-2.5 overflow-hidden rounded-lg border border-zinc-200 bg-white py-2 pl-3 pr-4 text-sm text-zinc-800 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <span className={`-ml-3 -mr-1 self-stretch w-1 ${KIND_STYLES[t.kind].bar}`} />
            <span className="text-zinc-400">{KIND_STYLES[t.kind].icon}</span>
            <span className="min-w-0">{t.message}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
              <XIcon size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used within ToastProvider");
  return value;
}