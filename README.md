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
| `apps/catalog-service` | Owns categories and fixed-price services (price incl. VAT, includes / excludes, FAQ). Read-only for now; same `X-Internal-Token` rule. Port 3002, database `catalog_db`. |
| `apps/notifications-service` | No HTTP. Consumes `user.registered`, `professional.approved` and `professional.rejected` (for now it logs the message it would send). |

## Requirements

- Node.js 24
- Docker Desktop (Kafka, local file storage, and optionally a local Postgres)
- An Auth0 tenant with the Plim API (`https://api.plim.app`)

## First-time setup

```bash
npm ci
cp .env.example .env          # then fill in the values (see comments in the file)
docker compose -f infra/docker-compose.yml up -d
npm run db:users:generate     # generate the Prisma clients
npm run db:catalog:generate
npm run db:users:deploy       # create the tables in the databases from .env
npm run db:catalog:deploy
npm run db:catalog:seed      # pilot catalog: 5 categories, 5 fixed-price services, Coimbra (safe to re-run)
```

The database can be Neon (shared dev database) or the Postgres container. `.env.example` has both.

## Running

Each service in its own terminal:

```bash
npm run start:users
npm run start:catalog
npm run start:notifications
npm run start:gateway
```

Try requests with the REST Client files in `http/` (`gateway.http` for the public API,
`users.http` for users-service directly). Paste tokens there locally; don't commit them.

## Endpoints (gateway)

| Method | Path | Auth | |
|---|---|---|---|
| GET | `/health` | public | Liveness check |
| GET | `/catalog/categories` | public | Active categories |
| GET | `/catalog/services` | public | Active services; `?category=<slug>` filters |
| GET | `/catalog/services/:slug` | public | One service: price, includes, excludes, FAQ |
| GET | `/catalog/areas/:postalCode` | public | Municipality of a postal code, and whether bookings are open there |
| GET | `/catalog/search` | public | Home search: `?q=<text>&postalCode=<code>` (both optional) |
| GET | `/whoami` | any valid token | Claims of the caller's token |
| GET | `/me` | logged-in person | Caller's profile, 404 if not registered yet |
| POST | `/me` | logged-in person | Register the caller's profile (`email`, `name?`, `phone?`) |
| PATCH | `/me` | logged-in person | Change `name` / `phone` |
| GET | `/me/professional` | logged-in person | Caller's professional profile, 404 if they never applied |
| POST | `/me/professional` | logged-in person | Apply as a professional (`nif`, `activityRegistered: true`, optional `businessName`, `bio`, `insurancePolicy`, `insuranceValidUntil`); starts as `applied` |
| PATCH | `/me/professional` | logged-in person | Edit the professional profile (the NIF only while `applied`) |
| GET | `/me/professional/documents` | logged-in person | Caller's verification documents |
| POST | `/me/professional/documents` | logged-in person | Ask for an upload link (`type`, `contentType`, `sizeBytes`, `fileName?`) → `{ document, upload: { method, url, headers } }` |
| POST | `/me/professional/documents/:id/confirm` | logged-in person | After uploading: checks the file arrived, marks it `pending` |
| GET | `/me/professional/documents/:id/download-url` | logged-in person | Short-lived link to view the file |
| DELETE | `/me/professional/documents/:id` | logged-in person | Delete a document (not once accepted) |
| GET | `/admin/me` | admin | Confirms the caller is an admin; returns their permissions |
| GET | `/admin/professionals` | admin | Applications, oldest first; `?status=applied` is the review queue |
| GET | `/admin/professionals/:id` | admin | One application: the person, their documents, which required documents are missing |
| GET | `/admin/professionals/:id/documents/:documentId/download-url` | admin | Short-lived link to look at a document |
| POST | `/admin/professionals/:id/documents/:documentId/review` | admin | `{ decision: "accepted" \| "rejected", reason? }` (reason required when rejecting) |
| POST | `/admin/professionals/:id/approve` | admin | Approve: needs an accepted `id_card` and `activity_proof`; sets the Verificado mark |
| POST | `/admin/professionals/:id/reject` | admin | `{ reason }`, shown to the applicant |

"Admin" means the token carries the `admin:access` permission (see below). Everything under `/admin` requires it, whether or not the route says so.

"Logged-in person" means machine-to-machine tokens get 403. The Auth0 id always comes from the token, never from the body.

## Admins (Auth0 roles)

Admin rights come from Auth0, not from our database. One-time setup in the Auth0 dashboard:

1. **Applications → APIs → Plim API → Settings**: turn on **Enable RBAC** and **Add Permissions in the Access Token**.
2. Same API, **Permissions** tab: add `admin:access`.
3. **User Management → Roles**: create a role `admin` and add the `admin:access` permission to it.
4. **User Management → Users → (a person) → Roles**: assign `admin`.

The person must log in again to get a token with the permission. In the gateway, protect a route with
`@RequirePermissions('some:permission')`; routes under `/admin` need `admin:access` automatically.

## Document uploads

Files never pass through the backend. The app asks for an upload link, PUTs the file straight to
storage (AWS S3, or the local `plim-storage` container) with exactly the returned headers, then calls
`confirm`. The bucket is private; viewing a file also goes through a short-lived signed link.
Allowed: PDF, JPEG, PNG, up to 10 MB. For uploads from the **web** app, the S3 bucket needs a CORS
rule allowing `PUT` and `GET` from the web origin (phones don't need it).

## Tests

```bash
npm test            # unit tests
npm run test:e2e    # boots each app with fake database/Kafka and checks access rules
npm run lint
```

## Database changes

Each service has its own schema and scripts (`db:users:*`, `db:catalog:*`). For users-service:

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
| `professional.approved` | users-service (via outbox) | notifications-service |
| `professional.rejected` | users-service (via outbox) | notifications-service |

Events are delivered at least once: an event can arrive twice, so consumers should ignore an `eventId` they already handled.
