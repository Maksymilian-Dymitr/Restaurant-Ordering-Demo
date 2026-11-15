import { useSyncExternalStore } from "react";
import type { AuditEntry, KitchenOrder, LogEntry, LogKind, Notification, Order, ServiceName } from "./types";

/** Everything the simulated system holds, in one place. Each service only touches its own slice. */
export interface State {
  orders: Order[]; // order-service (PostgreSQL)
  kitchen: KitchenOrder[]; // kitchen-service (in memory, like the real Map)
  notifications: Notification[]; // notification-service (PostgreSQL)
  audit: AuditEntry[]; // error-service (PostgreSQL)
  menuCachedAt: number | null; // product-service's Redis key "menu"
  log: LogEntry[];
  busy: Partial<Record<ServiceName, number>>; // service → glow until (ms)
  autoKitchen: boolean;
}

let state: State = {
  orders: [],
  kitchen: [],
  notifications: [],
  audit: [],
  menuCachedAt: null,
  log: [],
  busy: {},
  autoKitchen: false,
};

const listeners = new Set<() => void>();

export const getState = () => state;

export function update(fn: (s: State) => Partial<State>): void {
  state = { ...state, ...fn(state) };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Select a slice. Selectors must return stored references, not new arrays, or React re-renders forever. */
export function useSim<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

let seq = 0;
export const nextId = () => ++seq;

const LOG_LIMIT = 250;

export function log(kind: LogKind, text: string, status?: number): void {
  const entry: LogEntry = { id: nextId(), t: Date.now(), kind, text, status };
  update((s) => ({ log: [entry, ...s.log].slice(0, LOG_LIMIT) }));
}

const GLOW_MS = 700;

/** Light a service up in the Event bus strip while it handles something. */
export function glow(...services: ServiceName[]): void {
  const until = Date.now() + GLOW_MS;
  update((s) => {
    const busy = { ...s.busy };
    services.forEach((name) => (busy[name] = until));
    return { busy };
  });
  setTimeout(() => {
    update((s) => {
      const now = Date.now();
      const busy = { ...s.busy };
      (Object.keys(busy) as ServiceName[]).forEach((k) => {
        if ((busy[k] ?? 0) <= now) delete busy[k];
      });
      return { busy };
    });
  }, GLOW_MS + 30);
}
