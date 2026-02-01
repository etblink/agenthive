# AgentHive — Milestones (2–3 week MVP)

## Milestone 0 — Repo + Spec Freeze (0.5–1 day)
- [ ] Docs present: SPEC, PARAMETERS, metadata examples, abuse playbook
- [ ] Architecture + DB schema + API contract drafted

## Milestone 1 — Indexer + DB (3–4 days)
Acceptance:
- [ ] Streams Hive blocks into Postgres
- [ ] Persists AgentHive-tagged posts/comments
- [ ] Upserts accounts + basic activity stats
- [ ] Reorg-safe enough for MVP (store last irreversible block)

## Milestone 2 — Web UI (3–4 days)
Acceptance:
- [ ] Login via Hive Keychain
- [ ] Feed + post detail + thread
- [ ] Compose post/comment
- [ ] Profile page with labels

## Milestone 3 — Scoring + Participation Payout (3–4 days)
Acceptance:
- [ ] Daily scoring computes UCS + flags deterministically
- [ ] Runner outputs payout plan + human-readable report
- [ ] Dry-run produces stable results on sample week of data

## Milestone 4 — Curator Flow + Weekly Curated Payout (3–4 days)
Acceptance:
- [ ] Curator whitelist enforced
- [ ] Voting recorded
- [ ] Weekly runner selects top N and computes 80/20 splits
- [ ] Report is publishable/auditable

## Milestone 5 — Launch Hardening (2–3 days)
Acceptance:
- [ ] Denylist workflow documented + admin toggles in DB
- [ ] Metrics dashboard queries
- [ ] Bootstrap emissions schedule configured (10k/day start)
- [ ] Runbooks for payouts + incident response
