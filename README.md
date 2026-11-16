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
| GET | `/me/favorites` | logged-in person | Service slugs saved by this account |
| PUT | `/me/favorites/:serviceSlug` | logged-in person | Save an active catalog service to this account's favorites |
| DELETE | `/me/favorites/:serviceSlug` | logged-in person | Remove a service from this account's favorites |
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
| POST | `/bookings/:id/cancel` | customer | Cancels before the professional is on the way, applying the cancellation terms saved on the booking |
| POST | `/bookings/:id/no-show` | customer | Reports an unstarted job after the no-show grace period |
| POST | `/me/professional/bookings/:id/cancel` | assigned professional | Returns an unstarted job to dispatch |
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

### Cancellation (11e)

Checkout shows the booking-specific free cancellation deadline and late fee. Apps can echo
`freeCancelUntil` and `lateCancelFeeCents` in `reviewedPrice`; a mismatch returns
`409 BOOKING_TERMS_CHANGED` with a fresh preview. Cancellation stays free before assignment.
The backend records fees and refund amounts for step 12e. Apply the admin settings and booking
cancellation migrations before running this version against a live database.

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

## Stripe sandbox checkout (12c)

Apply the booking migrations and regenerate the booking Prisma client. Set
`PAYMENTS_REQUIRED=true` for booking-service, and configure the test secret key and webhook
signing secret for payments-service. Start it with `npm run start:payments`.

For local testing, run `stripe listen --events payment_intent.succeeded --forward-to localhost:3005/stripe/webhook`
and use the signing secret it prints. Enable card, MB WAY, and Multibanco in the Stripe sandbox's
payment method settings. Checkout uses the account's default configuration unless
`STRIPE_PAYMENT_METHOD_CONFIGURATION` specifies a sandbox configuration.
Set `PAYMENTS_RETURN_URL` to the web app's bookings page. On mobile, return to the app and refresh
the booking after leaving Checkout. The web app may require signing in again after the redirect.

Open **Abrir pagamento** on a pending booking. The service takes the total from the saved
booking. A signed Stripe success event records the payment and starts dispatch. Multibanco
bookings stay pending until payment succeeds. Payments received after cancellation are recorded
without restarting dispatch. Automatic refunds and payouts are part of step 12e.

## Stripe Connect sandbox onboarding (12d)

Enable Connect in the Stripe sandbox, create `payments_db`, set `PAYMENTS_DATABASE_URL`,
and run `npm run db:payments:deploy`. Start payments-service and set `CONNECT_RETURN_URL`
to the Expo web bookings page. Use HTTPS outside local sandbox development.

An approved professional can open **Receber pagamentos** in the app. The API stores one
Portuguese Express account per professional and requests the transfers capability. Stripe
collects identity and bank information. When the user returns, the app reads the current status
from Stripe. An expired Account Link returns the professional to the same screen to request
a fresh link. On mobile, return to the app and tap **Atualizar estado** after the browser flow.

If account creation remains ambiguous after Stripe's idempotency window, reconcile the reserved
record with the Stripe sandbox account using the `plimProfessionalId` metadata before retrying.
Fund transfers and refunds remain part of 12e.

## Stripe sandbox settlement (12e)

Apply the booking migration and regenerate the booking Prisma client. Run
`npm run db:payments:deploy` again to add the settlement table. With
`PAYMENTS_REQUIRED=true` and `PAYMENTS_DATABASE_URL` set for payments-service,
it checks for paid bookings that need settlement every 30 seconds.

- Customer or automatic confirmation releases the stored professional share to the
  ready Connect account. This is a Stripe transfer to the connected balance.
- Cancellation or no-show refunds the stored amount after any applicable fee.
  If dispatch found nobody, it refunds the full payment. An unpaid booking has no
  receipt to refund. A delayed payment received after cancellation is eligible.
- A pending refund is checked again until it succeeds. Failed or cancelled provider
  refunds and ambiguous submissions older than 23 hours require reconciliation
  in the Stripe sandbox using the booking ID in the operation metadata.

## First-booking coupons (12f)

Apply the new bookings migration. Configure a coupon in the bookings database with an uppercase
code and either a fixed amount in cents or a percentage of the service price. For example:

```sql
INSERT INTO coupons (code, fixed_cents) VALUES ('WELCOME5', 500);
INSERT INTO coupons (code, percent) VALUES ('WELCOME10', 10);
```

