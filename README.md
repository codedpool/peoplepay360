# PeoplePay360

Integrated HR & Payroll platform — see `plan.md` (gitignored, local only) for the full build plan.

## Running locally

The stack is **four separate things that all need to be running at once**:

```
# 1. Infra
docker compose up -d postgres redis

# 2. Backend API
cd backend
npm install
npx prisma migrate deploy
npm run seed          # prints a demo password — save it
npm run dev            # http://localhost:4000

# 3. Backend worker — SEPARATE PROCESS, easy to forget
cd backend
npm run worker

# 4. Frontend
cd frontend
npm install
npm run dev             # http://localhost:3000
```

### ⚠️ The worker is not optional

`npm run dev` only starts the Express API. Payrun compute, payslip PDF generation, and
payslip email are all handled by **a second process** (`npm run worker`, backed by
BullMQ + Redis) — not by the API itself.

If you only run `npm run dev` and skip `npm run worker`:
- Clicking **Compute** on a Payrun returns `202 COMPUTING` immediately (looks fine)
- The job sits in the Redis queue with nothing consuming it
- The Payrun **stays stuck at `COMPUTING` forever**
- **There is no error anywhere** — not in the browser, not in the API logs — because
  from the API's point of view, enqueueing the job succeeded
- The frontend's polling will eventually just show a timeout, which looks like a UI
  bug but isn't — nothing was ever listening on the other end

Same applies to **Print Payslip** and **Send Payslips** — both go through the worker too.

**Rule of thumb:** if a Payrun/payslip action seems to hang, the first thing to check
is whether `npm run worker` is actually running in a separate terminal.

### Local env quirks

- `docker-compose.yml` maps Postgres to host port `5433`. If that's already taken on
  your machine (e.g. a native Postgres install), create a local
  `docker-compose.override.yml` remapping it (e.g. to `5434`) and point your own
  `backend/.env`'s `DATABASE_URL` at that port. This file is gitignored — it's
  per-machine, not shared.
- Seed data is not idempotent — re-running `npm run seed` against a DB that already
  has seed rows will fail on unique constraints. Use `npx prisma migrate reset --force`
  first if you want a clean re-seed.
