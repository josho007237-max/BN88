#!/bin/sh
set -e

echo "[entrypoint] waiting for postgres..."
n=0
until pg_isready -h "${POSTGRES_HOST:-postgres}" -p "${POSTGRES_PORT:-5432}" -U "${POSTGRES_USER:-postgres}" >/dev/null 2>&1 || [ $n -ge 30 ]; do
  n=$((n+1))
  echo "waiting for postgres... ($n)"
  sleep 1
done

echo "[entrypoint] generating prisma client..."
npx prisma generate

echo "[entrypoint] running prisma migrate (dev)..."
npx prisma migrate dev --name init --skip-seed || true

echo "[entrypoint] running seed..."
npm run prisma:seed || true

if [ "$1" = "worker" ]; then
  echo "[entrypoint] starting worker (dev)..."
  npm run dev:worker
else
  echo "[entrypoint] starting app (dev)..."
  npm run dev
fi
