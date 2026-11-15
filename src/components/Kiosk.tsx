import { useEffect, useMemo, useRef, useState } from "react";
import { request } from "../sim/gateway";
import { productById } from "../sim/services";
import { useSim } from "../sim/store";
import type { Product } from "../sim/types";

const CUSTOMER = "customer-1";
const CATEGORIES = ["All", "Burger", "Snack", "Wrap", "Side", "Drink"] as const;

type Cart = Record<number, number>; // productId → quantity

export function Kiosk() {
  const [menu, setMenu] = useState<Product[]>([]);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [cart, setCart] = useState<Cart>({});
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [myOrders, setMyOrders] = useState<number[]>([]);
  const orders = useSim((s) => s.orders);
  const notifications = useSim((s) => s.notifications);

  const loadMenu = () => {
    const res = request("GET", "/menu");
    if (res.status === 200) setMenu(res.body as Product[]);
  };

  // Load once on start (the first GET is a Redis MISS, later ones within 60 s are HITs).
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    loadMenu();
  }, []);

  // When notification-service writes a new row, fetch them like a client would.
  const seen = useRef(0);
  const [toast, setToast] = useState<number | null>(null);
  useEffect(() => {
    const mine = notifications.filter((n) => n.customerId === CUSTOMER);
    if (mine.length > seen.current) {
      seen.current = mine.length;
      request("GET", `/notification/${CUSTOMER}`);
      setToast(mine[mine.length - 1].orderId);
    }
  }, [notifications]);
  useEffect(() => {
    if (toast === null) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const lines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, quantity]) => ({ product: productById(Number(id))!, quantity }))
        .filter((l) => l.product && l.quantity > 0),
    [cart],
  );
  const total = lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0);
  const count = lines.reduce((sum, l) => sum + l.quantity, 0);

  const add = (id: number, delta: number) =>
    setCart((c) => {
      const next = { ...c, [id]: Math.max(0, (c[id] ?? 0) + delta) };
      if (next[id] === 0) delete next[id];
      return next;
    });

  const pay = () => {
    const res = request("POST", "/orders", {
      customerId: CUSTOMER,
      products: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
    });
    if (res.status === 201) {
      const { orderId } = res.body as { orderId: number };
      setMyOrders((m) => [orderId, ...m]);
      setCart({});
      setMessage({ tone: "ok", text: `Order #${orderId} placed. Watch it go to the kitchen →` });
    } else {
      const error = (res.body as { error?: string }).error ?? "Something went wrong";
      setMessage({ tone: "error", text: `${res.status} from order-service: ${error}. Add something first!` });
    }
  };

  const shown = category === "All" ? menu : menu.filter((p) => p.category === category);

  return (
    <section className="panel kiosk" aria-label="Customer kiosk">
      <header className="kiosk__head">
        <div>
          <p className="kiosk__eyebrow">Self-service kiosk · {CUSTOMER}</p>
          <h2 className="kiosk__title">Order here</h2>
        </div>
        <button className="kiosk__refresh" onClick={loadMenu} title="GET /menu again (Redis cache)">↻ Menu</button>
      </header>

      {toast !== null && (
        <div className="kiosk__toast" role="status">
          🔔 Order #{toast} is ready! <span>Your order is ready!</span>
        </div>
      )}

      <nav className="kiosk__tabs" aria-label="Categories">
        {CATEGORIES.map((c) => (
          <button key={c} className={c === category ? "is-active" : ""} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </nav>

      <div className="kiosk__grid">
        {shown.map((p) => (
          <article key={p.id} className="item">
            <span className="item__emoji" aria-hidden="true">{p.emoji}</span>
            <h3 className="item__name">{p.name}</h3>
            <p className="item__price">{p.price} kr</p>
            <button className="item__add" onClick={() => add(p.id, 1)} aria-label={`Add ${p.name}`}>
              + Add{cart[p.id] ? <b>{cart[p.id]}</b> : null}
            </button>
          </article>
        ))}
        {menu.length === 0 && <p className="muted">Loading menu…</p>}
      </div>

      <div className="cart">
        <h3 className="cart__title">Your order {count > 0 && <span>{count} item{count === 1 ? "" : "s"}</span>}</h3>
        {lines.length === 0 ? (
          <p className="muted">Nothing yet. Tap “+ Add” on something tasty.</p>
        ) : (
          <ul className="cart__lines">
            {lines.map((l) => (
              <li key={l.product.id}>
                <span>{l.product.emoji} {l.product.name}</span>
                <span className="qty">
                  <button onClick={() => add(l.product.id, -1)} aria-label={`One less ${l.product.name}`}>−</button>
                  {l.quantity}
                  <button onClick={() => add(l.product.id, 1)} aria-label={`One more ${l.product.name}`}>+</button>
                </span>
                <span className="cart__sum">{l.product.price * l.quantity} kr</span>
              </li>
            ))}
          </ul>
        )}
        <button className="pay" onClick={pay}>
          Pay {total > 0 ? `${total} kr` : ""}
        </button>
        {message && <p className={`kiosk__msg kiosk__msg--${message.tone}`}>{message.text}</p>}
      </div>

      {myOrders.length > 0 && (
        <div className="mine">
          <h3 className="cart__title">Your orders</h3>
          <ul>
            {myOrders.map((id) => {
              const o = orders.find((x) => x.id === id);
              return (
                <li key={id}>
                  <span className="mine__num">#{id}</span>
                  <span className={`chip chip--${o?.status ?? "pending"}`}>{o?.status ?? "pending"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
