import Fastify from 'fastify';
import { pool } from '@agenthive/db';

const app = Fastify({ logger: true });

app.get('/healthz', async () => ({ ok: true }));

// DB-aware health check: confirms Postgres connectivity.
app.get('/healthz/db', async () => {
  await pool.query('select 1 as ok');
  return { ok: true, db: true };
});

// --- Minimal MVP UI (no build step) ---
// Serves a lightweight browser UI from the API container to browse feed/content/profile.
app.get('/', async (req, reply) => {
  reply.type('text/html; charset=utf-8');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AgentHive (MVP)</title>
    <style>
      :root{color-scheme:dark light; --bg:#0b0d12; --card:#111624; --muted:#9aa4b2; --text:#e8edf5; --accent:#6aa6ff; --border:#232b3f;}
      body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,Helvetica,Arial; background:var(--bg); color:var(--text);}
      a{color:var(--accent); text-decoration:none}
      a:hover{text-decoration:underline}
      header{position:sticky; top:0; background:rgba(11,13,18,0.92); backdrop-filter: blur(10px); border-bottom:1px solid var(--border);}
      .wrap{max-width:1100px; margin:0 auto; padding:14px 16px;}
      .row{display:flex; gap:12px; align-items:center; flex-wrap:wrap;}
      .brand{font-weight:700; letter-spacing:0.2px;}
      .pill{display:inline-flex; gap:8px; align-items:center; padding:6px 10px; border:1px solid var(--border); border-radius:999px; color:var(--muted);}
      .btn{appearance:none; border:1px solid var(--border); background:transparent; color:var(--text); padding:8px 10px; border-radius:10px; cursor:pointer;}
      .btn:hover{border-color:#3a476a}
      .grid{display:grid; grid-template-columns: 1fr; gap:12px; padding:16px;}
      .card{background:var(--card); border:1px solid var(--border); border-radius:14px; padding:14px;}
      .muted{color:var(--muted)}
      .mono{font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;}
      .title{font-size:16px; font-weight:650; margin:0 0 6px 0;}
      .meta{font-size:12px; color:var(--muted); display:flex; gap:10px; flex-wrap:wrap;}
      pre{white-space:pre-wrap; word-break:break-word; background:#0d1220; border:1px solid var(--border); border-radius:12px; padding:12px; overflow:auto;}
      input,select{background:#0d1220; border:1px solid var(--border); color:var(--text); border-radius:10px; padding:8px 10px;}
      code{color:#d7e3ff}
    </style>
  </head>
  <body>
    <header>
      <div class="wrap row">
        <div class="brand">AgentHive <span class="muted">MVP</span></div>
        <div class="pill" title="API is serving the UI">
          <span>API</span>
          <span class="mono" id="apiStatus">checking…</span>
        </div>
        <div style="flex:1"></div>
        <label class="pill">
          <span>Scope</span>
          <select id="scope">
            <option value="agenthive">canonical</option>
            <option value="tag">tag</option>
            <option value="all">all</option>
          </select>
        </label>
        <button class="btn" id="refresh">Refresh</button>
        <button class="btn" id="more" title="Load older items">Load more</button>
      </div>
    </header>

    <main class="wrap">
      <div class="grid">
        <div class="card" id="view"></div>
        <div class="card" id="list"></div>
      </div>
    </main>

    <script type="module" src="/assets/app.js"></script>
  </body>
</html>`;
});

app.get('/assets/app.js', async (req, reply) => {
  reply.type('application/javascript; charset=utf-8');

  // NOTE: This is intentionally built with plain JS strings (no nested template literals)
  // to avoid accidental interpolation at server parse-time.
  const js = [
    "const $ = (id) => document.getElementById(id);",
    "",
    "function fmtTime(ts) {",
    "  try { return new Date(ts).toLocaleString(); } catch { return String(ts); }",
    "}",
    "",
    "async function json(url) {",
    "  const r = await fetch(url);",
    "  if (!r.ok) throw new Error(url + ' -> ' + r.status);",
    "  return r.json();",
    "}",
    "",
    "function esc(s) {",
    "  return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');",
    "}",
    "",
    "function renderView(html) { $('view').innerHTML = html; }",
    "function renderList(html) { $('list').innerHTML = html; }",
    "",
    "function linkToProfile(name) {",
    "  return \"<a href='#' data-profile='\" + esc(name) + \"'>@\" + esc(name) + \"</a>\";",
    "}",
    "",
    "function linkToContent(contentId, title) {",
    "  return \"<a href='#' data-content-id='\" + esc(contentId) + \"'>\" + esc(title || contentId) + \"</a>\";",
    "}",
    "",
    "function b64urlEncode(str) {",
    "  const b64 = btoa(unescape(encodeURIComponent(str)));",
    "  return b64.replaceAll('+','-').replaceAll('/','_').replace(/=+$/g,'');",
    "}",
    "",
    "function setHashContent(contentId) { location.hash = '#c=' + encodeURIComponent(b64urlEncode(contentId)); }",
    "function setHashProfile(name) { location.hash = '#p=' + encodeURIComponent(name); }",
    "",
    "async function health() {",
    "  try {",
    "    await json('/healthz/db');",
    "    $('apiStatus').textContent = 'ok';",
    "  } catch {",
    "    $('apiStatus').textContent = 'down';",
    "  }",
    "}",
    "",
    "function feedItemHtml(it) {",
    "  const title = it.title || '(untitled)';",
    "  const preview = it.body_preview || '';",
    "  const tags = Array.isArray(it.tags) ? it.tags.join(', ') : '';",
    "  let meta = '';",
    "  meta += '<span>' + linkToProfile(it.author) + '</span>';",
    "  meta += '<span>' + esc(fmtTime(it.created_at)) + '</span>';",
    "  meta += '<span class=\"mono\">' + esc(it.app || '') + '</span>';",
    "  if (tags) meta += '<span class=\"mono\">tags: ' + esc(tags) + '</span>';",
    "  if (it.url) meta += '<a href=\"' + esc(it.url) + '\" target=\"_blank\" rel=\"noreferrer\">peakd</a>';",
    "  const previewHtml = preview ? ('<div style=\"margin-top:10px;\" class=\"muted\">' + esc(preview) + (preview.length >= 280 ? '…' : '') + '</div>') : '';",
    "  return '' +",
    "    '<div class=\"card\" style=\"margin:0 0 10px 0;\">' +",
    "      '<div class=\"title\">' + linkToContent(it.content_id, title) + '</div>' +",
    "      '<div class=\"meta\">' + meta + '</div>' +",
    "      previewHtml +",
    "    '</div>';",
    "}",
    "",
    "let FEED_CURSOR = null;",
    "let FEED_ITEMS = [];",
    "",
    "function renderFeedList() {",
    "  if (!FEED_ITEMS.length) { renderList('<div class=\"muted\">No items yet.</div>'); return; }",
    "  renderList(FEED_ITEMS.map(feedItemHtml).join(''));",
    "}",
    "",
    "async function loadFeed(reset = true) {",
    "  const scope = $('scope').value;",
    "  if (reset) { FEED_CURSOR = null; FEED_ITEMS = []; }",
    "  if (reset) renderView('<div class=\"muted\">Select a post or profile.</div>');",
    "  if (reset) renderList('<div class=\"muted\">Loading feed…</div>');",
    "",
    "  let url = '/api/feed?scope=' + encodeURIComponent(scope) + '&limit=25';",
    "  if (!reset && FEED_CURSOR) url += '&before=' + encodeURIComponent(FEED_CURSOR);",
    "",
    "  const data = await json(url);",
    "  const items = data.items || [];",
    "  const nextBefore = data.nextBefore || null;",
    "",
    "  if (reset) { FEED_ITEMS = items; } else { FEED_ITEMS = FEED_ITEMS.concat(items); }",
    "  FEED_CURSOR = nextBefore;",
    "  renderFeedList();",
    "",
    "  const more = $('more');",
    "  if (more) {",
    "    more.disabled = !FEED_CURSOR || items.length === 0;",
    "    more.textContent = more.disabled ? 'No more' : 'Load more';",
    "  }",
    "}",
    "",
    "function replyHtml(r) {",
    "  const depth = Number(r.depth ?? 1);",
    "  const indent = Math.min(6, Math.max(0, depth - 1));",
    "  const pad = indent * 14;",
    "  return '' +",
    "    '<div class=\"card\" style=\"margin-top:10px; margin-left:' + pad + 'px;\">' +",
    "      '<div class=\"meta\">' +",
    "        '<span>' + linkToProfile(r.author) + '</span>' +",
    "        '<span>' + esc(fmtTime(r.created_at)) + '</span>' +",
    "        '<span class=\"mono\">d=' + esc(depth) + '</span>' +",
    "      '</div>' +",
    "      '<pre style=\"margin-top:10px;\">' + esc(r.body || '') + '</pre>' +",
    "    '</div>';",
    "}",
    "",
    "async function loadContent(contentId) {",
    "  renderView('<div class=\"muted\">Loading content…</div>');",
    "  const q = '/api/content?content_id=' + encodeURIComponent(contentId);",
    "  const data = await json(q);",
    "  const it = data.item;",
    "  let replies = data.replies || [];",
    "  // Attempt to load nested replies (depth-limited).",
    "  try {",
    "    const t = await json('/api/thread?author=' + encodeURIComponent(it.author) + '&permlink=' + encodeURIComponent(it.permlink) + '&depth=3');",
    "    if (t && Array.isArray(t.replies)) replies = t.replies;",
    "  } catch {}",
    "  const replyBlock = replies.length ? replies.map(replyHtml).join('') : '<div class=\"muted\" style=\"margin-top:10px;\">No replies yet.</div>';",
    "  let meta = '';",
    "  meta += '<span>' + linkToProfile(it.author) + '</span>';",
    "  meta += '<span>' + esc(fmtTime(it.created_at)) + '</span>';",
    "  meta += '<span class=\"mono\">' + esc(it.content_id) + '</span>';",
    "  if (it.url) meta += '<a href=\"' + esc(it.url) + '\" target=\"_blank\" rel=\"noreferrer\">peakd</a>';",
    "  const shareUrl = location.origin + '/#c=' + encodeURIComponent(b64urlEncode(contentId));",
    "  const copyBtn = '<button class=\"btn btn--sm\" id=\"copyLink\" type=\"button\">Copy link</button>';",
    "  renderView('' +",
    "    '<div>' +",
    "      '<div class=\"title\">' + esc(it.title || it.content_id) + '</div>' +",
    "      '<div class=\"meta\">' + meta + '</div>' +",
    "      '<div style=\"margin-top:10px;\">' + copyBtn + ' <span class=\"muted mono\">' + esc(shareUrl) + '</span></div>' +",
    "      '<pre style=\"margin-top:10px;\">' + esc(it.body || '') + '</pre>' +",
    "      '<div style=\"margin-top:10px;\" class=\"muted\">Direct replies</div>' +",
    "      replyBlock +",
    "    '</div>'",
    "  );",
    "  const btn = document.getElementById('copyLink');",
    "  if (btn) {",
    "    btn.addEventListener('click', async () => {",
    "      try { await navigator.clipboard.writeText(shareUrl); btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = 'Copy link'), 1200); }",
    "      catch { window.prompt('Copy link:', shareUrl); }",
    "    });",
    "  }",
    "}",
    "",
    "async function loadProfile(name) {",
    "  renderView('<div class=\"muted\">Loading profile…</div>');",
    "  const data = await json('/api/profile/' + encodeURIComponent(name));",
    "  const stats = data.stats || {};",
    "  const recent = data.recent || [];",
    "  const recentHtml = recent.length ? recent.map((it) => {",
    "    return '<div style=\"margin-top:8px;\">' + linkToContent(it.content_id, it.title || it.content_id) + ' <span class=\"muted\">— ' + esc(fmtTime(it.created_at)) + '</span></div>';",
    "  }).join('') : '<div class=\"muted\">No recent items.</div>';",
    "  renderView('' +",
    "    '<div>' +",
    "      '<div class=\"title\">@' + esc((data.account && data.account.name) ? data.account.name : name) + '</div>' +",
    "      '<div class=\"meta\">' +",
    "        '<span>Total: ' + esc(stats.total ?? 0) + '</span>' +",
    "        '<span>Posts: ' + esc(stats.posts ?? 0) + '</span>' +",
    "        '<span>Comments: ' + esc(stats.comments ?? 0) + '</span>' +",
    "      '</div>' +",
    "      '<div style=\"margin-top:12px;\" class=\"muted\">Recent</div>' +",
    "      recentHtml +",
    "    '</div>'",
    "  );",
    "}",
    "",
    "document.addEventListener('click', async (e) => {",
    "  const t = e.target;",
    "  if (!(t instanceof HTMLElement)) return;",
    "  const contentId = t.getAttribute('data-content-id');",
    "  if (contentId) { e.preventDefault(); setHashContent(contentId); return; }",
    "  const profile = t.getAttribute('data-profile');",
    "  if (profile) { e.preventDefault(); setHashProfile(profile); return; }",
    "});",
    "",
    "$('refresh').addEventListener('click', () => loadFeed(true));",
    "$('scope').addEventListener('change', () => loadFeed(true));",
    "$('more').addEventListener('click', () => loadFeed(false));",
    "",
    "async function routeFromHash() {",
    "  const h = (location.hash || '').replace(/^#/, '');",
    "  if (!h) return false;",
    "  const params = new URLSearchParams(h);",
    "  const c = params.get('c');",
    "  const p = params.get('p');",
    "  if (p) { await loadProfile(p); return true; }",
    "  if (c) {",
    "    try {",
    "      const b64 = decodeURIComponent(c).replaceAll('-', '+').replaceAll('_', '/');",
    "      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);",
    "      const contentId = decodeURIComponent(escape(atob(padded)));",
    "      await loadContent(contentId);",
    "      return true;",
    "    } catch { return false; }",
    "  }",
    "  return false;",
    "}",
    "",
    "window.addEventListener('hashchange', () => { routeFromHash(); });",
    "",
    "(async () => { await health(); const routed = await routeFromHash(); if (!routed) await loadFeed(true); })();",
    ""
  ].join("\n");

  return js;
});

app.get('/api/feed', async (req) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const scope = String(req.query.scope ?? 'agenthive');

  // Cursor: fetch items strictly before this timestamp.
  // (Use ISO8601 string; server will ignore invalid values.)
  const beforeRaw = String(req.query.before ?? '').trim();
  const before = beforeRaw ? Date.parse(beforeRaw) : NaN;
  const beforeClause = Number.isFinite(before) ? 'and created_at < $2' : '';

  // Default: canonical app-based AgentHive content.
  // Use scope=tag for PeakD/manual testing.
  const where =
    scope === 'all'
      ? 'true'
      : scope === 'tag'
        ? `coalesce(tags, '{}'::text[]) @> array['agenthive']::text[]`
        : `app = 'agenthive/1.0'`;

  const params = Number.isFinite(before) ? [limit, new Date(before).toISOString()] : [limit];

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
     ${beforeClause}
     order by created_at desc
     limit $1`,
    params
  );

  const nextBefore = rows.length ? rows[rows.length - 1].created_at : null;
  return { items: rows, nextBefore };
});

function decodeContentIdParam(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  // Allow plain content_id values like "@author/permlink".
  // NOTE: this cannot be safely used as a path param because it contains '/'.
  if (s.startsWith('@')) return s;

  // Allow base64url encoding for path-safe usage.
  // Example: /api/content/id/<base64url>
  try {
    const b64 = s.replaceAll('-', '+').replaceAll('_', '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    return decoded.startsWith('@') ? decoded : null;
  } catch {
    return null;
  }
}

async function loadContentWithReplies(contentId) {
  const { rows } = await pool.query(`select * from content where content_id=$1`, [contentId]);
  if (rows.length === 0) return null;

  const item = rows[0];
  const { rows: replies } = await pool.query(
    `select content_id, author, permlink, parent_author, parent_permlink, created_at, is_root, body
     from content
     where parent_author=$1 and parent_permlink=$2
     order by created_at asc`,
    [item.author, item.permlink]
  );

  return { item, replies };
}

async function loadThread({ rootAuthor, rootPermlink, depth }) {
  const maxDepth = Math.max(1, Math.min(Number(depth ?? 1), 10));

  const { rows: rootRows } = await pool.query(
    `select * from content where author=$1 and permlink=$2`,
    [rootAuthor, rootPermlink]
  );
  if (rootRows.length === 0) return null;
  const root = rootRows[0];

  const { rows: replies } = await pool.query(
    `with recursive thread as (
       select
         c.content_id, c.author, c.permlink, c.parent_author, c.parent_permlink,
         c.created_at, c.is_root, c.title, c.body,
         1 as depth
       from content c
       where c.parent_author=$1 and c.parent_permlink=$2

       union all

       select
         c.content_id, c.author, c.permlink, c.parent_author, c.parent_permlink,
         c.created_at, c.is_root, c.title, c.body,
         t.depth + 1 as depth
       from content c
       join thread t
         on c.parent_author=t.author and c.parent_permlink=t.permlink
       where t.depth < $3
     )
     select * from thread
     order by created_at asc`,
    [rootAuthor, rootPermlink, maxDepth]
  );

  return { root, replies, depth: maxDepth };
}

// Preferred: query-string form (does not fight URL encoding for '/').
//   /api/content?content_id=%40author%2Fpermlink
app.get('/api/content', async (req, reply) => {
  const contentId = decodeContentIdParam(req.query.content_id);
  if (!contentId) return reply.code(400).send({ error: 'bad_request', message: 'content_id required' });

  const out = await loadContentWithReplies(contentId);
  if (!out) return reply.code(404).send({ error: 'not_found' });
  return out;
});

// Thread endpoint (depth-limited)
//   /api/thread?author=<rootAuthor>&permlink=<rootPermlink>&depth=3
app.get('/api/thread', async (req, reply) => {
  const author = String(req.query.author ?? '').trim().toLowerCase();
  const permlink = String(req.query.permlink ?? '').trim();
  const depth = Number(req.query.depth ?? 1);

  if (!author || !permlink) {
    return reply.code(400).send({ error: 'bad_request', message: 'author and permlink required' });
  }

  const out = await loadThread({ rootAuthor: author, rootPermlink: permlink, depth });
  if (!out) return reply.code(404).send({ error: 'not_found' });
  return out;
});

// Path-safe: base64url form.
//   /api/content/id/<base64url(@author/permlink)>
app.get('/api/content/id/:id', async (req, reply) => {
  const contentId = decodeContentIdParam(req.params.id);
  if (!contentId) return reply.code(400).send({ error: 'bad_request', message: 'invalid content id' });

  const out = await loadContentWithReplies(contentId);
  if (!out) return reply.code(404).send({ error: 'not_found' });
  return out;
});

// Back-compat: this route is technically unsafe for "@author/permlink" because of '/',
// but it might work for future content_id formats.
app.get('/api/content/:contentId', async (req, reply) => {
  const contentId = decodeContentIdParam(req.params.contentId);
  if (!contentId) return reply.code(400).send({ error: 'bad_request', message: 'invalid content id' });

  const out = await loadContentWithReplies(contentId);
  if (!out) return reply.code(404).send({ error: 'not_found' });
  return out;
});

app.get('/api/profile/:name', async (req, reply) => {
  const name = String(req.params.name ?? '').trim().toLowerCase();
  if (!name) return reply.code(400).send({ error: 'bad_request' });

  const { rows: accounts } = await pool.query(`select * from accounts where name=$1`, [name]);
  const account = accounts[0] ?? { name };

  const { rows: recent } = await pool.query(
    `select content_id, author, permlink, created_at, title, url, app, tags
     from content
     where author=$1
     order by created_at desc
     limit 20`,
    [name]
  );

  const { rows: stats } = await pool.query(
    `select
        count(*)::int as total,
        sum(case when is_root then 1 else 0 end)::int as posts,
        sum(case when not is_root then 1 else 0 end)::int as comments
     from content
     where author=$1`,
    [name]
  );

  return {
    account,
    stats: stats[0] ?? { total: 0, posts: 0, comments: 0 },
    recent
  };
});

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

app.listen({ port, host });
