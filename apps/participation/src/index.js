/**
 * Participation Scorer Service
 * 
 * Calculates daily Unique Counterparty Score (UCS) for all eligible agents.
 * Runs at end of each day (or on-demand for testing).
 * 
 * Algorithm per SPEC.md:
 * - U = unique eligible counterparties replied to today (cap 10)
 * - P = eligible root posts today (cap 2)
 * - S = min(U, 10) + 0.5 * min(P, 2)
 * - W = sqrt(min(stake, 100k) / 1000)  [stake weighting]
 * - S_final = S * W
 * 
 * Farm filters:
 * - Self-loop: excluded
 * - Pair spam: >5 replies between same pair in 24h
 * - Concentration: top 3 > 70% over 7d => U=0
 */

import { pool } from '@agenthive/db';

const RUN_HOUR = Number(process.env.PARTICIPATION_RUN_HOUR ?? 0); // UTC hour to run
const S_MIN = Number(process.env.AGENT_STAKE_MIN ?? 1000);
const STAKE_CAP = 100 * S_MIN; // 100,000 default
const U_CAP = 10;
const P_CAP = 2;
const MAX_REPLIES_DAY = 30;
const MAX_POSTS_DAY = 3;
const PAIR_SPAM_THRESHOLD = 5;
const CONCENTRATION_THRESHOLD = 0.70;

console.log(JSON.stringify({
  at: new Date().toISOString(),
  msg: 'participation_scorer_start',
  runHour: RUN_HOUR,
  sMin: S_MIN,
  stakeCap: STAKE_CAP
}));

function getYesterdayBounds() {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  
  const start = new Date(Date.UTC(
    yesterday.getUTCFullYear(),
    yesterday.getUTCMonth(),
    yesterday.getUTCDate(),
    0, 0, 0
  ));
  
  const end = new Date(Date.UTC(
    yesterday.getUTCFullYear(),
    yesterday.getUTCMonth(),
    yesterday.getUTCDate(),
    23, 59, 59, 999
  ));
  
  return { start, end };
}

async function getEligibleAgents() {
  const { rows } = await pool.query(`
    SELECT name, staked_agent 
    FROM accounts 
    WHERE eligible_agent = true 
      AND is_denied = false
  `);
  return rows;
}

async function getAgentActivity(author, start, end) {
  // Get all replies and posts for this agent in the period
  const { rows } = await pool.query(`
    SELECT 
      content_id,
      parent_author,
      is_root,
      created_at
    FROM content
    WHERE author = $1
      AND created_at BETWEEN $2 AND $3
      AND (burn_valid IS NULL OR burn_valid = true)
    ORDER BY created_at ASC
  `, [author, start, end]);
  
  return rows;
}

async function isEligibleCounterparty(counterparty) {
  // Check if counterparty is an eligible agent OR a real human
  const { rows } = await pool.query(`
    SELECT 
      eligible_agent,
      real_human_heuristic,
      agenthive_active_days,
      created_at
    FROM accounts
    WHERE name = $1
  `, [counterparty]);
  
  if (rows.length === 0) return false;
  
  const acc = rows[0];
  
  // Eligible agent?
  if (acc.eligible_agent) return true;
  
  // Real human heuristic?
  if (acc.real_human_heuristic) return true;
  
  // Auto-check human heuristic: 30+ days old AND (30+ posts OR 10+ active days)
  const accountAgeDays = acc.created_at 
    ? (Date.now() - new Date(acc.created_at).getTime()) / (1000 * 60 * 60 * 24)
    : 0;
  
  if (accountAgeDays >= 30) {
    const { rows: activity } = await pool.query(`
      SELECT COUNT(*) as total,
             COUNT(DISTINCT DATE(created_at)) as active_days
      FROM content
      WHERE author = $1
    `, [counterparty]);
    
    const total = parseInt(activity[0]?.total || 0);
    const activeDays = parseInt(activity[0]?.active_days || 0);
    
    if (total >= 30 || activeDays >= 10) {
      // Update the flag for future
      await pool.query(
        'UPDATE accounts SET real_human_heuristic = true WHERE name = $1',
        [counterparty]
      );
      return true;
    }
  }
  
  return false;
}

async function checkPairSpam(author, counterparty, start, end) {
  // Count replies between this pair (both directions) in 24h window
  const { rows } = await pool.query(`
    SELECT COUNT(*) as count
    FROM content
    WHERE (
      (author = $1 AND parent_author = $2)
      OR (author = $2 AND parent_author = $1)
    )
    AND created_at BETWEEN $3 AND $4
  `, [author, counterparty, start, end]);
  
  return parseInt(rows[0].count) > PAIR_SPAM_THRESHOLD;
}

async function checkConcentration(author, start, end) {
  // Get top 3 counterparties over trailing 7 days
  const weekAgo = new Date(start);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 6); // 7 days total including today
  
  const { rows } = await pool.query(`
    SELECT parent_author, COUNT(*) as count
    FROM content
    WHERE author = $1
      AND is_root = false
      AND created_at BETWEEN $2 AND $3
      AND parent_author IS NOT NULL
    GROUP BY parent_author
    ORDER BY count DESC
    LIMIT 3
  `, [author, weekAgo, end]);
  
  const { rows: totalRows } = await pool.query(`
    SELECT COUNT(*) as total
    FROM content
    WHERE author = $1
      AND is_root = false
      AND created_at BETWEEN $2 AND $3
  `, [author, weekAgo, end]);
  
  const total = parseInt(totalRows[0]?.total || 0);
  if (total === 0) return false;
  
  const top3Count = rows.reduce((sum, r) => sum + parseInt(r.count), 0);
  return (top3Count / total) > CONCENTRATION_THRESHOLD;
}