Customers enter the code before reviewing checkout. Booking-service validates it and stores
the discount on the first booking. Any previous booking, including a cancelled one, ends
eligibility. The discount is capped at Plim's commission plus the service fee, with a minimum
checkout total of €0.50 for discounted bookings. The professional's share stays the same.
The coupon uses the saved discounted total for Stripe payment and refunds. Admins can create
and activate or deactivate codes in the administration panel.

## Transactional booking emails (13a)

Apply the bookings migration and run `npm run start:notifications`. Set
`RESEND_API_KEY`, `TRANSACTIONAL_EMAIL_FROM` (a verified sender), and
`TRANSACTIONAL_BOOKINGS_URL` (the Expo web bookings page).

Payments, first professional assignment, and customer or automatic completion
confirmation queue Portuguese customer emails. The payment email acknowledges
the amount received. Fiscal invoices are a separate roadmap item. The queue
starts with new transitions after migration. A signed-out recipient can sign
in and open the booking from **Marcações**.

Without email credentials, messages remain queued. Delivery retries reuse the
same stored email and provider idempotency key. After 23 hours from the first
attempt, reconcile ambiguous deliveries in Resend before resetting
`attempted_at` on the matching `booking_emails` row. Successful sends clear
the stored envelope.

## Booking push notifications (13b)

Apply the booking migration and set `EXPO_PUSH_ENABLED=true` on notifications-service.
Configure `EXPO_PUSH_ACCESS_TOKEN` if the Expo project requires authenticated push requests.
Link the app to an EAS project, configure FCM or APNs, and install a native development build.
After signing in, open **Marcações** or **Área profissional** and tap **Ativar notificações**.
Repeat after a professional account is approved or if the installation's Expo token changes.

The worker polls every five seconds. Offers expire with the booking offer deadline, and
customer alerts link to their booking. The queue deduplicates by event and device and retries
unacknowledged requests. Expo can still deliver a duplicate after an ambiguous network failure.
Provider acceptance is tracked separately from actual phone delivery. Signing out attempts
to remove the device registration. Payload text excludes customer names and addresses.

## Booking reviews (14)

Create `reviews_db`, configure `REVIEWS_DATABASE_URL`, then run
`npm run db:reviews:deploy`, `npm run db:users:deploy`, and `npm run start:reviews`.
The booking owner can submit one 1–5 star review with an optional comment from a
confirmed booking. The gateway exposes GET and POST `/bookings/:id/review`.
Reviews-service retries rating updates to users-service, which deduplicates by
booking ID and updates the professional profile average and count.

## Booking disputes (15a)

Run `npm run db:bookings:deploy` before starting booking-service. The customer can
submit written evidence with `POST /bookings/:id/dispute` while the booking is
finished and its automatic confirmation deadline is still in the future. A disputed
booking stays out of the settlement queue.

Admins use `GET /admin/disputes` to read open cases and
`POST /admin/disputes/:id/resolve` with a `decision` of `refund` or
`pay_professional`. The existing settlement worker processes the full refund or
the agreed professional payout after the decision is saved.

## Administration panel (15b)

Sign in with a token that has `admin:access` and open **Conta → Administração** or
go directly to `/admin`. The panel includes the professional application queue,
booking history and payment status, dispute resolution, platform settings, and
first-booking coupons. The booking and coupon endpoints are
`GET /admin/bookings`, `GET /admin/bookings/:id`, `GET /admin/coupons`,
`POST /admin/coupons`, and `PATCH /admin/coupons/:code`.

## Daily marketplace metrics (15c)

Open **Administração → Métricas** or call `GET /admin/metrics?days=7`. The API
accepts 1–90 days (default 30) and includes the current partial day. Days use
Europe/Lisbon time, including daylight-saving changes.

- Bookings and cancellations are counted on the date of their status events.
- GMV is the gross amount collected on the receipt date, including payments later refunded.
- Revenue is the settled amount retained after professional payouts or customer refunds,
  attributed to the settlement date, before processor fees and taxes.
- Acceptance time measures elapsed time from creation to first acceptance and is grouped by
  the date of that acceptance.
- Repeat customers are distinct customers who paid that day and had already paid for another
  booking. A second paid booking on the same day qualifies.

The report reads booking history and payment receipts on demand, so existing history
is available without a backfill. Days without activity show zeros and no acceptance average.

## Assisted invoicing (16c)

Apply `npm run db:bookings:deploy`. On a paid booking, the customer can open
**Faturação** to save a billing name and an optional Portuguese NIF. In
**Administração → Marcações**, an administrator can see those details and
record the reference issued by the external certified invoicing system.
Recording the reference locks the billing details and records who marked
the invoice issued and when. The app does not issue the fiscal document.

