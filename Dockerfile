
FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

ENV USERS_DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV CATALOG_DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV BOOKINGS_DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV ADMIN_DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

RUN npm run build

EXPOSE 3000

CMD ["bash", "start.sh"]
