# Plim BackEnd

Backend for **YezGoo**, a marketplace app for home services (customers request a job, nearby
professionals quote, the customer books one). NestJS monorepo of small services, ESM + TypeScript,
tested with Vitest.

```
 Expo app ──HTTPS + Auth0 token──▶ api-gateway :3000 ──HTTP + X-Internal-Token──▶ users-service :3001 ──▶ Postgres (users_db)
                                                                                        │
                                                                     outbox → Kafka "user.registered"
                                                                                        ▼
                                                                              notifications-service
```

| App | What it does |
|---|---|
| `apps/api-gateway` | The only public entry point. Verifies Auth0 tokens on every route (unless marked `@Public()`), forwards `/me` to users-service. |
| `apps/users-service` | Owns the `users` table. Only accepts calls carrying the gateway's `X-Internal-Token`. Writes `user.registered` events to an outbox, which a relay sends to Kafka. |
| `apps/notifications-service` | No HTTP. Consumes `user.registered` (for now it logs the welcome email it would send). |

## Requirements

- Node.js 24
- Docker Desktop (Kafka, and optionally a local Postgres)
- An Auth0 tenant with the Plim API (`https://api.plim.app`)

## First-time setup

```bash
npm ci
cp .env.example .env          # then fill in the values (see comments in the file)
docker compose -f infra/docker-compose.yml up -d
npm run db:users:generate     # generate the Prisma client
npm run db:users:deploy       # create the tables in the database from USERS_DATABASE_URL
```

The database can be Neon (shared dev database) or the Postgres container. `.env.example` has both.

## Running

Each service in its own terminal:

```bash
npm run start:users
npm run start:notifications
npm run start:gateway
```

Try requests with the REST Client files in `http/` (`gateway.http` for the public API,
`users.http` for users-service directly). Paste tokens there locally; don't commit them.

## Endpoints (gateway)

| Method | Path | Auth | |
|---|---|---|---|
| GET | `/health` | public | Liveness check |
| GET | `/whoami` | any valid token | Claims of the caller's token |
| GET | `/me` | logged-in person | Caller's profile, 404 if not registered yet |
| POST | `/me` | logged-in person | Register the caller's profile (`email`, `name?`, `phone?`) |
| PATCH | `/me` | logged-in person | Change `name` / `phone` |

"Logged-in person" means machine-to-machine tokens get 403. The Auth0 id always comes from the token, never from the body.

## Tests

```bash
npm test            # unit tests
npm run test:e2e    # boots each app with fake database/Kafka and checks access rules
npm run lint
```

## Database changes

1. Edit `apps/users-service/prisma/schema.prisma`.
2. `npm run db:users:migrate -- --name <what-changed>` (creates a migration; needs a database
   Prisma can create a temporary shadow database on, e.g. the local Postgres container), **or**
   generate the SQL with `prisma migrate diff` and review it.
3. `npm run db:users:deploy` applies pending migrations to the database in `.env`.
4. `npm run db:users:generate` refreshes the Prisma client.

## Events

| Topic | Producer | Consumers |
|---|---|---|
| `user.registered` | users-service (via outbox) | notifications-service |

Events are delivered at least once: an event can arrive twice, so consumers should ignore an `eventId` they already handled.
