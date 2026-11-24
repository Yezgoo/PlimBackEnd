
#!/usr/bin/env bash

set -Eeuo pipefail

pids=()

stop() {
  echo "A terminar os serviços..."

  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done

  for pid in "${pids[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
}

trap 'exit 0' SIGTERM SIGINT
trap stop EXIT

start_service() {
  echo "A iniciar: $1"
  node "$1" &
  pids+=("$!")
}

# Serviços internos
start_service dist/apps/users-service/main.js
start_service dist/apps/catalog-service/main.js
start_service dist/apps/booking-service/main.js
start_service dist/apps/admin-service/main.js
#start_service dist/apps/payments-service/main.js
start_service dist/apps/reviews-service/main.js
#start_service dist/apps/notifications-service/main.js

# API Gateway (serviço público)
start_service dist/apps/api-gateway/main.js

echo "Todos os processos foram iniciados."

# Se algum serviço terminar, o container termina também.
wait -n "${pids[@]}"