Privacy exports include customer billing details. Account erasure removes
unissued billing details. Issued fiscal records remain subject to the
deployment's retention and access policy.

## Account privacy (16a)

Apply `npm run db:users:deploy` and deploy the gateway, users, booking and reviews
services alongside the updated app. New profiles record the acknowledged privacy
notice version and server timestamp. Existing profiles have no retroactive record.

**Conta → Privacidade da conta** exports the profile, notice history, booking and
offer history, and reviews written by the account holder. The web app downloads
JSON and native apps open the system share sheet. The export excludes other users'
contact details, stored document binaries, and Auth0 and Stripe provider records.

Account deletion requests are recorded once per account and appear under
**Administração → Privacidade**. An admin can start reviewing a request. The
first review timestamp and administrator are recorded, and the user sees the
updated status under **Privacidade da conta**. The account stays active during
review, until cleanup freezes the account.
Use **Verificar marcações e pagamentos** to count open bookings and unsettled
payment receipts across both customer and professional activity. This is a
read-only snapshot. A zero count only covers these two checks.

Booking-service provides an internal `POST /privacy/:id/scrub` operation for
the gateway's erasure workflow. It rechecks open bookings and unsettled payments
in its write transaction, clears customer addresses, notes and dispute evidence,
removes notification data, and clears matching event actor IDs. Booking and
payment references are retained. The operation has no public gateway route.
From a reviewed request, select **Limpar dados de marcações e avaliações**.
The gateway checks for open bookings and unsettled payments, freezes the
account, and calls the two cleanup services in order. If a call fails after
the freeze, the account stays frozen and the admin can retry. The deletion
request records when each service finishes. Retries resume at the first step
without a recorded completion. Requests already
in flight before the freeze can still finish, so this is not a final erasure
step.

After provider cleanup and after in-flight operations finish, use **Finalizar
eliminação do perfil**. The administrator confirms applicable Stripe handling.
The gateway repeats booking and review cleanup. Users-service then erases
professional document versions, deletes the Auth0 identity, and atomically
removes the profile, saves a completion receipt, and queues `user.deleted`.
Retries tolerate an Auth0 identity already deleted. Professional finalization
waits at least the signed upload link lifetime after freezing the account.
Configure the users-service Auth0 Management API client with `delete:users`
and grant storage permissions to list and delete document versions. Provider
failures leave the local request available for retry. For a professional
profile, the gateway also requires payments-service to remove the local payout
link. Settlement records are preserved. Stripe-side handling, backups and
downstream event handling remain outside this operation.

Deploy users-service before updating notifications-service. The notification
consumer and booking email worker check the account's current notification
eligibility before handling queued events or sending an email, including saved
email envelopes. Frozen and deleted accounts are skipped. Messages already
submitted to a provider are outside this check.

Registration and professional decision events carry internal IDs only. Deploy
the updated notifications consumer before users-service emits the smaller
payloads. The users migration removes contact details, Auth0 IDs and rejection
reasons from existing outbox rows. Previously published Kafka messages and
historical logs follow their own retention settings.

### Records retained after erasure

| Store | Data that can remain |
| --- | --- |
| Users | Completion timestamp, internal user ID, completing administrator and hashed Auth0 subject. The gateway uses the hash to prevent profile recreation with a previously issued access token. |
| Bookings | Booking history, internal participant references, service and price details, and payment receipts. Cleanup removes customer addresses, notes, dispute evidence and notification records in scope. |
| Reviews | Numeric ratings with booking and professional references. Cleanup removes the author's direct ID and comment. The booking reference can still link records. |
| Payments | Settlement attempts and provider references. The local payout-account link is removed. |
| Infrastructure and providers | Previously published Kafka records, historical logs, backups and applicable Stripe records are handled outside the app. |

Set retention periods and access restrictions for these stores before enabling
the workflow in production. Record how restored backups will be reconciled with
completed deletion receipts. Test the full workflow in a sandbox with a customer
and a professional, including a blocked settlement, a failed provider call
followed by a retry, and a previously issued token attempting to create a profile.

Users-service exposes an internal freeze operation for reviewed deletion
requests. Frozen accounts cannot make authenticated writes through the gateway
except to unregister push devices, and dispatch excludes their professional
profiles. Reads, including data export, stay available. Apply the users
migrations before deploying this guard.

Reviews-service provides an internal `POST /reviews/privacy/:id/scrub`
operation. It removes the author ID and comment from reviews written by the
account holder. Ratings, booking references and rating synchronization state
are preserved. Repeating the operation is safe. Run
`npm run db:reviews:deploy` before using this operation.

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
