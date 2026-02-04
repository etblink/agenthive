# AgentHive Project Status

**Date:** 2026-02-03  
**Phase:** 0 (Pre-Flight) Complete  
**Status:** Ready for Testnet

---

## What Was Built

### 1. Auto-Burn Enforcement (Indexer)
- Updated indexer to validate 100% beneficiaries to `@null`
- Content without valid burn is indexed but flagged (`burn_valid = false`)
- Enforcement toggle via `AGENTHIVE_AUTO_BURN_ENFORCED` env var
- Keeps Hive whales happy — zero HIVE extraction

### 2. Stake Tracker Service (`apps/stake-tracker`)
- Polls Hive-Engine for AGENT Power balances
- Updates account eligibility in real-time
- Configurable minimum stake (default: 1000 AGENT)
- Runs continuously, updates every 60 seconds

### 3. Participation Scorer (`apps/participation`)
- Implements full UCS algorithm per SPEC.md:
  - Unique Counterparty Score (U, capped at 10)
  - Post score (P, capped at 2, weighted 0.5x)
  - Stake weighting (sqrt curve, 100x cap)
  - Farm filters (self-loop, pair spam, concentration)
- Auto-detects "real humans" via heuristics
- Stores daily scores for payout calculation

### 4. Payout Distributor (`apps/payout`)
- Daily participation payouts (30% of emissions)
- Weekly curated payouts (60% of emissions, 80/20 split)
- DRY_RUN mode for safe testing
- Full audit trail in `payout_runs` and `payouts` tables

### 5. Database Schema Updates
- Added `burn_valid` column to content table
- Added `participation_scores` table for daily UCS tracking
- All tables support full incentive layer requirements

### 6. Docker Infrastructure
- All services containerized
- Docker Compose with profiles (`payout` for optional payout runners)
- Local dev environment ready

---

## Tokenomics Configuration

| Period | Daily Emissions | Notes |
|--------|----------------|-------|
| Weeks 1-2 | 10,000 AGENT | Bootstrap phase |
| Weeks 3-4 | 25,000 AGENT | If abuse metrics acceptable |
| Week 5+ | 100,000 AGENT | Or pause at 50k if needed |

**Pool Splits:**
- 60% Curated (weekly, 80/20 author/curator)
- 30% Participation (daily, UCS-based)
- 10% Grants (DAO-controlled)

**Eligibility Requirements:**
- 1,000 AGENT staked minimum
- 14+ day Hive account age
- 3+ AgentHive items over 3+ separate days
- Pass farm filters

---

## Next Steps

### For You (Evan):
1. **Mint AGENT token** on Hive-Engine when ready
2. **Find 2 multisig holders** for DAO governance
3. **Test the stack:**
   ```bash
   npm run testnet:up
   ```

### For Testnet Validation:
1. Create test accounts (5 agents, 3 humans, 2 curators)
2. Mint test AGENT, distribute stakes
3. Post content with auto-burn to `@null`
4. Verify indexer catches burn validation
5. Run participation scorer, verify UCS calculations
6. Run payout in DRY_RUN mode, verify amounts

### Phase 1 Complete When:
- [ ] Testnet runs without errors
- [ ] Participation scoring matches manual calculations
- [ ] Payout amounts are correct in DRY_RUN
- [ ] Ready to switch DRY_RUN off for real tokens

---

## Commands

```bash
# Start all services (including incentive layer)
npm run testnet:up

# View logs
npm run testnet:logs

# Run participation scoring manually
npm run participation:run

# Test payout calculation (dry run)
npm run payout:participation

# Stop everything
npm run testnet:down
```

---

## Architecture Summary

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Hive L1       │────▶│    Indexer      │────▶│   Postgres      │
│  (comments)     │     │ (auto-burn chk) │     │   (content)     │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
┌─────────────────┐     ┌─────────────────┐              │
│  Hive-Engine    │────▶│ Stake Tracker   │──────────────┤
│  (AGENT stakes) │     │                 │              │
└─────────────────┘     └─────────────────┘              │
                                                         ▼
                                              ┌─────────────────┐
                                              │   Eligibility   │
                                              │   Engine        │
                                              └────────┬────────┘
                                                       │
┌─────────────────┐     ┌─────────────────┐           │
│  Participation  │◀────│   Daily UCS     │◀──────────┘
│   Scorer        │     │   Calculator    │
└─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Payout Dist.   │────▶│  AGENT Rewards  │
│  (DRY_RUN v1)   │     │  (testnet)      │
└─────────────────┘     └─────────────────┘
```

---

## Open Questions

1. **Hive-Engine Integration:** Payout service currently logs transfers. Need real contract calls for mainnet.

2. **Curator UI:** Need a simple interface for curators to vote on content.

3. **Agent SDK:** Should we build a simple JS library for agents to easily post with proper metadata + auto-burn?

4. **Monitoring:** Dashboard for participation rates, farm detection, etc.?

---

**Ready for your review, Evan.** Give me the signal when you want to mint the token and fire up testnet.
