# AI Command Center / BN9 Admin Overview (v1)

## A. Current Features Implemented

### Backend (bn88-backend-v12)
- **Authentication & health**: Basic health check plus login endpoints exposed under `/api/health` and `/api/auth` for session cookies/JWT to protect admin routes and AI utilities.【F:bn88-backend-v12/src/routes/index.ts†L31-L45】
- **Bot management (read)**: Bot listing and summary, including config and masked secrets, via `/api/bots` and `/api/bots/:id/summary` for admin consumers.【F:bn88-backend-v12/src/routes/index.ts†L34-L36】【F:bn88-backend-v12/src/routes/bots.summary.ts†L1-L34】
- **AI answering with knowledge**: `/api/ai/answer` accepts `botId` + `message`, fetches bot config/secrets, retrieves relevant knowledge chunks, and responds using configured OpenAI model with snippets returned for UI context.【F:bn88-backend-v12/src/routes/ai/answer.ts†L18-L90】
- **Knowledge admin APIs**: CRUD for knowledge docs/chunks plus linking docs to bots, exposed under `/api/admin/ai/knowledge` and `/api/admin/ai/knowledge/bots/:botId` to back the Knowledge UI and RAG context for answers.【F:bn88-backend-v12/src/routes/admin/ai/knowledge.ts†L90-L377】
- **Chat Center backend**: Admin chat routes for listing chat sessions, fetching messages, and replying to end-users across LINE/Telegram via `/api/admin/chat/sessions`, `/api/admin/chat/sessions/:id/messages`, and `/api/admin/chat/sessions/:id/reply` (handles LINE push and Telegram send).【F:bn88-backend-v12/src/routes/admin/chat.ts†L44-L138】【F:bn88-backend-v12/src/routes/admin/chat.ts†L140-L221】
- **Case tracking**: Case creation plus recent-case feeds by bot or tenant at `/api/cases` and `/api/cases/:tenant/recent`, emitting live events for dashboards.【F:bn88-backend-v12/src/routes/cases.ts†L19-L116】【F:bn88-backend-v12/src/routes/cases.ts†L130-L176】
- **Stats**: Daily and range aggregates for message/follow metrics per bot via `/api/stats/daily` and `/api/stats/range` for dashboard charts.【F:bn88-backend-v12/src/routes/stats.ts†L18-L76】【F:bn88-backend-v12/src/routes/stats.ts†L78-L113】
- **LINE webhook intake**: Routing for `/api/webhooks/line` (from `routes/index.ts`) to ingest messages/events for further processing (logic already wired into server).【F:bn88-backend-v12/src/routes/index.ts†L47-L62】
- **LEP connectivity check**: `/api/admin/lep/health` pings line-engagement-platform and reports status for operators.【F:bn88-backend-v12/src/routes/admin/lep.ts†L7-L26】

### Frontend / BN9 Admin (bn88-frontend-dashboard-v12)
- **Authentication flow**: Login page for obtaining admin session before accessing dashboard pages.【F:bn88-frontend-dashboard-v12/src/pages/Login.tsx†L1-L120】
- **Dashboard metrics**: Dashboard widgets read from stats and case feeds to summarize bot performance and recent issues (charts/cards visible on `Dashboard.tsx`).【F:bn88-frontend-dashboard-v12/src/pages/Dashboard.tsx†L1-L200】
- **Bot configuration views**: Pages for bot list/detail/secrets/presets to inspect configuration and credentials (read-only in this branch).【F:bn88-frontend-dashboard-v12/src/pages/Bots.tsx†L1-L200】【F:bn88-frontend-dashboard-v12/src/pages/BotDetail.tsx†L1-L200】
- **Knowledge management UI**: CRUD UI for knowledge docs/chunks plus bot linkage, backed by admin knowledge APIs to feed AI context.【F:bn88-frontend-dashboard-v12/src/pages/Knowledge.tsx†L1-L200】【F:bn88-frontend-dashboard-v12/src/pages/Knowledge.tsx†L200-L420】
- **Chat Center UI**: Polls chat sessions by bot, displays messages, and lets admins reply through backend routes with intent badges and platform filtering options.【F:bn88-frontend-dashboard-v12/src/pages/ChatCenter.tsx†L1-L120】【F:bn88-frontend-dashboard-v12/src/pages/ChatCenter.tsx†L120-L340】
- **Case list**: Case feed page showing recent cases per bot for handoff visibility.【F:bn88-frontend-dashboard-v12/src/pages/Cases.tsx†L1-L200】
- **LEP health page**: Simple monitoring card that calls `/api/admin/lep/health` and surfaces the JSON response for connectivity verification.【F:bn88-frontend-dashboard-v12/src/pages/MarketingLep.tsx†L1-L80】

### Line Engagement Platform (line-engagement-platform)
- **LINE webhook listener**: `/webhook/line` entry that forwards events to controller for campaign/engagement handling.【F:line-engagement-platform/src/routes/webhook.routes.ts†L1-L8】
- **Campaign orchestration skeleton**: Endpoints to list audiences and schedule/enqueue campaigns along with OAuth-like login start/callback flows to obtain LINE tokens.【F:line-engagement-platform/src/routes/campaign.routes.ts†L1-L16】
- **Analytics event feed**: Streaming endpoint `/analytics/events` to retrieve engagement events.【F:line-engagement-platform/src/routes/analytics.routes.ts†L1-L7】

