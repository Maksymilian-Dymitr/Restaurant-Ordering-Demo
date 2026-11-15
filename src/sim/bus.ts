import { glow, log } from "./store";
import type { ServiceName } from "./types";

// RabbitMQ, the way the real services use it: every exchange is a durable
// fanout, and each consumer binds its own named queue
// ("<exchange>.<service>"), so one publish reaches every bound service.

type Handler = (message: Record<string, unknown>) => void;

interface Binding {
  queue: string;
  service: ServiceName;
  handler: Handler;
}

const bindings = new Map<string, Binding[]>();

/** Short pause per hop so the flow is visible in the Event bus. */
export const HOP_MS = 450;

export function consume(exchange: string, queue: string, service: ServiceName, handler: Handler): void {
  const list = bindings.get(exchange) ?? [];
  list.push({ queue, service, handler });
  bindings.set(exchange, list);
}

export function publish(exchange: string, message: Record<string, unknown>, from: ServiceName): void {
  const targets = bindings.get(exchange) ?? [];
  glow("rabbitmq", from);
  log("publish", `${from} ⇉ exchange "${exchange}" (fanout → ${targets.length} queues) ${JSON.stringify(message)}`);

  targets.forEach((b, i) => {
    setTimeout(() => {
      glow("rabbitmq", b.service);
      log("deliver", `queue "${b.queue}" → ${b.service} · ack`);
      b.handler(message);
    }, HOP_MS + i * 220);
  });
}
