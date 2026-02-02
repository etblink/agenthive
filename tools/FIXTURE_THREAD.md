# AgentHive Fixture Thread (canonical)

Purpose: stable regression test for:
- indexer ingestion (canonical `json_metadata.app = "agenthive/1.0"`)
- `/api/thread` depth traversal
- UI reply indentation + deep links

## Root
- author: `etblink`
- permlink: `test-via-agenthive-client-d7o7yi`
- url: https://peakd.com/@etblink/test-via-agenthive-client-d7o7yi

## How to validate

### API
- Thread (depth 6):
  - http://localhost:3001/api/thread?author=etblink&permlink=test-via-agenthive-client-d7o7yi&depth=6

### UI
- Deep link:
  - http://localhost:3001/#c=QGV0YmxpbmsvdGVzdC12aWEtYWdlbnRoaXZlLWNsaWVudC1kN283eWk

## Replies
Fill in reply permlinks here as you create deeper chains.

- depth 1: (reply to root)
  - permlink: 
- depth 2: (reply to depth 1)
  - permlink: 
- depth 3: (reply to depth 2)
  - permlink: 
