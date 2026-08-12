/**
 * App-wide toasts.
 *
 * Kept in its own tiny store rather than in `useForge` so any component can
 * raise one without depending on the whole app state — and so a toast can
 * outlive the modal that caused it (a voice error must still be readable
 * after the sheet closes).
 */
import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastAction {
  label: string;
  /** Return true to keep the toast open; anything else dismisses it. */
  onClick: () => void | boolean;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
  /** ms; 0 means it stays until dismissed. */
  duration: number;
}

type ToastState = {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => number;
  dismiss: (id: number) => void;
  clear: () => void;
};

/** Errors linger; confirmations get out of the way. */
const DEFAULT_MS: Record<ToastKind, number> = {
  info: 4000,
  success: 3000,
  error: 7000,
};

/** More than a few stacked toasts is noise, and it buries the tab bar. */
const MAX_VISIBLE = 3;

let seq = 0;

export const useToast = create<ToastState>((set) => ({
  toasts: [],

  push({ kind, message, action, duration }) {
    const id = ++seq;
    const toast: Toast = {
      id,
      kind,
      message,
      action,
      duration: duration ?? DEFAULT_MS[kind],
    };
    set((s) => {
      // Repeating the same message stacks noise — replace instead.
      const deduped = s.toasts.filter((t) => t.message !== message);
      return { toasts: [...deduped, toast].slice(-MAX_VISIBLE) };
    });
    return id;
  },

  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  clear() {
    set({ toasts: [] });
  },
}));

/** Imperative helpers, for use outside React components. */
export const toast = {
  info: (message: string, action?: ToastAction) =>
    useToast.getState().push({ kind: 'info', message, action }),
  success: (message: string, action?: ToastAction) =>
    useToast.getState().push({ kind: 'success', message, action }),
  error: (message: string, action?: ToastAction) =>
    useToast.getState().push({ kind: 'error', message, action }),
};
