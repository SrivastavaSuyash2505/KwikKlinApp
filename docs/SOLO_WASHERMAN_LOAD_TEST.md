# Solo Washerman — load test report

Release-checklist Gate 4.

**Result: on this development container, no claim of "1,000 shops" or "50 shops" can be made yet.**
- The scripts are in the repo.
- Everything below was measured on 2026-10-30.
- The numbers are only as good as the machine they ran on, and §2 explains why that machine was not good enough.

## 1. Setup

| Item | Value |
|---|---|
| Machine | GitHub Codespace, **2 vCPU**, 8 GB RAM. Shared with the load generator, other dev servers and a second Claude session (load average ≈ 2.0 during runs). |
| App | One uvicorn process (same as `run.sh`), DB pool 10 + 20, branch `feature/solo-app` |
| DB | Local PostgreSQL. Disposable database `laundry_load`; app connected as a **NOSUPERUSER** role, so RLS cost is included |
| Data | `python -m scripts.loadtest.seed --shops 1000` → 1,000 synthetic Solo shops (every 4th is Pro), 12,000 rates, 20,000 customers, 30,000 orders. Phones +91 70000xxxxx. |
| Outside services | WhatsApp: a local fake WAHA that answers "sent" (`127.0.0.1:3019`); nothing left the machine. Gemini key empty, so no AI calls. |
| Traffic | `python -m scripts.loadtest.run`: each virtual user is a different shop's owner with its own token, waiting 0.5–2 s between actions |
| Mix (pilot assumption, not measured) | home 30%, orders 20%, customers 15%, today 10%, plan 5%, report 5%, **new bill 15%** |

## 2. Results

All runs: **0 cross-shop leaks** (every home response named the caller's own shop).

### Before the changes in §3

| Owners at once | Req/s | Errors | p50 | p95 | p99 | Server CPU |
|---|---|---|---|---|---|---|
| 25 | 17.1 | 0% | 47 ms | 310 ms | 2.5 s | 61% |
| 50 | 20.6 | 0% | 0.72 s | 2.9 s | 3.8 s | 82% |
| 100 | 25.4 | 0% | 1.8 s | 6.1 s | 8.7 s | 93% |
| 200 | 11.7 | **15% timeouts** | 7.9 s | 30 s | 33 s | — |

The 100 and 200 rows come from an earlier run with WhatsApp unreachable instead of the fake WAHA. Failed sends add work to every bill, so those two rows overstate the bill cost.

Single bill (sequential, idle): **180 ms**, 60 SQL statements. Single home screen: **47 ms**, 23 statements.

### After the changes in §3

| Owners at once | Req/s | p50 | p95 | p99 |
|---|---|---|---|---|
| 25 | 15.0 | 0.11 s | 1.9 s | 2.5 s |
| 50 | 18.0 | 0.93 s | 3.8 s | 4.9 s |

The "after" latencies are **not** better than "before". During the "after" runs the server process only got about half a core:
- Load average was ≈ 2 on 2 vCPU, and the server used ~50% CPU while requests queued.
- The load generator, two other dev servers and the other session were on the same machine.

Latency numbers from this container are therefore not a fair measure of the code. The database-side signal is the one to trust: at 25 owners, sampled every 0.25 s from `pg_stat_activity`.

| | Before | After |
|---|---|---|
| Connections "idle in transaction" (avg) | 9.6 | 1.8 |
| Waiting on a lock | order-number advisory lock seen | none |
| Busy executing (avg) | 1.8 | 0.6 |

## 3. Bottlenecks found and fixed

1. **Bills of all shops waited on one global lock.**
   - `order_service._next_order_number` used one advisory key for every shop. Every bill in the platform queued behind every other bill.
   - `tasks._next_code` had the same problem.
   - Both are now `pg_advisory_xact_lock(namespace, hashtext(shop_id))`.
   - Numbers are unique per shop (`uq_orders_tenant_order_number`, `uq_tasks_tenant_code`), so only bills of the *same* shop still serialize.
2. **Owner home:** the seven order counts and sums were seven round trips; now one query with `FILTER`.
3. **Urgent-charge settings:** three reads on every bill; now one `get_many`.
4. **AI-reply card:** stopped opening a savepoint on every home and plan view; the check now happens once per process.

The CPU profile showed no single hot function. Time is spread over SQLAlchemy statement handling, request routing and TLS to the local database. A single Python process is the ceiling, at roughly 20–25 requests per second on one core.

## 4. What this means for 50 shops

- **Expected load (assumption):** one Solo owner might make about 30 bills and about 200 app requests a day. 50 shops then means about 10,000 requests a day, roughly 0.1 req/s on average and maybe 1 req/s at the evening peak.
- **Measured headroom:** a single process on half a core already served 15–20 req/s here without errors. 50 shops is well inside that, even with headroom for WhatsApp webhooks and AI replies, which mostly wait on the network.
- **Still to do before claiming it:** run `scripts/loadtest/run.py` from a different machine against a staging server with the production CPU and database, and record the numbers here.
- **Then 1,000 shops:** repeat with `--users` up to the agreed peak.
  - If p95 > 1 s at peak, run 2–4 uvicorn workers. The scheduler is already single-leader.
  - Per-process caches (`site_rates`, `plan_config`, `knowledge`) would then be up to their TTL stale on other workers; check that before adding workers.

## 5. How to reproduce

```bash
createdb laundry_load
DATABASE_URL=postgresql+asyncpg://laundry:laundry@localhost:5432/laundry_load python -m alembic upgrade heads
python -m scripts.loadtest.seed --db postgresql+asyncpg://laundry:laundry@localhost:5432/laundry_load \
    --shops 1000 --tokens /tmp/kk-load-tokens.json
# start the app against laundry_load with WhatsApp pointed at a fake or unreachable endpoint and
# GEMINI_API_KEY="", then:
python -m scripts.loadtest.run --base http://127.0.0.1:8013 --tokens /tmp/kk-load-tokens.json \
    --users 50 --seconds 60 --db postgresql+asyncpg://laundry:laundry@localhost:5432/laundry_load --pid <uvicorn pid>
```

`seed.py` refuses any database whose name does not contain `load`. Never point it at production.
