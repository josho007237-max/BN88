# Usage: run the LINE Engagement Platform locally

1. Copy environment template and fill secrets:
   ```bash
   cp .env.example .env
   ```
2. Allow the dev entrypoint script to run inside the container:
   ```bash
   chmod +x dev-entrypoint.sh
   ```
3. Start the dev stack (app + worker + Postgres + Redis) with hot reload:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.override.yml up --build
   ```
4. Key endpoints after the stack is up:
   - API health: `GET http://localhost:8080/health`
   - LINE webhook: `POST http://localhost:8080/webhook/line`
   - Bull Board (basic auth via `BULL_BOARD_USER` / `BULL_BOARD_PASS`): `http://localhost:8080/admin/queues`

To build a production-style image/stack, swap the override file for `docker-compose.prod.yml` and start the services the same way.
