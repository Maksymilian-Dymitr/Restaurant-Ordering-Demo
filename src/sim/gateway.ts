import {
  getAudit,
  getKitchenOrders,
  getMenu,
  getNotifications,
  markKitchenOrderDone,
  patchKitchenOrder,
  postOrder,
  setRequester,
} from "./services";
import { glow, log } from "./store";
import type { Res, ServiceName } from "./types";

// nginx: the only way in. Same location blocks as nginx/nginx.conf,
// each proxying to one service on the internal Docker network.

type Handler = (match: RegExpMatchArray, body: unknown, headers: Record<string, string>) => Res;

interface Route {
  method: string;
  pattern: RegExp;
  service: ServiceName;
  handle: Handler;
}

const routes: Route[] = [
  { method: "GET", pattern: /^\/menu$/, service: "product-service", handle: () => getMenu() },
  { method: "POST", pattern: /^\/orders$/, service: "order-service", handle: (_m, body) => postOrder(body) },
  { method: "GET", pattern: /^\/kitchen\/orders$/, service: "kitchen-service", handle: (_m, _b, h) => getKitchenOrders(h) },
  { method: "PATCH", pattern: /^\/kitchen\/orders\/(\d+)$/, service: "kitchen-service", handle: (m, body, h) => patchKitchenOrder(Number(m[1]), body, h) },
  { method: "POST", pattern: /^\/kitchen\/orders\/(\d+)\/done$/, service: "kitchen-service", handle: (m, _b, h) => markKitchenOrderDone(Number(m[1]), h) },
  { method: "GET", pattern: /^\/notification\/([^/]+)$/, service: "notification-service", handle: (m) => getNotifications(decodeURIComponent(m[1])) },
  { method: "GET", pattern: /^\/errors$/, service: "error-service", handle: () => getAudit() },
];

const short = (body: unknown) => {
  const s = typeof body === "string" ? body : JSON.stringify(body);
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
};

export function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Res {
  glow("nginx");
  for (const route of routes) {
    const match = route.method === method ? path.match(route.pattern) : null;
    if (!match) continue;
    log("request", `${method} https://localhost${path} → nginx → ${route.service}`);
    glow(route.service);
    const res = route.handle(match, body, headers);
    log("response", `${route.service} ← ${res.status} ${short(res.body)}`, res.status);
    return res;
  }
  log("request", `${method} https://localhost${path} → nginx`);
  log("response", "nginx ← 404 no matching location", 404);
  return { status: 404, body: "Not Found" };
}

setRequester(request);