## B. Partially Implemented / Incomplete

- **Chat Center filtering/search**: Frontend keeps a `sessionQuery` filter and platform selector but relies on client-side filtering of the polled 50 sessions; backend lacks query parameters for search/pagination, limiting usability for large histories.【F:bn88-frontend-dashboard-v12/src/pages/ChatCenter.tsx†L48-L119】【F:bn88-backend-v12/src/routes/admin/chat.ts†L74-L111】 Missing pieces: server-side search/sort, pagination, and intent filters on `/api/admin/chat/sessions`, plus UI controls to trigger them.
- **Conversation analytics & intent tagging**: Message structures include intent codes/badges, but there is no aggregation API or dashboard widget summarizing intents across sessions/days.【F:bn88-frontend-dashboard-v12/src/pages/ChatCenter.tsx†L20-L47】 Needed: backend aggregations (stats per intent) and frontend charts.
- **LEP monitoring/control surface**: Backend only exposes health check to LEP; frontend `MarketingLep` shows connectivity JSON but lacks campaign status, queue depth, or retry controls even though LEP has campaign routes and queues defined.【F:bn88-backend-v12/src/routes/admin/lep.ts†L7-L26】【F:bn88-frontend-dashboard-v12/src/pages/MarketingLep.tsx†L1-L80】【F:line-engagement-platform/src/routes/campaign.routes.ts†L1-L16】 Missing: admin APIs to proxy campaign/queue data, UI tables/controls, and alerts.
- **Knowledge usage transparency**: AI answer endpoint returns `context` snippets but Chat Center UI does not display which knowledge was used when the AI responds or allow reranking.【F:bn88-backend-v12/src/routes/ai/answer.ts†L64-L90】【F:bn88-frontend-dashboard-v12/src/pages/ChatCenter.tsx†L120-L210】 Missing: UI surface for context preview, feedback controls, and backend logging of snippet performance.
- **Case lifecycle management**: Cases can be created/listed, yet there is no status transition/assignment/resolution workflow or admin UI for updates—currently only recent feeds are visible.【F:bn88-backend-v12/src/routes/cases.ts†L19-L116】【F:bn88-frontend-dashboard-v12/src/pages/Cases.tsx†L1-L200】 Needed: status fields, assignment APIs, and UI for triage/resolution.
- **LEP event analytics bridge**: LEP exposes `/analytics/events`, but backend/admin do not consume or visualize it, leaving engagement telemetry unused.【F:line-engagement-platform/src/routes/analytics.routes.ts†L1-L7】 Missing: ingestion worker in BN9 backend and dashboard charts.

## C. Not Implemented Yet (but suitable for this architecture)

- **Multi-tenant admin switching**: UI toggle and backend guardrails for switching tenants, with scoped dashboards, chat sessions, and knowledge bases.
- **Additional channel connectors**: Webhooks and push/reply support for Telegram/Facebook/WhatsApp alongside LINE, plus channel-specific secret management and bot provisioning flows.
- **Automated intent training loop**: Tooling to review misclassified intents, label transcripts, and retrain/update intent models with export/import pipelines.
- **Service-level alerts & on-call**: Notifications for webhook failures, queue backlogs, or AI errors delivered to Slack/LINE along with runbook links.
- **Advanced analytics**: Cohort retention, response SLAs, and CSAT capture with dashboards and CSV exports.

## D. Suggested Roadmap (next 2–3 sprints)

1. **Chat Center search & triage** (Risk: Medium)
   - Backend: add query/pagination parameters and intent filters to `/api/admin/chat/sessions` plus sortable message retrieval in `bn88-backend-v12/src/routes/admin/chat.ts`.
   - Frontend: extend `ChatCenter` filters, search box, and pagination controls; surface knowledge context per reply.

2. **Case lifecycle & assignments** (Risk: Medium)
   - Backend: introduce status/assignee fields and update endpoints in `bn88-backend-v12/src/routes/cases.ts` and corresponding Prisma schema/migrations.
   - Frontend: add case detail view and actions (assign, resolve, reopen) on `Cases` page with toast/error handling.

3. **LEP campaign monitoring & controls** (Risk: High, LEP-related)
   - Backend: create admin proxy endpoints that read campaign queue status and recent runs from `line-engagement-platform` (e.g., wrap `campaign.routes`/Bull queues) and expose to BN9 Admin.
   - Frontend: expand `MarketingLep` into dashboard cards for queue depth, campaign schedules, and manual retry/pause buttons.

4. **Multi-tenant & channel expansion** (Risk: High)
   - Backend: enforce tenant headers, per-channel secrets, and webhook handlers for Telegram/Facebook in `bn88-backend-v12/src/routes/webhooks` plus bot config screens.
   - Frontend: tenant switcher in navbar and channel setup forms; mirror new connectors in chat/case filters.

5. **Analytics & intent insights** (Risk: Medium)
   - Backend: aggregate intents/events (consume LEP `/analytics/events`) into `StatDaily`-like tables and expose `/api/stats/intents`.
   - Frontend: new dashboard widgets and exports showing intent trends, CSAT (when added), and bot/tenant comparisons.
