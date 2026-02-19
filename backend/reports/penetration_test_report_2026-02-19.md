# Penetration Test Report

- Project: Project MACA / Blackjack Platform
- Test Date: February 19, 2026
- Environment: Local development (`127.0.0.1:8000`)
- Tool: `backend/tools/pen_test_smoke.py`

## Test Objective

- Validate that core abuse protections are active:
  - invalid credential rejection
  - SQL-injection-style input rejection
  - brute-force lockout / throttling behavior

## Executed Command

```bash
python backend/tools/pen_test_smoke.py --base-url http://127.0.0.1:8000/api/v1 --attempts 40
```

## Raw Result Source

- `backend/reports/evidence/pen_test_smoke_20260219_200049.txt`

## Results

- `register_status=201`
- `sql_injection_login_status=401`
- SQL-injection-style password payload was rejected.
- `lockout_triggered_at_attempt=5`
- Lockout activated after repeated failed login attempts.

## Assessment

- Pass: credential abuse safeguards are active in tested flow.
- Pass: injection-style auth payload did not bypass authentication.
- Pass: account lockout defense engaged as configured.

## Limitations

- This was a smoke penetration test, not a full red-team assessment.
- WebSocket fuzzing and token replay attack simulation were not executed in this run.

## Recommended Next Pen-Test Expansion

1. JWT tamper and replay tests (invalid `sid`, modified `exp`, forged `jti`).
2. WebSocket flooding and malformed event payload fuzzing.
3. Privilege escalation checks across admin endpoints and socket admin commands.
