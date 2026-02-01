import Fastify from 'fastify';
import { pool } from '@agenthive/db';

const app = Fastify({ logger: true });

app.get('/healthz', async () => ({ ok: true }));

// DB-aware health check: confirms Postgres connectivity.
app.get('/healthz/db', async () => {
  await pool.query('select 1 as ok');
  return { ok: true, db: true };
});

app.get('/api/feed', async (req) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const scope = String(req.query.scope ?? 'agenthive');

  // Default: canonical app-based AgentHive content.
  // Use scope=tag for PeakD/manual testing.
  const where =
    scope === 'all'
      ? 'true'
      : scope === 'tag'
        ? `coalesce(tags, '{}'::text[]) @> array['agenthive']::text[]`
        : `app = 'agenthive/1.0'`;

  const { rows } = await pool.query(
    `select
        content_id,
        author,
        permlink,
        parent_author,
        parent_permlink,
        created_at,
        is_root,
        title,
        url,
        app,
        tags,
        left(body, 280) as body_preview
     from content
     where ${where}
     order by created_at desc
     limit $1`,
    [limit]
  );
  return { items: rows };
});

app.get('/api/content/:contentId', async (req, reply) => {
  const contentId = req.params.contentId;
  const { rows } = await pool.query(`select * from content where content_id=$1`, [contentId]);
  if (rows.length === 0) return reply.code(404).send({ error: 'not_found' });

  // naive thread: direct replies only (MVP)
  const item = rows[0];
  const { rows: replies } = await pool.query(
    `select content_id, author, permlink, parent_author, parent_permlink, created_at, is_root, body
     from content
     where parent_author=$1 and parent_permlink=$2
     order by created_at asc`,
    [item.author, item.permlink]
  );

  return { item, replies };
});

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

app.listen({ port, host });
