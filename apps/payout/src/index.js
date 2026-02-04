/**
 * Payout Distributor Service
 * 
 * Calculates and distributes AGENT token rewards.
 * Two modes:
 * 1. Daily participation payouts (30% of daily emissions)
 * 2. Weekly curated payouts (60% of weekly emissions, 80/20 author/curator split)
 * 
 * For testnet: DRY_RUN mode simulates without actual transfers
 */

import { pool } from '@agenthive/db';

const DRY_RUN = process.env.PAYOUT_DRY_RUN !== '0'; // Default to dry run for safety
const TOKEN_SYMBOL = process.env.AGENT_TOKEN_SYMBOL ?? 'AGENT';

// Emissions schedule (AGENT per day)
function getDailyEmissions() {
  const now = new Date();
  const launchDate = process.env.AGENTHIVE_LAUNCH_DATE 
    ? new Date(process.env.AGENTHIVE_LAUNCH_DATE)
    : new Date('2026-02-01'); // Default
  
  const daysSinceLaunch = Math.floor((now - launchDate) / (1000 * 60 * 60 * 24));
  
  if (daysSinceLaunch < 14) return 10000;      // Weeks 1-2
  if (daysSinceLaunch < 28) return 25000;      // Weeks 3-4
  return 100000;                                 // Week 5+
}

const PARTICIPATION_SHARE = 0.30;
const CURATED_SHARE = 0.60;
const GRANTS_SHARE = 0.10;

console.log(JSON.stringify({
  at: new Date().toISOString(),
  msg: 'payout_distributor_start',
  dryRun: DRY_RUN,
  token: TOKEN_SYMBOL
}));

async function createPayoutRun(kind, periodStart, periodEnd) {
  const runId = `pr-${kind}-${Date.now()}`;
  
  await pool.query(`
    INSERT INTO payout_runs (
      run_id, kind, period_start, period_end, status, report_json, created_at
    ) VALUES ($1, $2, $3, $4, 'planned', '{}'::jsonb, now())
  `, [runId, kind, periodStart, periodEnd]);
  
  return runId;
}

async function updatePayoutRun(runId, status, report, txIds = []) {
  await pool.query(`
    UPDATE payout_runs 
    SET status = $1, 
        report_json = $2,
        executed_tx_ids = $3,
        updated_at = now()
    WHERE run_id = $4
  `, [status, JSON.stringify(report), JSON.stringify(txIds), runId]);
}

async function recordPayout(runId, account, amount, reason, metadata = {}) {
  await pool.query(`
    INSERT INTO payouts (run_id, account, amount, reason, metadata_json)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (run_id, account) DO UPDATE SET
      amount = EXCLUDED.amount,
      reason = EXCLUDED.reason,
      metadata_json = EXCLUDED.metadata_json
  `, [runId, account, amount, reason, JSON.stringify(metadata)]);
}

