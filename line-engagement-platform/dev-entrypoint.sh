#!/bin/sh
set -e

echo "=== dev-entrypoint: start line-engagement-platform (app) ==="

# ถ้ามี script ชื่อ start ให้ใช้ก่อน
if npm run | grep -q "start"; then
  echo "[dev-entrypoint] Running: npm start"
  npm start

# ถ้ามี script ชื่อ dev (สำหรับโหมด dev) ให้ใช้รองลงมา
elif npm run | grep -q "dev"; then
  echo "[dev-entrypoint] Running: npm run dev"
  npm run dev

# fallback กรณีไม่มี script ข้างบน
else
  echo "[dev-entrypoint] Running: node dist/server.js"
  node dist/server.js
fi
