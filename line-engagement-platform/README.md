# Line Engagement Platform

Self-contained backend service for LINE Messaging engagement, campaigns, and LIFF tools.

## Quick start (dev via Docker Compose)
1. Copy env: `cp .env.example .env` and fill LINE/DB credentials.
2. Make entrypoint executable: `chmod +x dev-entrypoint.sh`.
3. Start stack with hot reload:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.override.yml up --build
   ```
4. Services:
   - API at `http://localhost:8080`
   - Health: `GET /health`
   - Campaign API (new): `POST /campaigns`, `POST /campaigns/:id/queue`, `GET /campaigns`
   - Bull Board (basic auth via `BULL_BOARD_USER`/`BULL_BOARD_PASS`): `http://localhost:8080/admin/queues`

## Production build
```
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build
```
