import { consume, publish } from "./bus";
import { getState, glow, log, nextId, update } from "./store";
import type { KitchenStatus, OrderLine, Product, Res } from "./types";

// The five services, mirroring their real routes, status codes and
// side effects. Only the transport is simulated.

/** database/init.sql seed. Emoji are a demo addition. */
export const MENU: Product[] = [
  { id: 1, name: "Cheeseburger", price: 89, category: "Burger", emoji: "🍔" },
  { id: 2, name: "Double Burger", price: 119, category: "Burger", emoji: "🍔" },
  { id: 3, name: "Chicken Nuggets", price: 69, category: "Snack", emoji: "🍗" },
  { id: 4, name: "Veggie Wrap", price: 79, category: "Wrap", emoji: "🌯" },
  { id: 5, name: "French Fries", price: 39, category: "Side", emoji: "🍟" },
  { id: 6, name: "Cola", price: 29, category: "Drink", emoji: "🥤" },
];

export const productById = (id: number) => MENU.find((p) => p.id === id);

export const KITCHEN_KEY = "demo-kitchen-key"; // KITCHEN_API_KEY in the real .env
const MENU_TTL_MS = 60_000; // redis SET menu ... EX 60

// ---------- product-service ----------

export function getMenu(): Res<Product[]> {
  glow("product-service", "redis");
  const cachedAt = getState().menuCachedAt;
  if (cachedAt && Date.now() - cachedAt < MENU_TTL_MS) {
    log("cache", `redis GET menu → HIT (expires in ${Math.ceil((MENU_TTL_MS - (Date.now() - cachedAt)) / 1000)} s)`);
  } else {
    log("cache", "redis GET menu → MISS");
    glow("postgres");
    log("db", "postgres SELECT * FROM products → 6 rows");
    log("cache", "redis SET menu EX 60");
    update(() => ({ menuCachedAt: Date.now() }));
  }
  return { status: 200, body: MENU };
}

// ---------- order-service ----------

let nextOrderId = 1;

/** Same rules as NewOrderBody (t.Object) in order-service: anything else is a 422. */
function validateOrder(body: unknown): string | null {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as { customerId?: unknown; products?: unknown };
  if (typeof b.customerId !== "string" || b.customerId.length < 1) return "customerId: expected a non-empty string";
  if (!Array.isArray(b.products) || b.products.length < 1) return "products: expected at least 1 item";
  for (const p of b.products as Partial<OrderLine>[]) {
    if (!Number.isInteger(p.productId) || (p.productId ?? 0) < 1) return "products[].productId: expected an integer ≥ 1";
    if (!Number.isInteger(p.quantity) || (p.quantity ?? 0) < 1) return "products[].quantity: expected an integer ≥ 1";
  }
  return null;
}

export function postOrder(body: unknown): Res<{ status: "pending"; orderId: number } | { error: string }> {
  const error = validateOrder(body);
  if (error) return { status: 422, body: { error } };

  const { customerId, products } = body as { customerId: string; products: OrderLine[] };
  const orderId = nextOrderId++;
  glow("order-service", "postgres");
  update((s) => ({ orders: [...s.orders, { id: orderId, customerId, status: "pending", createdAt: Date.now(), products }] }));
  log("db", `postgres INSERT INTO orders (customer_id) → id ${orderId}, status 'pending'`);
  log("db", `postgres INSERT INTO order_items → ${products.length} row${products.length === 1 ? "" : "s"}`);
  publish("order.created", { customerId, orderId, products }, "order-service");
  return { status: 201, body: { status: "pending", orderId } };
}

consume("order.ready", "order.ready.order-service", "order-service", (m) => {
  const orderId = m.orderId as number;
  glow("postgres");
  update((s) => ({ orders: s.orders.map((o) => (o.id === orderId ? { ...o, status: "ready" } : o)) }));
  log("db", `postgres UPDATE orders SET status = 'ready' WHERE id = ${orderId}`);
});

// ---------- kitchen-service ----------

consume("order.created", "order.created.kitchen-service", "kitchen-service", (m) => {
  const orderId = m.orderId as number;
  update((s) => ({
    kitchen: [
      ...s.kitchen,
      { orderId, customerId: m.customerId as string, products: m.products as OrderLine[], status: "pending", receivedAt: Date.now() },
    ],
  }));
  if (getState().autoKitchen) autoCook(orderId);
});

