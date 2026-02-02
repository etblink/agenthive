import { Client } from '@hiveio/dhive';
import crypto from 'node:crypto';
import { pool } from '@agenthive/db';

const rpcUrls = (process.env.HIVE_RPC_URLS ?? 'https://api.hive.blog')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const pollMs = Number(process.env.POLL_MS ?? 3000);
const batchSize = Math.max(1, Math.min(Number(process.env.BATCH_SIZE ?? 50), 500));

console.log(
  JSON.stringify({
    at: new Date().toISOString(),
    msg: 'indexer_start',
    rpcUrls,
    pollMs,
    batchSize,
    acceptTags: process.env.AGENTHIVE_ACCEPT_TAGS === '1'
  })
);

function dhiveClient() {
  // dhive Client accepts array of URLs
  return new Client(rpcUrls);
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function extractTags(jsonMetadata) {
  const tags = jsonMetadata?.tags;
  if (Array.isArray(tags)) return tags.filter((t) => typeof t === 'string');
  return [];
}

function isAgentHive(jsonMetadata) {
  // v1 canonical: app-based.
  // Allow tag-based ingestion only when explicitly enabled (useful for PeakD/manual testing).
  const acceptTags = process.env.AGENTHIVE_ACCEPT_TAGS === '1';
  const tags = extractTags(jsonMetadata);
  return jsonMetadata?.app === 'agenthive/1.0' || (acceptTags && tags.includes('agenthive'));
}

function bodyHash(body) {
  return crypto.createHash('sha256').update(body ?? '', 'utf8').digest('hex');
}

async function ensureAccount(name) {
  await pool.query(
    `insert into accounts(name) values ($1)
     on conflict (name) do nothing`,
    [name]
  );
}

async function upsertContent({
  author,
  permlink,
  parent_author,
  parent_permlink,
  created_at,
  title,
  body,
  json_metadata
}) {
  const tags = extractTags(json_metadata);
  const content_id = `@${author}/${permlink}`; // good enough for MVP
  const is_root = !parent_author;

  await pool.query(
    `insert into content(
        content_id, author, permlink, parent_author, parent_permlink,
        created_at, is_root, title, body, body_hash,
        json_metadata, tags, app, agent_kind, url
     ) values (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15
     )
     on conflict (content_id) do update set
        parent_author=excluded.parent_author,
        parent_permlink=excluded.parent_permlink,
        title=excluded.title,
        body=excluded.body,
        body_hash=excluded.body_hash,
        json_metadata=excluded.json_metadata,
        tags=excluded.tags,
        app=excluded.app,
        agent_kind=excluded.agent_kind,
        url=excluded.url`,
    [
      content_id,
      author,
      permlink,
      parent_author || null,
      parent_permlink || null,
      created_at,
      is_root,
      title || null,
      body || null,
      bodyHash(body),
      json_metadata,
      tags,
      json_metadata?.app ?? null,
      json_metadata?.agent?.kind ?? null,
      `https://peakd.com/@${author}/${permlink}`
    ]
  );
}

async function getChainState() {
  const { rows } = await pool.query('select * from chain_state where id=1');
  if (rows.length === 0) throw new Error('missing chain_state row');
  return rows[0];
}

async function setChainState({ lib, indexed }) {
  await pool.query(
    `update chain_state set last_irreversible_block_num=$1, last_indexed_block_num=$2, updated_at=now() where id=1`,
    [lib, indexed]
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry(fn, opts = {}) {
  const retries = Math.max(0, Number(opts.retries ?? 5));
  const baseMs = Math.max(50, Number(opts.baseMs ?? 250));
  let lastErr;

  for (let i = 0; i <= retries; i++) {
    try {
      return await fn(i);
    } catch (e) {
      lastErr = e;
      const backoff = Math.min(10_000, baseMs * 2 ** i);
      const jitter = Math.floor(Math.random() * 250);
      await sleep(backoff + jitter);
    }
  }
  throw lastErr;
}

function bootstrapIndexed({ lib, current }) {
  if (Number.isFinite(current) && current != null) return current;

  // Default: start close to head (LIB - lag).
  // Override with AGENTHIVE_BOOTSTRAP_LAG to control how far behind LIB we begin.
  const lag = Math.max(0, Number(process.env.AGENTHIVE_BOOTSTRAP_LAG ?? 50));
  return lib - lag;
}

async function mainLoop() {
  let client = dhiveClient();

  while (true) {
    try {
      const dgp = await withRetry(() => client.database.getDynamicGlobalProperties());
      const lib = dgp.last_irreversible_block_num;

      const st = await getChainState();
      let indexed = bootstrapIndexed({ lib, current: st.last_indexed_block_num });
      if (indexed < 1) indexed = 1;

      const target = Math.min(lib, indexed + batchSize);
      if (indexed >= target) {
        await setChainState({ lib, indexed });
        await sleep(pollMs);
        continue;
      }

      for (let bn = indexed + 1; bn <= target; bn++) {
        const block = await withRetry(() => client.database.getBlock(bn), { retries: 6, baseMs: 200 });
        const created_at = new Date(block.timestamp + 'Z');

        if (bn % 100 === 0) {
          console.log(
            JSON.stringify({
              at: new Date().toISOString(),
              msg: 'indexer_heartbeat',
              bn,
              lib,
              rpcUrls,
            })
          );
        }

        for (const tx of block.transactions ?? []) {
          for (const op of tx.operations ?? []) {
            if (!Array.isArray(op) || op.length < 2) continue;
            const [opType, opBody] = op;
            if (opType !== 'comment') continue;

            const jm = safeJsonParse(opBody.json_metadata ?? '') ?? {};
            if (!isAgentHive(jm)) continue;

            await ensureAccount(opBody.author);

            await upsertContent({
              author: opBody.author,
              permlink: opBody.permlink,
              parent_author: opBody.parent_author || null,
              parent_permlink: opBody.parent_permlink || null,
              created_at,
              title: opBody.title || null,
              body: opBody.body || null,
              json_metadata: jm
            });
          }
        }

        indexed = bn;
        await setChainState({ lib, indexed });
      }
    } catch (err) {
      console.error('indexer loop error:', err);
      // Recreate client in case an endpoint got wedged.
      try {
        client = dhiveClient();
      } catch {}
      await sleep(pollMs);
    }
  }
}

mainLoop();
