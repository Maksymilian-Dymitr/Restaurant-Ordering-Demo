# Restaurant Ordering System — web demo

An **interactive browser demo** of [Restaurant-Ordering-System](https://github.com/Maksymilian-Dymitr/Restaurant-Ordering-System),
an event-driven microservice backend for a fast-food restaurant. For demonstration purposes only.

The real system is five Bun services (Elysia) behind nginx, talking over RabbitMQ, with PostgreSQL, a Redis menu cache
and Docker Compose. It has no UI, so this demo puts one on top and lets you watch an order travel through it:

- **Kiosk** — browse the menu (`GET /menu`), build a cart and pay (`POST /orders`).
- **Kitchen** — the order arrives via the `order.created` fanout; start it (`PATCH /kitchen/orders/:id`) and finish it
  (`POST /kitchen/orders/:id/done`), which publishes `order.ready`. "Auto kitchen" does this by itself.
- **Event bus** — every request through nginx, every exchange publish and queue delivery, every SQL write and Redis
  hit/miss, as it happens.

It is **not** the backend itself:

- The services are simulated in TypeScript in the browser (`src/sim/`), mirroring the real routes, status codes, queue
  names (`order.created.kitchen-service`, …), validation (422) and the kitchen key (403).
- Menu and schema come from the real `database/init.sql`.
- All state is in memory. Reset (or refresh) to start over.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
```

## Build

```bash
npm run build    # outputs to dist/
npm run preview
```

Deployed on Netlify (`netlify.toml`: build `npm run build`, publish `dist`).
