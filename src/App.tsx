import { useState } from "react";
import { EventBus } from "./components/EventBus";
import { Kiosk } from "./components/Kiosk";
import { Kitchen } from "./components/Kitchen";
import { useSim } from "./sim/store";

const REPO = "https://github.com/Maksymilian-Dymitr/Restaurant-Ordering-System";
const TABS = ["Kiosk", "Kitchen", "Events"] as const;
type Tab = (typeof TABS)[number];

export function App() {
  const [tab, setTab] = useState<Tab>("Kiosk");
  const open = useSim((s) => s.kitchen).filter((o) => o.status !== "done").length;
  const events = useSim((s) => s.log).length;

  return (
    <div className="app" data-tab={tab}>
      <header className="topbar">
        <p>
          <b>Interactive demo</b> · runs entirely in your browser. The real system is five Bun services behind nginx, talking
          over RabbitMQ.
        </p>
        <nav>
          <a href={REPO} target="_blank" rel="noopener noreferrer">
            Real repo on GitHub →
          </a>
          <button onClick={() => location.reload()}>Reset</button>
        </nav>
      </header>

      <nav className="tabs" aria-label="Panels">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? "is-active" : ""} onClick={() => setTab(t)}>
            {t}
            {t === "Kitchen" && open > 0 && <span>{open}</span>}
            {t === "Events" && events > 0 && <span>{events}</span>}
          </button>
        ))}
      </nav>

      <main className="panels">
        <Kiosk />
        <Kitchen />
        <EventBus />
      </main>
    </div>
  );
}
