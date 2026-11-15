// Shapes mirror the real services in Restaurant-Ordering-System
// (database/init.sql and each service's src/).

export type ServiceName =
  | "nginx"
  | "product-service"
  | "order-service"
  | "kitchen-service"
  | "notification-service"
  | "error-service"
  | "rabbitmq"
  | "postgres"
  | "redis";

export interface Product {
  id: number;
  name: string;
  price: number; // kr
  category: "Burger" | "Snack" | "Wrap" | "Side" | "Drink";
  emoji: string; // demo only, not in the real table
}

export interface OrderLine {
  productId: number;
  quantity: number;
}

/** order-service: the orders + order_items tables. */
export interface Order {
  id: number;
  customerId: string;
  status: "pending" | "ready";
  createdAt: number;
  products: OrderLine[];
}

/** kitchen-service: its in-memory Map of received orders. */
export type KitchenStatus = "pending" | "ongoing" | "done";
export interface KitchenOrder {
  orderId: number;
  customerId: string;
  products: OrderLine[];
  status: KitchenStatus;
  receivedAt: number;
}

/** notification-service: the notifications table. */
export interface Notification {
  id: number;
  customerId: string;
  message: string;
  createdAt: number;
  orderId: number; // demo only, so the kiosk can say which order is ready
}

/** error-service: the service_errors table, which also audits order.created. */
export interface AuditEntry {
  id: number;
  service: string;
  message: string;
  createdAt: number;
}

export type LogKind = "request" | "response" | "publish" | "deliver" | "db" | "cache" | "auth";

export interface LogEntry {
  id: number;
  t: number;
  kind: LogKind;
  text: string;
  status?: number;
}

export interface Res<T = unknown> {
  status: number;
  body: T;
}
