import { useEffect, useState } from "react";
import { request } from "../sim/gateway";
import { KITCHEN_KEY, productById, setAutoKitchen } from "../sim/services";
import { useSim } from "../sim/store";
import type { KitchenOrder, KitchenStatus } from "../sim/types";

const COLUMNS: { status: KitchenStatus; title: string }[] = [
  { status: "pending", title: "Pending" },
  { status: "ongoing", title: "Ongoing" },
  { status: "done", title: "Done" },
];

const withKey = { "x-kitchen-key": KITCHEN_KEY };

function age(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function Ticket({ order }: { order: KitchenOrder }) {
  return (
    <article className={`ticket ticket--${order.status}`}>
      <header>
        <b>#{order.orderId}</b>
        <span>{age(order.receivedAt)}</span>
      </header>
      <ul>
        {order.products.map((l) => {
          const p = productById(l.productId);
          return (
            <li key={l.productId}>
              {l.quantity}× {p?.name ?? `product ${l.productId}`}
            </li>
          );
        })}
      </ul>
      {order.status === "pending" && (
        <button onClick={() => request("PATCH", `/kitchen/orders/${order.orderId}`, { status: "ongoing" }, withKey)}>Start cooking</button>
      )}
      {order.status === "ongoing" && (
        <button className="is-done" onClick={() => request("POST", `/kitchen/orders/${order.orderId}/done`, undefined, withKey)}>
          Done ✓
        </button>
      )}
    </article>
  );
}

export function Kitchen() {
  const kitchen = useSim((s) => s.kitchen);
  const auto = useSim((s) => s.autoKitchen);

  // Like GET /kitchen/orders/stream (SSE every 5 s), but the ticket ages tick every second.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="panel kitchen" aria-label="Kitchen board">
      <header className="kitchen__head">
        <div>
          <p className="kitchen__eyebrow">kitchen-service · x-kitchen-key ✓</p>
          <h2 className="kitchen__title">Kitchen</h2>
        </div>
        <div className="kitchen__tools">
          <label className="switch">
            <input type="checkbox" checked={auto} onChange={(e) => setAutoKitchen(e.target.checked)} />
            <span>Auto kitchen</span>
          </label>
          <button className="ghost" onClick={() => request("GET", "/kitchen/orders")} title="Call the kitchen API without the key">
            Try without key
          </button>
        </div>
      </header>

      <div className="board">
        {COLUMNS.map((col) => {
          const list = kitchen.filter((o) => o.status === col.status);
          const shown = col.status === "done" ? list.slice(-6).reverse() : list;
          return (
            <div key={col.status} className={`col col--${col.status}`}>
              <h3>
                {col.title} <span>{list.length}</span>
              </h3>
              {shown.map((o) => (
                <Ticket key={o.orderId} order={o} />
              ))}
              {list.length === 0 && <p className="col__empty">—</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