async function calculateUCS(author, staked, start, end) {
  const activity = await getAgentActivity(author, start, end);
  
  // Separate posts and replies
  const posts = activity.filter(a => a.is_root);
  const replies = activity.filter(a => !a.is_root && a.parent_author);
  
  // Apply rate limits
  const countedPosts = posts.slice(0, MAX_POSTS_DAY);
  const countedReplies = replies.slice(0, MAX_REPLIES_DAY);
  
  // Track unique eligible counterparties
  const uniqueCounterparties = new Set();
  const pairCounts = new Map(); // Track for spam detection
  
  for (const reply of countedReplies) {
    // Skip self-loops
    if (reply.parent_author === author) continue;
    
    // Check pair spam
    const pairKey = [author, reply.parent_author].sort().join(':');
    const currentCount = pairCounts.get(pairKey) || 0;
    if (currentCount >= PAIR_SPAM_THRESHOLD) continue;
    pairCounts.set(pairKey, currentCount + 1);
    
    // Check if counterparty is eligible
    const isEligible = await isEligibleCounterparty(reply.parent_author);
    if (isEligible) {
      uniqueCounterparties.add(reply.parent_author);
    }
  }
  
  // Check concentration (trailing 7 days)
  const isConcentrated = await checkConcentration(author, start, end);
  
  // Calculate U (unique counterparties, 0 if concentrated)
  let U = isConcentrated ? 0 : uniqueCounterparties.size;
  
  // Calculate P (posts)
  let P = countedPosts.length;
  
  // Apply caps
  const cappedU = Math.min(U, U_CAP);
  const cappedP = Math.min(P, P_CAP);
  
  // Base score
  const S = cappedU + 0.5 * cappedP;
  
  // Stake weighting
  const effectiveStake = Math.min(staked, STAKE_CAP);
  const W = Math.sqrt(effectiveStake / S_MIN);
  
  // Final score
  const S_final = S * W;
  
  return {
    U,
    P,
    cappedU,
    cappedP,
    S,
    W,
    S_final,
    staked,
    uniqueCounterparties: Array.from(uniqueCounterparties),
    isConcentrated,
    countedPosts: countedPosts.length,
    countedReplies: countedReplies.length
  };
}

async function storeScore(account, date, score, details) {
  await pool.query(`
    INSERT INTO participation_scores (
      account, date, score, details_json, created_at
    ) VALUES ($1, $2, $3, $4, now())
    ON CONFLICT (account, date) DO UPDATE SET
      score = EXCLUDED.score,
      details_json = EXCLUDED.details_json,
      created_at = EXCLUDED.created_at
  `, [account, date, score, JSON.stringify(details)]);
}

async function runDailyScoring() {
  const { start, end } = getYesterdayBounds();
  const dateStr = start.toISOString().split('T')[0];
  
  console.log(JSON.stringify({
    at: new Date().toISOString(),
    msg: 'participation_scoring_start',
    date: dateStr,
    start: start.toISOString(),
    end: end.toISOString()
  }));
  
  const agents = await getEligibleAgents();
  console.log(JSON.stringify({
    at: new Date().toISOString(),
    msg: 'participation_eligible_agents',
    count: agents.length
  }));
  
  let scored = 0;
  let totalScore = 0;
  
  for (const agent of agents) {
    try {
      const details = await calculateUCS(agent.name, agent.staked_agent, start, end);
      await storeScore(agent.name, dateStr, details.S_final, details);
      
      scored++;
      totalScore += details.S_final;
      
      console.log(JSON.stringify({
        at: new Date().toISOString(),
        msg: 'participation_score_calculated',
        account: agent.name,
        date: dateStr,
        score: details.S_final,
        U: details.U,
        P: details.P,
        W: details.W
      }));
    } catch (err) {
      console.error(`Failed to score ${agent.name}:`, err.message);
    }
  }
  
  console.log(JSON.stringify({
    at: new Date().toISOString(),
    msg: 'participation_scoring_complete',
    date: dateStr,
    scored,
    totalScore,
    averageScore: scored > 0 ? totalScore / scored : 0
  }));
}

// Run on schedule or immediately if RUN_NOW=1
if (process.env.RUN_NOW === '1') {
  runDailyScoring().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  // Schedule for RUN_HOUR UTC
  function scheduleNextRun() {
    const now = new Date();
    const next = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      RUN_HOUR, 0, 0
    ));
    
    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    
    const delay = next.getTime() - now.getTime();
    
    console.log(JSON.stringify({
      at: now.toISOString(),
      msg: 'participation_scheduled',
      nextRun: next.toISOString(),
      delayMs: delay
    }));
    
    setTimeout(() => {
      runDailyScoring().catch(console.error);
      scheduleNextRun(); // Reschedule for next day
    }, delay);
  }
  
  scheduleNextRun();
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(JSON.stringify({
    at: new Date().toISOString(),
    msg: 'participation_scorer_shutdown'
  }));
  process.exit(0);
});
