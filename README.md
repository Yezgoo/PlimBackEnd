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
| `apps/booking-service` | Owns bookings, their status history and the offers made to professionals (it asks users-service who is eligible). A booking keeps its own copy of the service name, price and address. Port 3003, database `bookings_db`. |
| `apps/admin-service` | Owns platform settings and their audit history. Publishes `settings.changed` through a Kafka outbox. Port 3004, database `admin_db`. |
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
npm run db:bookings:generate
npm run db:admin:generate
npm run db:users:deploy       # create the tables in the databases from .env
npm run db:catalog:deploy
npm run db:bookings:deploy
npm run db:admin:deploy
npm run db:catalog:seed      # pilot catalog: 5 categories, 5 fixed-price services, Coimbra (safe to re-run)
```

The database can be Neon (shared dev database) or the Postgres container. `.env.example` has both.
Set `ADMIN_DATABASE_URL` before running the admin database commands. On an existing Postgres
instance, create `admin_db` once before deploying its migration. The Docker init script creates
it on fresh volumes.

## Running

Each service in its own terminal:

```bash
npm run start:users
npm run start:catalog
npm run start:bookings
npm run start:admin
npm run start:notifications
npm run start:gateway
```

Try requests with the REST Client files in `http/` (`gateway.http` for the public API,
`users.http` for users-service directly). Paste tokens there locally; don't commit them.

## Platform settings (12a)

These gateway routes require a signed-in admin with the existing admin permission.

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/settings` | Read current settings, units implied by their keys, with allowed ranges and revisions |
| PATCH | `/admin/settings/:key` | Set one integer value with a body such as `{"value":2100}` |
| GET | `/admin/settings/audit` | Read the latest changes. Optional `key` filters by setting. Pass `nextCursor` as `cursor` to get the next page. |

| Key | Unit | Default | Allowed |
|---|---|---:|---:|
| `commission_default` | basis points (2000 = 20%) | 2000 | 1500–2500 |
| `service_fee_cents` | euro cents | 200 | 150–250 |
| `offer_timeout_minutes` | minutes | 15 | 1–60 |
| `max_offers` | professionals per booking | 5 | 1–20 |
| `release_after_hours` | hours | 48 | 1–168 |

Each change saves the new setting, the before-and-after audit entry, and an outbox
message in one transaction. Saving the current value again leaves its revision and history
as they are. Kafka delivery can retry. Consumers should deduplicate by `eventId` and use
the per-setting `revision` to recognize older values.

Booking pricing reads the commission and service fee from admin-service. Dispatch limits still
come from the booking service environment.

## Endpoints (gateway)

| Method | Path | Auth | |
|---|---|---|---|
| GET | `/health` | public | Liveness check |
| GET | `/catalog/categories` | public | Active categories |
| GET | `/catalog/services` | public | Active services; `?category=<slug>` filters |
| GET | `/catalog/services/:slug` | public | One service: price, includes, excludes, FAQ |
| GET | `/catalog/municipalities` | public | Municipalities we know, with a `pilot` flag (for the "where do you work?" picker) |
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
| GET | `/me/professional/work-settings` | logged-in person | Where, what and when the caller works: municipalities, services, weekly timetable, upcoming time off |
| PUT | `/me/professional/areas` | logged-in person | `{ municipalityCodes: ["0603"] }` replaces the list; codes must exist in the catalog |
| PUT | `/me/professional/services` | logged-in person | `{ serviceTypeIds: [...] }` replaces the list; ids must exist in the catalog |
| PUT | `/me/professional/availability` | logged-in person | `{ slots: [{ weekday, start, end }] }` replaces the week. `weekday` 1 = Monday ... 7 = Sunday, times `HH:MM` in Lisbon time, blocks may not overlap |
| POST | `/me/professional/time-off` | logged-in person | `{ startsAt, endsAt, reason? }` |
| DELETE | `/me/professional/time-off/:id` | logged-in person | Remove a time-off period |
| POST | `/bookings/preview` | logged-in person | The summary step: `{ serviceSlug, address: { street, details?, postalCode, city? }, scheduledStart, notes? }` returns the service price, service fee and total. Saves nothing |
| POST | `/bookings` | logged-in person | Same body, with optional `reviewedPrice: { priceCents, serviceFeeCents }` for checkout confirmation. If either reviewed amount changed, returns `409 BOOKING_PRICE_CHANGED` with an updated preview and creates nothing |
| GET | `/bookings` | logged-in person | Caller's bookings, latest first |
| GET | `/bookings/:id` | logged-in person | One of the caller's bookings, with its status history |
| POST | `/bookings/:id/confirm` | logged-in person | The customer confirms a finished (`done`) job. Without an answer it is confirmed automatically after `release_after_hours` (48 by default) |
| GET | `/me/professional/offers` | logged-in person | Jobs offered to the caller as a professional; `?status=pending` for the ones waiting for an answer |
| POST | `/me/professional/offers/:id/accept` | logged-in person | Take the job. The answer includes the full address and the customer's notes |
| POST | `/me/professional/offers/:id/decline` | logged-in person | Pass: the next professional is asked |
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

## Bookings

### Pricing (12b)

Preview and creation require the catalog and admin services. The customer total is the catalog
price plus the admin service fee. Commission applies to the catalog price and is rounded to
the nearest cent, with half cents rounded up. The service commission takes precedence over the
category rate, then the admin default. At €65 with a €2 fee and 20% commission, the customer
total is €67, commission is €13 and the professional's amount is €52.

Creation stores these amounts on the booking. Existing bookings keep their original total and
have no recorded commission split. Apply the booking migration and regenerate the Prisma client
before restarting booking-service. No money is collected in this step.

### Scheduling

A booking can be made for a fixed-price service, in a postal code where bookings are open, starting
at least 2 hours from now, at most 90 days ahead, on a quarter of an hour. Booking the same service
for the same time twice answers 409.

### Finding a professional

A new booking is offered to one professional at a time (status `finding_pro`). users-service says
who is eligible: approved, does that service, works in that municipality, has the time inside one
block of their timetable (Lisbon time) and no time off; best-rated first. booking-service skips
anyone already asked or busy with another job then, and never offers a booking to the customer who
made it. Each offer has a deadline (`OFFER_TIMEOUT_MINUTES`). A decline or a missed deadline asks
the next professional; when nobody is left, or `MAX_OFFERS` were asked, the booking is cancelled
with reason `no_pro_found`. Before accepting, a professional sees the job, the city and the first
four digits of the postal code; the street and the notes come with acceptance.

Until payments exist (roadmap step 12) this starts as soon as the booking is created. With
`PAYMENTS_REQUIRED=true` a booking waits in `pending_payment` instead.

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

Each service has its own schema and scripts (`db:users:*`, `db:catalog:*`, `db:bookings:*`). For users-service:

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