async function runParticipationPayout() {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];
  
  const periodStart = new Date(Date.UTC(
    yesterday.getUTCFullYear(),
    yesterday.getUTCMonth(),
    yesterday.getUTCDate(),
    0, 0, 0
  ));
  
  const periodEnd = new Date(Date.UTC(
    yesterday.getUTCFullYear(),
    yesterday.getUTCMonth(),
    yesterday.getUTCDate(),
    23, 59, 59, 999
  ));
  
  console.log(JSON.stringify({
    at: new Date().toISOString(),
    msg: 'participation_payout_start',
    date: dateStr
  }));
  
  const runId = await createPayoutRun('daily_participation', periodStart, periodEnd);
  
  try {
    // Get all scores for yesterday
    const { rows: scores } = await pool.query(`
      SELECT account, score, details_json
      FROM participation_scores
      WHERE date = $1
    `, [dateStr]);
    
    if (scores.length === 0) {
      console.log(JSON.stringify({
        at: new Date().toISOString(),
        msg: 'participation_payout_no_scores',
        date: dateStr
      }));
      await updatePayoutRun(runId, 'executed', { 
        date: dateStr, 
        totalScore: 0, 
        poolSize: 0,
        recipients: 0 
      });
      return;
    }
    
    const totalScore = scores.reduce((sum, s) => sum + parseFloat(s.score), 0);
    const dailyEmissions = getDailyEmissions();
    const poolSize = dailyEmissions * PARTICIPATION_SHARE;
    
    console.log(JSON.stringify({
      at: new Date().toISOString(),
      msg: 'participation_pool_calculated',
      dailyEmissions,
      poolSize,
      totalScore,
      scoreCount: scores.length
    }));
    
    const payouts = [];
    
    for (const score of scores) {
      const share = parseFloat(score.score) / totalScore;
      const amount = poolSize * share;
      
      payouts.push({
        account: score.account,
        amount: Math.floor(amount * 1000) / 1000, // 3 decimal places
        score: score.score,
        share: share
      });
    }
    
    // Record payouts
    for (const p of payouts) {
      await recordPayout(runId, p.account, p.amount, 'daily_participation', {
        date: dateStr,
        score: p.score,
        share: p.share,
        totalScore
      });
    }
    
    // Execute transfers (or simulate)
    const txIds = [];
    if (!DRY_RUN) {
      // TODO: Implement Hive-Engine token transfer
      // This would call Hive-Engine contracts to transfer AGENT
      console.log(JSON.stringify({
        at: new Date().toISOString(),
        msg: 'participation_transfers_skipped',
        reason: 'hive_engine_integration_pending'
      }));
    }
    
    const report = {
      date: dateStr,
      dailyEmissions,
      poolSize,
      totalScore,
      recipients: payouts.length,
      payouts: payouts.map(p => ({
        account: p.account,
        amount: p.amount
      }))
    };
    
    await updatePayoutRun(runId, 'executed', report, txIds);
    
    console.log(JSON.stringify({
      at: new Date().toISOString(),
      msg: 'participation_payout_complete',
      date: dateStr,
      recipients: payouts.length,
      totalDistributed: payouts.reduce((sum, p) => sum + p.amount, 0),
      dryRun: DRY_RUN
    }));
    
  } catch (err) {
    console.error('Participation payout error:', err);
    await updatePayoutRun(runId, 'failed', { error: err.message });
    throw err;
  }
}

