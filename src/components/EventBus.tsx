import { useEffect, useRef } from "react";
import { useSim } from "../sim/store";
import type { LogEntry, ServiceName } from "../sim/types";

const STRIP: { name: ServiceName; label: string; kind: "edge" | "svc" | "infra" }[] = [
  { name: "nginx", label: "nginx", kind: "edge" },
  { name: "product-service", label: "product", kind: "svc" },
  { name: "order-service", label: "order", kind: "svc" },
  { name: "kitchen-service", label: "kitchen", kind: "svc" },
  { name: "notification-service", label: "notification", kind: "svc" },
  { name: "error-service", label: "error", kind: "svc" },
  { name: "rabbitmq", label: "RabbitMQ", kind: "infra" },
  { name: "postgres", label: "PostgreSQL", kind: "infra" },
  { name: "redis", label: "Redis", kind: "infra" },
];

const TAG: Record<LogEntry["kind"], string> = {
  request: "HTTP",
  response: "HTTP",
  publish: "AMQP",
  deliver: "AMQP",
  db: "SQL",
  cache: "REDIS",
  auth: "AUTH",
};

const time = (t: number) => {
  const d = new Date(t);
  return `${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
};

export function EventBus() {
  const log = useSim((s) => s.log);
  const busy = useSim((s) => s.busy);
  const now = Date.now();

  // Console style: oldest first, keep scrolled to the newest line.
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const rows = [...log].reverse();

  return (
    <section className="panel bus" aria-label="Event bus">
      <header className="bus__head">
        <p className="bus__eyebrow">Behind the counter</p>
        <h2 className="bus__title">Event bus</h2>
      </header>

      <ul className="strip" aria-label="Services">
        {STRIP.map((s) => (
          <li key={s.name} className={`strip__node strip__node--${s.kind}${(busy[s.name] ?? 0) > now ? " is-busy" : ""}`}>
            {s.label}
          </li>
        ))}
      </ul>

      <ol className="log" ref={listRef} aria-live="polite">
        {rows.length === 0 && (
          <li className="log__hint">
            Place an order at the kiosk and watch it travel: nginx → order-service → PostgreSQL → RabbitMQ fanout → kitchen + error
            service. Finish it in the kitchen to see <code>order.ready</code> fan out to order + notification service.
          </li>
        )}
        {rows.map((e) => (
          <li key={e.id} className={`log__row log__row--${e.kind}${e.status && e.status >= 400 ? " is-error" : ""}`}>
            <time>{time(e.t)}</time>
            <span className="log__tag">{TAG[e.kind]}</span>
            <span className="log__text">{e.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