function checkKey(headers: Record<string, string>): Res<string> | null {
  if (headers["x-kitchen-key"] === KITCHEN_KEY) return null;
  log("auth", "kitchen-service: x-kitchen-key missing or wrong → 403 Forbidden");
  return { status: 403, body: "Forbidden" };
}

export function getKitchenOrders(headers: Record<string, string>): Res {
  return checkKey(headers) ?? { status: 200, body: getState().kitchen };
}

export function patchKitchenOrder(id: number, body: unknown, headers: Record<string, string>): Res {
  const denied = checkKey(headers);
  if (denied) return denied;
  const status = (body as { status?: unknown } | null)?.status;
  if (status !== "pending" && status !== "ongoing" && status !== "done") {
    return { status: 422, body: { error: "status: expected 'pending' | 'ongoing' | 'done'" } };
  }
  const order = getState().kitchen.find((o) => o.orderId === id);
  if (!order) return { status: 404, body: { error: "Order not found" } };
  update((s) => ({ kitchen: s.kitchen.map((o) => (o.orderId === id ? { ...o, status: status as KitchenStatus } : o)) }));
  return { status: 200, body: { ...order, status } };
}

export function markKitchenOrderDone(id: number, headers: Record<string, string>): Res {
  const denied = checkKey(headers);
  if (denied) return denied;
  const order = getState().kitchen.find((o) => o.orderId === id);
  if (!order) return { status: 404, body: { error: "Order not found" } };
  update((s) => ({ kitchen: s.kitchen.map((o) => (o.orderId === id ? { ...o, status: "done" } : o)) }));
  publish("order.ready", { orderId: order.orderId, customerId: order.customerId }, "kitchen-service");
  return { status: 200, body: { ...order, status: "done" } };
}

// "Auto kitchen" is a demo helper: it drives the same HTTP calls the kitchen
// screen would, so visitors who only use the kiosk still see an order finish.
type Requester = (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Res;
let requester: Requester | null = null;
export const setRequester = (r: Requester) => (requester = r);
const cooking = new Set<number>();

export function autoCook(orderId: number): void {
  if (cooking.has(orderId) || !requester) return;
  cooking.add(orderId);
  const key = { "x-kitchen-key": KITCHEN_KEY };
  const statusOf = () => getState().kitchen.find((o) => o.orderId === orderId)?.status;
  setTimeout(() => {
    if (!getState().autoKitchen) return void cooking.delete(orderId);
    if (statusOf() === "pending") requester!("PATCH", `/kitchen/orders/${orderId}`, { status: "ongoing" }, key);
    setTimeout(() => {
      cooking.delete(orderId);
      if (getState().autoKitchen && statusOf() === "ongoing") requester!("POST", `/kitchen/orders/${orderId}/done`, undefined, key);
    }, 2600);
  }, 1400);
}

export function setAutoKitchen(on: boolean): void {
  update(() => ({ autoKitchen: on }));
  if (on) getState().kitchen.filter((o) => o.status !== "done").forEach((o) => autoCook(o.orderId));
}

// ---------- notification-service ----------

consume("order.ready", "order.ready.notification-service", "notification-service", (m) => {
  glow("postgres");
  update((s) => ({
    notifications: [
      ...s.notifications,
      { id: nextId(), customerId: m.customerId as string, message: "Your order is ready!", createdAt: Date.now(), orderId: m.orderId as number },
    ],
  }));
  log("db", `postgres INSERT INTO notifications (customer_id, message) → '${m.customerId}', 'Your order is ready!'`);
});

export function getNotifications(customerId: string): Res {
  return { status: 200, body: getState().notifications.filter((n) => n.customerId === customerId) };
}

// ---------- error-service ----------

consume("order.created", "order.created.error-service", "error-service", (m) => {
  glow("postgres");
  update((s) => ({
    audit: [...s.audit, { id: nextId(), service: "order-service", message: `order.created #${m.orderId}`, createdAt: Date.now() }],
  }));
  log("db", `postgres INSERT INTO service_errors (service, message, severity) → audit of order.created #${m.orderId}`);
});

export function getAudit(): Res {
  return { status: 200, body: getState().audit };
}
