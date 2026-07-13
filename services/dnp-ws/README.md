# DNP realtime service

Isolated WebSocket data plane for DefinitelyNotPong. Run exactly one service process per deployment; the process owns one authoritative `RoomHub` per active room. Simulation remains **60 Hz** and snapshots **30 Hz**.

## Required environment

- `DNP_WS_TICKET_SECRET` — same signing secret used by the Next.js control plane.
- Database: either `DATABASE_URL`, or `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
- `ALLOWED_ORIGINS` — comma-separated browser origins (default `https://node.xdoes.space`).
- `PORT` — HTTP/WebSocket listen port (default `3000`).

## Verified optional MySQL TLS

Set `DB_SSL=true` to enable TLS. Certificate verification is always enabled; the service never uses `rejectUnauthorized:false`.

Optional PEM values:

- `DB_SSL_CA`
- `DB_SSL_CERT`
- `DB_SSL_KEY`

For private/self-managed CAs, provide the CA certificate with `DB_SSL_CA` rather than disabling verification.

## Limits

- `DNP_WS_MAX_SOCKETS` (1000)
- `DNP_WS_MAX_ROOM_SOCKETS` (100)
- `DNP_WS_MAX_PLAYER_SOCKETS` (3)
- `DNP_WS_MAX_PENDING_AUTH` (100)
- `DNP_WS_MAX_PAYLOAD_BYTES` (8192)
- `DNP_WS_AUTH_TIMEOUT_MS` (5000)
- `DNP_WS_IDLE_MS` (30000)
- `DNP_WS_INPUT_RATE` (45/sec)
- `DNP_WS_ADMIN_RATE` (5/sec)
- `DNP_WS_MAX_BUFFERED_BYTES` (1048576)
- `DNP_WS_BACKPRESSURE_STRIKES` (3)
- `DNP_WS_PRESENCE_MS` (10000)
- `DNP_WS_REFRESH_MS` (1000)

## Health

- `GET /healthz` checks that the process is serving.
- `GET /readyz` executes a database readiness query and returns 503 when unavailable.

A reverse proxy should only send WebSocket traffic after `/readyz` succeeds.

## Run

```sh
npm ci
npm test
DNP_WS_TICKET_SECRET=... DATABASE_URL=... npm start
```

See `deploy/dnp-ws.service.example` for a systemd template. Keep the primary Next.js startup unchanged; this is a separate persistent service.
