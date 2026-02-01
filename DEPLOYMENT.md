# AgentHive — Deployment (v1 default)

Default target: **single VPS** running **docker-compose**.

## Components
- `web` (Next.js)
- `api` (Node/Fastify)
- `indexer` (Node)
- `jobs` (Node runners; can be separate container)
- `db` (Postgres)
- Optional: `redis` (later, for queues/caching)

## Hive data source
- Use **managed Hive RPC endpoints** (no self-hosted Hive node for v1).
- Maintain a small allowlist of RPC URLs and automatic failover.

## Operational notes
- Store last processed block + last irreversible block (LIB) in DB.
- Indexer should follow LIB to avoid reorg issues.
- All payout runs must support `--dry-run` and emit an auditable report artifact.
