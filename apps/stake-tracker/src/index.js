/**
 * Stake Tracker Service
 * 
 * Periodically queries Hive-Engine for AGENT token stakes
 * and updates account eligibility status.
 */

import { pool } from '@agenthive/db';

const HIVE_ENGINE_API = process.env.HIVE_ENGINE_API ?? 'https://api.hive-engine.com/rpc';
const TOKEN_SYMBOL = process.env.AGENT_TOKEN_SYMBOL ?? 'AGENT';
const STAKE_MIN = Number(process.env.AGENT_STAKE_MIN ?? 1000);
const POLL_INTERVAL_MS = Number(process.env.STAKE_POLL_MS ?? 60_000); // 1 minute default

console.log(JSON.stringify({
  at: new Date().toISOString(),
  msg: 'stake_tracker_start',
  token: TOKEN_SYMBOL,
  stakeMin: STAKE_MIN,
  pollIntervalMs: POLL_INTERVAL_MS
}));

async function hiveEngineCall(method, params) {
  const res = await fetch(HIVE_ENGINE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: 1
    })
  });
  
  if (!res.ok) {
    throw new Error(`Hive-Engine API error: ${res.status}`);
  }
  
  const data = await res.json();
  if (data.error) {
    throw new Error(`Hive-Engine error: ${data.error.message}`);
  }
  
  return data.result;
}

async function getStakeBalances(account) {
  try {
    const result = await hiveEngineCall('findOne', {
      contract: 'tokens',
      table: 'balances',
      query: {
        account,
        symbol: TOKEN_SYMBOL
      }
    });
    
    if (!result) {
      return { staked: 0, balance: 0 };
    }
    
    // stake = delegated + undelegated staked tokens
    const staked = Number(result.stake || 0) + Number(result.delegationsIn || 0);
    const balance = Number(result.balance || 0);
    
    return { staked, balance };
  } catch (err) {
    console.error(`Error fetching stake for ${account}:`, err.message);
    return { staked: 0, balance: 0 };
  }
}

async function getAllAccounts() {
  const { rows } = await pool.query('SELECT name FROM accounts');
  return rows.map(r => r.name);
}

async function updateAccountStake(account) {
  const { staked } = await getStakeBalances(account);
  
  await pool.query(
    `UPDATE accounts 
     SET staked_agent = $1,
         eligible_agent = CASE 
           WHEN staked_agent >= $2 
            AND agenthive_items >= 3 
            AND agenthive_active_days >= 3 
            AND is_denied = false
           THEN true 
           ELSE false 
         END,
         updated_at = now()
     WHERE name = $3`,
    [staked, STAKE_MIN, account]
  );
  
  return { account, staked, eligible: staked >= STAKE_MIN };
}

async function runUpdate() {
  const start = Date.now();
  const accounts = await getAllAccounts();
  
  console.log(JSON.stringify({
    at: new Date().toISOString(),
    msg: 'stake_update_start',
    accountCount: accounts.length
  }));
  
  let updated = 0;
  let eligible = 0;
  
  for (const account of accounts) {
    try {
      const result = await updateAccountStake(account);
      updated++;
      if (result.eligible) eligible++;
      
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    } catch (err) {
      console.error(`Failed to update ${account}:`, err.message);
    }
  }
  
  const duration = Date.now() - start;
  
  console.log(JSON.stringify({
    at: new Date().toISOString(),
    msg: 'stake_update_complete',
    updated,
    eligible,
    durationMs: duration
  }));
}

// Run immediately, then on interval
runUpdate().catch(console.error);
setInterval(runUpdate, POLL_INTERVAL_MS);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(JSON.stringify({
    at: new Date().toISOString(),
    msg: 'stake_tracker_shutdown'
  }));
  process.exit(0);
});
