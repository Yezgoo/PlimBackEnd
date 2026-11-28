# ---------- Stage 1: build (has all tools, never runs in production) ----------
FROM node:24-bookworm-slim AS build
WORKDIR /app

# Install dependencies first: Docker caches this layer, so it only reruns when package files change
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Generate the Prisma clients. The configs require a database URL, but generate never connects,
# so a placeholder is enough here.
RUN DUMMY=postgresql://build@localhost/build \
    USERS_DATABASE_URL=$DUMMY CATALOG_DATABASE_URL=$DUMMY \
    BOOKINGS_DATABASE_URL=$DUMMY ADMIN_DATABASE_URL=$DUMMY \
    sh -c "npm run db:users:generate && npm run db:catalog:generate && npm run db:bookings:generate && npm run db:admin:generate"

# Compile every service, then fail the build if any main.js is missing
RUN for app in api-gateway users-service catalog-service booking-service admin-service \
               payments-service reviews-service notifications-service; do \
      npx nest build "$app" || exit 1; \
    done && ls dist/apps/*/main.js

# ---------- Stage 2: runtime (small: production dependencies + compiled code only) ----------
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# start.sh runs several services in ONE container (the Render deployment). Strip Windows line
# endings first: a script checked out on Windows would otherwise fail with "invalid option".
COPY start.sh ./
RUN sed -i 's/\r$//' start.sh && chown node:node start.sh

USER node
EXPOSE 3000

# Default for platforms that start the image without a command (Render): every service in this container.
# infra/docker-compose.staging.yml overrides it with one service per container.
CMD ["bash", "start.sh"]
