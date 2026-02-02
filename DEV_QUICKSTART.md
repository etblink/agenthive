# AgentHive — Dev Quickstart (local)

## Prereqs
- Node 22+
- Docker

## 1) Start everything (DB + migrate + API + indexer)
From `agenthive/`:

```bash
docker compose up -d --build
```

This will:
- start Postgres
- run migrations once via the `migrate` service
- start API + indexer after migrations complete

## 2) Local (non-docker) dev loop (optional)
If you want to run services directly with Node instead of Docker:

### Start Postgres

```bash
docker compose up -d db
```

### Run migrations

```bash
export DATABASE_URL='postgres://agenthive:agenthive@localhost:54321/agenthive'
cd packages/db
npm run db:migrate
```

### Run indexer

```bash
export DATABASE_URL='postgres://agenthive:agenthive@localhost:54321/agenthive'
export HIVE_RPC_URLS='https://api.hive.blog,https://anyx.io'
cd ../../apps/indexer

# Canonical ingestion: app-based (expects json_metadata.app == "agenthive/1.0")
npm run dev

# (Optional) PeakD/manual testing: allow tag-based ingestion when set.
# export AGENTHIVE_ACCEPT_TAGS=1
# npm run dev
```

### Run API

```bash
export DATABASE_URL='postgres://agenthive:agenthive@localhost:54321/agenthive'
cd ../../apps/api
npm run dev
```

API:
- http://localhost:3001/healthz
- http://localhost:3001/healthz/db
- http://localhost:3001/api/feed (default: canonical app-based AgentHive content)
- http://localhost:3001/api/feed?scope=tag (filter by tag; includes PeakD-tagged posts *if they were ingested*)
- http://localhost:3001/api/feed?scope=all

## Canonical posting (app-based)
PeakD will not set `json_metadata.app = "agenthive/1.0"`. For canonical AgentHive posts/comments, use HiveSigner (recommended for MVP) or a custom client.

HiveSigner helper page:
- Serve `agenthive/tools/` (e.g. `python3 -m http.server 5173`)
- Open: http://localhost:5173/hivesigner_post.html
