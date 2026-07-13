# DNP Multiplayer Rooms Implementation Plan

## Goal

Extend `/dnp` with three named-player modes while preserving Hostinger stability:

1. Local single-player vs AI (no room code, no server state).
2. Random named-player 1v1 matchmaking.
3. Private shareable rooms with six-character codes and up to 12 players.

## Deployment constraint

Do not add a custom HTTP server, WebSocket upgrade handler, persistent process game loop, Express, or `ws`. Use ordinary Next.js route handlers, Prisma/MySQL persistence, short polling, and browser interpolation. Keep `next start` unchanged.

## Domain model

- `DnpRoom`: code, mode, status, admin player, scores, ball state, version, timestamps.
- `DnpPlayer`: room membership, name, join order, assigned base slot/sub-slot, hashed player token, latest normalized input and sequence, presence timestamps.
- Room code is uppercase six-character unambiguous alphanumeric and database-unique.
- Raw player credentials are returned only when joining/creating and stored in browser session storage; only SHA-256 hashes are persisted.
- Admin authority is tied to `adminPlayerId`; admin requests use that player's token.

## Concurrency model

- Every mutating room operation executes in a Prisma transaction.
- Room creation retries database unique-code collisions.
- Joins count active players inside the transaction and enforce max 12.
- Input sequence numbers are monotonic; stale input writes are ignored.
- Room state has a version incremented on changes.
- Presence is refreshed by polling/input. Disconnected players are retained briefly for reconnect, then cleaned opportunistically.
- If the admin leaves/is kicked/expires, transfer admin to the lowest join-order active player.

## Transport

Normal no-cache HTTP endpoints:

- `POST /api/dnp/rooms` create coded room.
- `POST /api/dnp/matchmaking` join queue or pair into transient 1v1 room.
- `POST /api/dnp/rooms/[code]/join` join/reconnect coded room.
- `GET /api/dnp/rooms/[code]?token=...` poll public room state and advance game opportunistically.
- `POST /api/dnp/rooms/[code]/input` submit normalized movement input.
- `POST /api/dnp/rooms/[code]/admin` start/restart/reassign/kick.
- `POST /api/dnp/rooms/[code]/leave` leave and trigger admin transfer.

## Arena allocation

Six base slots in join/fill order:

1. left side
2. right side
3. left top
4. right top
5. left bottom
6. right bottom

Players 1–6 occupy one per base slot. For 7–12, each base slot displays two sub-paddles; players 7–12 become second occupants in the same order. This alternates halves and fills side, top, bottom within each half. Admin reassignment stores slot indices 0–11 and validates uniqueness.

## Simulation

- Local mode keeps the existing 60 FPS browser simulation.
- Multiplayer server stores normalized ball position/velocity and team scores.
- Poll/input requests advance simulation from `lastTickAt` using bounded fixed steps.
- Clients poll approximately every 500 ms and animate/render at 60 FPS using the latest snapshot.
- Player input is a normalized 0–1 position along the assigned slot movement axis.
- Paddle collision supports vertical side paddles and horizontal top/bottom paddles.
- Escaping a boundary scores for the opposite half, resets the ball, and continues.

## UI

- Mandatory display-name gate, 1–16 trimmed visible characters.
- Mode cards: Single player, Random 1v1, Create room, Join room.
- `/dnp/join/[code]` opens the same client with the code prefilled.
- Multiplayer lobby displays room code/link, roster, slot assignments, ready/waiting state, and admin controls.
- Admin may start at 2+ players, restart, reassign slots via dropdowns, and kick non-admin players.
- Player names are rendered centered on paddle bars with contrasting text.
- Matchmaking shows waiting state and automatically enters once paired.

## TDD and verification

1. Add pure tests for name/code validation, deterministic 1–12 slot allocation, split geometry, room DTO/token safety, and simulation.
2. Add service tests using an in-memory adapter for collision retry, max 12, concurrent joins, start authorization, kicking, and admin transfer.
3. Add lightweight route/page contract tests.
4. Run all DNP tests, `tsc --noEmit`, Prisma validation/generation, and `npm run build`.
5. Push additive Prisma schema to production DB before deploying code.
6. Browser QA with multiple isolated clients for create/join/start/input/admin flows.
7. Deploy to main, wait 2–5 minutes, verify health plus live DNP flows and capture screenshots.
