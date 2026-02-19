# Load Test Report

- Project: Project MACA / Blackjack Platform
- Test Date: February 19, 2026
- Environment: Local development (`127.0.0.1:8000`)
- Tool: `backend/tools/load_test.py`
- Target Endpoint: `/api/v1/health`

## Executed Command

```bash
python backend/tools/load_test.py --url http://127.0.0.1:8000/api/v1/health --seconds 15 --workers 20
```

## Raw Result Source

- `backend/reports/evidence/load_test_20260219_200049.txt`

## Metrics

- Total requests: `8385`
- Successful requests: `8385`
- Failed requests: `0`
- Throughput: `559.00 req/s`
- Average latency: `35.57 ms`
- P95 latency: `49.51 ms`

## Assessment

- Pass for smoke load baseline: no request failures in test window.
- Throughput and latency are acceptable for this lightweight endpoint in local environment.

## Limitations

- Test targeted only health endpoint, not authenticated or websocket-heavy paths.
- Duration was short (15s) and does not represent sustained production load.
- Results are from local machine and are not directly equivalent to production infrastructure.

## Recommended Next Load Test Expansion

1. Add authenticated API load profile (`/auth/login`, `/profile/security/sessions`, `/lobby/tables`).
2. Add WebSocket concurrency test (join/sync/reaction/chat event streams).
3. Run 10-30 minute endurance tests with percentile tracking and error budget thresholds.