async function runCuratedPayout() {
  // Weekly curated payout
  const now = new Date();
  const weekEnd = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - now.getUTCDay(), // Last Sunday
    23, 59, 59, 999
  ));
  
  const weekStart = new Date(weekEnd);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  weekStart.setUTCHours(0, 0, 0, 0);
  
  console.log(JSON.stringify({
    at: new Date().toISOString(),
    msg: 'curated_payout_start',
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString()
  }));
  
  const runId = await createPayoutRun('weekly_curated', weekStart, weekEnd);
  
  try {
    // Get curated content from this week
    // Top N items by curator votes
    const N_CURATED = 200;
    
    const { rows: votedContent } = await pool.query(`
      SELECT 
        c.content_id,
        c.author,
        COUNT(cv.curator) as vote_count,
        array_agg(cv.curator) as curators
      FROM content c
      JOIN curator_votes cv ON c.content_id = cv.content_id
      WHERE cv.created_at BETWEEN $1 AND $2
        AND c.burn_valid = true
      GROUP BY c.content_id, c.author
      ORDER BY vote_count DESC
      LIMIT $3
    `, [weekStart, weekEnd, N_CURATED]);
    
    if (votedContent.length === 0) {
      console.log(JSON.stringify({
        at: new Date().toISOString(),
        msg: 'curated_payout_no_content'
      }));
      await updatePayoutRun(runId, 'executed', { recipients: 0 });
      return;
    }
    
    // Calculate daily emissions for the week
    let weeklyEmissions = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setUTCDate(d.getUTCDate() + i);
      // Use current day as reference for emissions calculation
      weeklyEmissions += getDailyEmissions();
    }
    
    const poolSize = weeklyEmissions * CURATED_SHARE;
    const totalVotes = votedContent.reduce((sum, c) => sum + parseInt(c.vote_count), 0);
    
    console.log(JSON.stringify({
      at: new Date().toISOString(),
      msg: 'curated_pool_calculated',
      weeklyEmissions,
      poolSize,
      contentCount: votedContent.length,
      totalVotes
    }));
    
    const payouts = [];
    
    for (const content of votedContent) {
      const contentShare = parseInt(content.vote_count) / totalVotes;
      const contentReward = poolSize * contentShare;
      
      const authorReward = contentReward * 0.80;
      const curatorReward = contentReward * 0.20;
      const curators = content.curators || [];
      const curatorShare = curators.length > 0 ? curatorReward / curators.length : 0;
      
      // Author payout
      payouts.push({
        account: content.author,
        amount: Math.floor(authorReward * 1000) / 1000,
        reason: 'curated_author',
        content_id: content.content_id
      });
      
      // Curator payouts
      for (const curator of curators) {
        payouts.push({
          account: curator,
          amount: Math.floor(curatorShare * 1000) / 1000,
          reason: 'curated_curator',
          content_id: content.content_id
        });
      }
    }
    
    // Aggregate by account (someone might be both author and curator)
    const byAccount = {};
    for (const p of payouts) {
      if (!byAccount[p.account]) {
        byAccount[p.account] = { amount: 0, details: [] };
      }
      byAccount[p.account].amount += p.amount;
      byAccount[p.account].details.push({
        reason: p.reason,
        content_id: p.content_id,
        amount: p.amount
      });
    }
    
    // Record payouts
    for (const [account, data] of Object.entries(byAccount)) {
      await recordPayout(runId, account, data.amount, 'weekly_curated', {
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        details: data.details
      });
    }
    
    // Execute transfers (or simulate)
    const txIds = [];
    if (!DRY_RUN) {
      console.log(JSON.stringify({
        at: new Date().toISOString(),
        msg: 'curated_transfers_skipped',
        reason: 'hive_engine_integration_pending'
      }));
    }
    
    const report = {
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      weeklyEmissions,
      poolSize,
      contentCount: votedContent.length,
      recipients: Object.keys(byAccount).length,
      payouts: Object.entries(byAccount).map(([account, data]) => ({
        account,
        amount: data.amount
      }))
    };
    
    await updatePayoutRun(runId, 'executed', report, txIds);
    
    console.log(JSON.stringify({
      at: new Date().toISOString(),
      msg: 'curated_payout_complete',
      recipients: Object.keys(byAccount).length,
      totalDistributed: Object.values(byAccount).reduce((sum, d) => sum + d.amount, 0),
      dryRun: DRY_RUN
    }));
    
  } catch (err) {
    console.error('Curated payout error:', err);
    await updatePayoutRun(runId, 'failed', { error: err.message });
    throw err;
  }
}

// CLI mode
const command = process.argv[2];

if (command === 'participation') {
  runParticipationPayout().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else if (command === 'curated') {
  runCuratedPayout().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else if (command === 'both') {
  (async () => {
    await runParticipationPayout();
    await runCuratedPayout();
  })().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  console.log('Usage: node index.js [participation|curated|both]');
  console.log('  participation - Run daily participation payout');
  console.log('  curated       - Run weekly curated payout');
  console.log('  both          - Run both (for testing)');
  console.log('');
  console.log('Environment variables:');
  console.log('  PAYOUT_DRY_RUN=0   - Actually execute transfers (default: 1/dry run)');
  console.log('  AGENT_TOKEN_SYMBOL - Token symbol (default: AGENT)');
  process.exit(1);
}
