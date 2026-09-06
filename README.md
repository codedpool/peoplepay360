<img src="docs/logo.png" alt="PeoplePay360" width="240">

An integrated HR & Payroll platform: employees and contracts, working schedules,
attendance, time off, and a rule-driven payroll engine that turns all of it into
payslips — with a payroll dashboard on top.

![PeoplePay360 dashboard](docs/dashboard.png)

---

## Contents

- [What it does](#what-it-does)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Running locally](#running-locally)
- [Demo accounts](#demo-accounts)
- [Environment variables](#environment-variables)
- [Project layout](#project-layout)
- [Domain model](#domain-model)
- [Roles and permissions](#roles-and-permissions)
- [How the core logic works](#how-the-core-logic-works)
- [API reference](#api-reference)
- [Background jobs](#background-jobs)
- [Security](#security)
- [Seed data](#seed-data)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## What it does

| Area | Capabilities |
| --- | --- |
| **Employees** | Directory, departments, job positions, reporting lines, per-employee working schedule, bank-details-on-file flag |
| **Contracts** | Annual CTC, salary structure, date range, lifecycle status. A database exclusion constraint makes overlapping `ACTIVE` contracts per employee impossible |
| **Working schedules** | Weekly hours plus a day/start/end pattern. Drives what counts as a full day and how many working days a period contains |
| **Attendance** | Check in / check out, manual correction with audit trail, derived worked hours, overtime and a **day fraction** (1 / 0.5 / 0) |
| **Time off** | Leave types (day- or hour-based), allocations with balances, requests with approve / refuse / cancel, plus an employee-initiated "please cancel my approved leave" queue for HR |
| **Payroll** | Salary structures containing ordered rules (fixed / percentage / formula), payruns over a period, payslips with per-rule lines, PDF generation and email |
| **Dashboard** | Period-filtered payroll and workforce insight: KPIs, salary cost by department, net salary trend, payslip status split, payroll alerts, attendance and time-off summaries |
| **Access control** | Five roles, permission-gated API and UI, admin user management, password resets |

---

## Tech stack

**Backend** — Node.js, Express, Prisma ORM, PostgreSQL 16, Redis 7, BullMQ, Zod,
JWT (`jsonwebtoken`), bcryptjs, pdf-lib, Pino, Swagger UI, Vitest.

**Frontend** — Next.js 14 (App Router), React 18, Tailwind CSS. No component
library, no chart library, no icon package — the UI, the icons and the charts are
all hand-built, so `react` / `react-dom` / `next` are the only runtime
dependencies.

---

## Architecture

```
                     ┌──────────────────────┐
   browser  ───────► │  Next.js frontend    │  :3000
                     │  (App Router, RSC-   │
                     │   shell + client UI) │
                     └──────────┬───────────┘
                                │  JSON over HTTP (Bearer access token,
                                │  refresh token in an httpOnly cookie)
                     ┌──────────▼───────────┐
                     │  Express API         │  :4000
                     │  auth · RBAC · zod   │
                     │  validation · audit  │
                     └───┬──────────────┬───┘
                         │              │  enqueue
              ┌──────────▼───┐   ┌──────▼─────────┐
              │ PostgreSQL   │   │ Redis          │  :6379
              │ :5433        │   │ queues + cache │
              │ (Prisma)     │   │ + rate limits  │
              └──────────▲───┘   └──────┬─────────┘
                         │              │  consume
                         │       ┌──────▼──────────────┐
                         └───────┤  Worker process     │
                                 │  payrun-compute     │
                                 │  payslip-pdf        │
                                 │  payslip-email      │
                                 └─────────────────────┘
```

Four processes have to be running at once: Postgres, Redis, the API, and the
worker — plus the frontend in development.

### The worker is not optional

⚠️ `npm run dev` starts **only** the Express API. Payrun compute, payslip PDF
generation and payslip email all run in a **second process** (`npm run worker`,
backed by BullMQ + Redis).

If you skip the worker:

- Clicking **Compute** on a payrun returns `202 COMPUTING` immediately, which looks fine
- The job sits in the Redis queue with nothing consuming it
- The payrun **stays stuck at `COMPUTING` forever**
- **There is no error anywhere** — not in the browser, not in the API logs — because from the API's point of view enqueueing succeeded
- The frontend's polling eventually times out, which looks like a UI bug but isn't

The same applies to **Print Payslip** and **Send Payslips**. If a payroll action
seems to hang, check that `npm run worker` is actually running.

---

## Running locally

**Prerequisites:** Node.js 20+, Docker (for Postgres and Redis).

```bash
# 1. Infrastructure
docker compose up -d postgres redis

# 2. Backend API
cd backend
cp .env.example .env          # defaults work as-is for local dev
npm install
npx prisma migrate deploy
npm run seed                  # ~100 employees, prints the demo password
npm run dev                   # http://localhost:4000

# 3. Worker — SEPARATE TERMINAL, easy to forget (see the warning above)
cd backend
npm run worker

# 4. Frontend — SEPARATE TERMINAL
cd frontend
cp .env.example .env
npm install
npm run dev                   # http://localhost:3000
```

Useful endpoints once it's up:

| URL | What |
| --- | --- |
| `http://localhost:3000` | The app |
| `http://localhost:4000/health` | Liveness — verifies Postgres **and** Redis, returns `503 degraded` if either is down |
| `http://localhost:4000/api-docs` | Swagger UI for the whole API |

---

## Demo accounts

Every seeded account shares one password, pinned via `SEED_DEMO_PASSWORD` in
`backend/.env` so the whole team gets the same login on every reseed (default:
`admin@20`). Without that variable set, the seed generates a random password and
prints it once.

| Role | Email |
| --- | --- |
| Admin | `admin@peoplepay360.dev` |
| HR Manager | `hr.manager@peoplepay360.dev` |
| HR Payroll Manager | `payroll.manager@peoplepay360.dev` |
| HR Payroll User | `payroll.user@peoplepay360.dev` |
| Employee | `employee@peoplepay360.dev` |

The other ~95 seeded employees each get a `firstname.lastname@peoplepay360.dev`
login with the same password.

---

## Environment variables

### `backend/.env`

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `4000` | |
| `DATABASE_URL` | `postgresql://peoplepay:peoplepay@localhost:5433/peoplepay360` | **Required** |
| `REDIS_URL` | `redis://localhost:6379` | **Required** |
| `JWT_ACCESS_SECRET` | — | **Required** |
| `JWT_REFRESH_SECRET` | — | **Required** |
| `JWT_ACCESS_TTL` | `15m` | |
| `JWT_REFRESH_TTL` | `7d` | |
| `CORS_ORIGIN` | `http://localhost:3000` | |
| `BCRYPT_COST` | `12` | |
| `LOGIN_LOCKOUT_THRESHOLD` | `5` | Failed attempts before the account locks |
| `LOGIN_LOCKOUT_MINUTES` | `15` | Lockout duration |
| `SEED_DEMO_PASSWORD` | — | Pins the seed's demo password; random if unset |
| `COMPANY_NAME` | `OXP Pvt Ltd` | Display name — the system is single-tenant, there is no `Company` model |

Missing `DATABASE_URL`, `REDIS_URL` or either JWT secret makes the process refuse
to boot rather than start half-configured.

### `frontend/.env`

| Variable | Default |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` |
| `NEXT_PUBLIC_COMPANY_EMAIL_DOMAIN` | `peoplepay360.dev` |

---

## Project layout

```
backend/
  prisma/
    schema.prisma            16 models, 13 enums
    migrations/              8 migrations
    seed.js                  ~100 employees of realistic demo data
  src/
    index.js                 Express app, route mounting, /health, Swagger
    worker.js                Standalone worker entrypoint
    routes/                  One router per resource
    services/                Domain logic — the interesting part
      attendance.js            worked hours, overtime, day fraction, status
      workedDays.js            day-equivalents earned, scheduled days, ratio
      ruleEngine.js            ordered salary-rule evaluation
      formulaEvaluator.js      sandboxed expression evaluation
      contractResolution.js    which contract applies to a period
      payrunCompute.js         payrun → payslips
      payrunValidation.js      pre-payment warnings
      payslipPdf.js            PDF rendering
      dashboard.js             every dashboard aggregate
      passwordReset.js         shared admin-reset transaction
    workers/                 BullMQ consumers
    middleware/              auth, rbac, validate
    lib/                     prisma, redis, jwt, env, pagination, dateRange
    docs/openapi.js          OpenAPI spec served at /api-docs
frontend/
  app/
    login/                   Split-card sign-in + forgot-password
    change-password/         Forced password change (outside the app shell)
    (app)/                   Everything behind auth, wrapped in the shell
  components/
    shell/                   Sidebar nav + topbar
    dashboard/               Hand-built BarChart / StackedBar / TrendChart / StatCard
    ui/                      Panel, Modal, Stamp, PageHeader, EmptyState, …
  lib/                       api client, auth context, permissions mirror, currency
  mockup/                    Committed design reference the UI was built against
docs/                        README assets
docker-compose.yml
```

---

## Domain model

16 models. Every id is an autoincrement integer; every enum below is a real
Postgres enum.

```
WorkingSchedule ──< Employee >── Contract >── SalaryStructure ──< SalaryRule
                       │  │                        │                  │
                       │  ├──< Attendance          └──< Payrun ──< Payslip ──< PayslipLine
                       │  ├──< TimeOffAllocation >── TimeOffType
                       │  └──< TimeOffRequest    >──┘
                       │
                     User ──< RefreshToken
                       ├──< AuditLog
                       └──< PasswordResetRequest
```

| Enum | Values |
| --- | --- |
| `Role` | `EMPLOYEE`, `HR_MANAGER`, `HR_PAYROLL_USER`, `HR_PAYROLL_MANAGER`, `ADMIN` |
| `EmployeeStatus` | `ACTIVE`, `INACTIVE` |
| `ContractStatus` | `DRAFT`, `ACTIVE`, `EXPIRED`, `CANCELLED` |
| `ScheduleType` | `FULL_TIME`, `PART_TIME`, `SHIFT` |
| `AttendanceStatus` | `PRESENT`, `HALF_DAY`, `LATE`¹, `ABSENT`, `OVERTIME`, `MISSING_CHECKOUT` |
| `TimeOffUnit` | `DAYS`, `HOURS` |
| `AllocationStatus` | `PENDING`, `ACTIVE`, `REFUSED`, `EXPIRED` |
| `TimeOffRequestStatus` | `PENDING`, `APPROVED`, `REFUSED`, `CANCELLED` |
| `RuleCategory` | `BASIC`, `ALLOWANCE`, `GROSS`, `DEDUCTION`, `NET` |
| `ComputationMethod` | `FIXED`, `PERCENTAGE`, `FORMULA` |
| `PayrunStatus` | `DRAFT`, `COMPUTING`, `COMPUTED`, `VALIDATED`, `PAID`, `SENT` |
| `PayslipStatus` | `DRAFT`, `COMPUTED`, `VALIDATED`, `PAID`, `SENT` |
| `PasswordResetRequestStatus` | `PENDING`, `COMPLETED`, `REJECTED` |

¹ `LATE` is retained for historical rows only. Nothing derives it any more — a
late arrival that still completes the scheduled day is `PRESENT`.

---

## Roles and permissions

Permissions are `resource:action` strings checked by
`requirePermission()` middleware, never by ad-hoc role checks inside handlers. A
user can hold **several roles**; a permission is granted if any of their roles
carries it.

| Permission | Employee | HR Manager | HR Payroll User | HR Payroll Manager | Admin |
| --- | :-: | :-: | :-: | :-: | :-: |
| `employee:read:own` / `attendance:*:own` / `timeoff:*:own` | ✅ | | | | ✅ |
| `employee:read` / `employee:write` | | ✅ | ✅ | read only | ✅ |
| `contract:read` / `contract:write` | | ✅ | ✅ | read only | ✅ |
| `schedule:read` / `schedule:write` | | ✅ | ✅ | | ✅ |
| `attendance:read` / `write` / `correct` | | ✅ | ✅ | | ✅ |
| `timeoff:read` / `write` / `approve` | | ✅ | ✅ | | ✅ |
| `payrun:read` / `payrun:write` | | | ✅ | ✅ | ✅ |
| `payslip:read` / `payslip:write` | | | ✅ | ✅ | ✅ |
| `salarystructure:read` / `salaryrule:read` | | | ✅ | ✅ | ✅ |
| `salarystructure:write` / `salaryrule:write` | | | | ✅ | ✅ |
| `dashboard:read` | | | ✅ | ✅ | ✅ |
| `user:manage` | | | | | ✅ |

HR Payroll User is deliberately "HR Manager **plus** payroll" — it inherits the
full HR Manager set. Admin holds `*`.

The frontend keeps a mirror of this matrix in `frontend/lib/permissions.js` to
decide what to render. It is a UX aid only — the API enforces the real boundary
on every request, so drift there is a cosmetic bug, not a security hole.

---

## How the core logic works

### Attendance → day fractions

Status and pay are graded on **how much of the scheduled day was actually
worked**, not on whether a row exists:

```
worked ≥ scheduled day           → dayFraction 1     → PRESENT (or OVERTIME past the grace period)
worked ≥ half the scheduled day  → dayFraction 0.5   → HALF_DAY
below that                       → dayFraction 0     → ABSENT
no check-out yet                 → dayFraction 0     → PRESENT (day still in progress)
```

A "scheduled day" comes from the employee's own schedule
(`weeklyHours / 5`), falling back to 8 hours when they have none — so a
part-timer finishing their 4-hour day earns a full day, not half of someone
else's. Worked hours, overtime, day fraction and status are all **derived** in
one place (`services/attendance.js`) and never accepted as client input.

### Payroll → the rule engine

A salary structure holds ordered rules. Each rule computes an amount and writes
it into a running context that later rules read from, so `NET` is not a stored
formula — it is whatever the context holds once the ordered walk finishes.

Rules compute as `FIXED`, `PERCENTAGE`, or `FORMULA` (an expression evaluated in
a sandbox, not `eval`). The context is seeded with reserved variables that a rule
may read but not shadow — `WAGE`, `FULL_WAGE`, `ANNUAL_CTC`, `WORKED_RATIO`,
`WORKED_DAYS`, `PERIOD_DAYS`. Naming a rule after one of them is rejected.

### CTC and proration

`Contract.ctc` is an **annual** Cost to Company — what HR actually negotiates,
not a monthly take-home someone has to work out by hand before it can go in the
system. The rule engine derives everything else from it:

```
workedDays  = Σ dayFraction over the period, capped at 1 per calendar day
periodDays  = working days the schedule says the period contained
workedRatio = min(workedDays / periodDays, 1)

WAGE       = (contract.ctc / 12) × workedRatio   ← prorated monthly, what rules use by default
FULL_WAGE  = contract.ctc / 12                   ← unprorated monthly, opt-in
ANNUAL_CTC = contract.ctc                        ← the raw annual figure, opt-in
```

A structure's rules break `WAGE` **down**, not build on top of it — Basic is a
share of it (e.g. 40%), HRA and other allowances are shares of Basic, and a
`SPECIAL_ALLOWANCE` formula absorbs whatever's left so the components always
reconcile back to the full prorated monthly CTC before deductions:

```
BASIC             = 0.40 × WAGE
HRA               = 0.20 × BASIC
SPECIAL_ALLOWANCE = WAGE - BASIC - HRA - TA         ← balancing figure
GROSS             = BASIC + HRA + TA + SPECIAL_ALLOWANCE   (= WAGE)
NET               = GROSS - PF - PT - TDS
```

`WORKED_RATIO` is capped at 1 — extra days are overtime, which the structure
prices separately, and must never inflate CTC past 100% for the period.

### Payrun lifecycle

```
DRAFT ──compute──► COMPUTING ──(worker)──► COMPUTED ──validate──► VALIDATED
                                                                      │
                                                        mark-paid ────┤
                                                                      ▼
                                                                    PAID ──send-payslips──► SENT
```

A payrun is created only **after** employees are selected, and contains only the
selected ones. `validate` surfaces warnings before money moves — missing bank
account, duplicate payslip, a payslip computed against a different structure than
its contract nominally specifies.

### Time off

Approving deducts from the allocation covering the request's dates, inside a
`Serializable` transaction so two approvers cannot spend the same balance twice
(there is a concurrency test for exactly this). Approval is refused outright when
the balance is insufficient, and a request can never claim more duration than the
calendar span of its own dates.

The allocation that approval drew from is recorded **on the request**, so a later
cancellation restores the same allocation rather than re-resolving "which
allocation covers these dates", which could pick a different row later.

Employees can't cancel their own approved leave — that would let them hand
themselves their balance back — so they raise a cancellation request that lands
in an HR queue instead.

### Password resets

There is no outbound mail path for self-service reset links, so the flow is
deliberately human:

```
login screen "forgot password" ──► admin queue ──► admin sets a new password
                                                            │
                                          mustChangePassword = true
                                                            ▼
                                    user is forced through /change-password
```

The forgot-password endpoint answers identically whether or not the address
matches an account, so it can't be used to enumerate users. Setting someone
else's password hashes it, flags the forced change, **revokes every live refresh
token for that user**, and writes an audit entry — never logging the plaintext.
The forced change is enforced server-side: `requireAuth` returns `428` on every
route except the change-password endpoint itself, so it can't be skipped by
calling the API directly.

---

## API reference

All routes are under `/api`, all require a Bearer access token except
`/api/auth/login`, `/api/auth/refresh` and `/api/auth/password-reset-requests`.
Full request/response schemas are in Swagger UI at `/api-docs`.

<details>
<summary><b>Auth</b></summary>

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/login` | Rate limited per IP. Returns an access token; sets the refresh cookie |
| POST | `/api/auth/refresh` | Rotates the refresh token |
| POST | `/api/auth/logout` | Revokes the refresh token |
| POST | `/api/auth/change-password` | The only route reachable while `mustChangePassword` is set |
| POST | `/api/auth/password-reset-requests` | Public, enumeration-safe, rate limited |
</details>

<details>
<summary><b>People</b></summary>

| Method | Path |
| --- | --- |
| GET / POST | `/api/employees` |
| GET / PATCH | `/api/employees/:id` |
| GET / POST | `/api/contracts` |
| GET / PATCH | `/api/contracts/:id` |
| GET / POST | `/api/schedules` |
| GET / PATCH | `/api/schedules/:id` |
</details>

<details>
<summary><b>Attendance</b></summary>

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/attendance` | Own records, or org-wide with `attendance:read` |
| GET | `/api/attendance/:id` | |
| POST | `/api/attendance` | Check in |
| PATCH | `/api/attendance/:id/checkout` | Check out |
| PATCH | `/api/attendance/:id/correct` | Manual correction — audit-logged with before/after |
</details>

<details>
<summary><b>Time off</b></summary>

| Method | Path | Notes |
| --- | --- | --- |
| GET / POST / PATCH | `/api/timeoff-types` | |
| GET / POST | `/api/timeoff-allocations` | |
| GET / PATCH | `/api/timeoff-allocations/:id` | |
| POST | `/api/timeoff-allocations/:id/approve` \| `/refuse` | |
| GET / POST | `/api/timeoff-requests` | |
| POST | `/api/timeoff-requests/:id/approve` \| `/refuse` | Serializable; refuses on insufficient balance |
| POST | `/api/timeoff-requests/:id/cancel` | Withdraw a pending request, or reverse an approved one (`timeoff:approve` only) |
| POST | `/api/timeoff-requests/:id/request-cancellation` | Employee asks HR to undo approved leave |
</details>

<details>
<summary><b>Payroll</b></summary>

| Method | Path | Notes |
| --- | --- | --- |
| GET / POST | `/api/salary-structures` | |
| GET / PATCH | `/api/salary-structures/:id` | |
| GET / POST | `/api/salary-structures/:id/rules` | |
| PATCH / DELETE | `/api/salary-structures/:id/rules/:ruleId` | |
| GET | `/api/payruns/eligible-employees` | Who can be included in a period |
| GET / POST | `/api/payruns` | |
| GET | `/api/payruns/:id` | |
| POST | `/api/payruns/:id/compute` | Enqueues; returns a job id |
| GET | `/api/payruns/:id/compute/:jobId` | Poll job state |
| POST | `/api/payruns/:id/validate` \| `/mark-paid` \| `/send-payslips` | |
| GET | `/api/payslips` · `/api/payslips/:id` | |
| POST | `/api/payslips/:id/print` → GET `/print/:jobId` | PDF via the worker |
</details>

<details>
<summary><b>Administration & dashboard</b></summary>

| Method | Path | Notes |
| --- | --- | --- |
| GET / POST | `/api/users` | `user:manage` |
| PATCH | `/api/users/:id` | Self-role-elevation is refused |
| POST | `/api/users/:id/reset-password` | Self-targeting is refused |
| GET | `/api/password-reset-requests` | The admin queue |
| POST | `/api/password-reset-requests/:id/resolve` \| `/reject` | |
| GET | `/api/dashboard/kpis` · `/salary-cost-by-department` · `/salary-trend` · `/payslip-status` · `/attendance-overview` · `/time-off-overview` · `/department-overview` · `/company` | All `dashboard:read`, all accept `periodStart` / `periodEnd` / `department` / `employeeType` |
</details>

---

## Background jobs

Three BullMQ queues, all consumed by `npm run worker`:

| Queue | Triggered by | Does |
| --- | --- | --- |
| `payrun-compute` | `POST /api/payruns/:id/compute` | Resolves each employee's contract, computes worked days and proration, evaluates the rule engine, writes payslips and lines |
| `payslip-pdf` | `POST /api/payslips/:id/print` | Renders the payslip to PDF with `pdf-lib` |
| `payslip-email` | `POST /api/payruns/:id/send-payslips` | Sends payslips to employees |

Compute is queued rather than inline so a payrun over a large workforce never
blocks a request thread — and so the API stays responsive while it runs.

---

## Security

- **JWT access tokens** (15 min default) with **refresh tokens** stored hashed, tracked by family, rotated on use and revocable per user
- **Account lockout** after `LOGIN_LOCKOUT_THRESHOLD` failed attempts
- **IP rate limiting** on login and password-reset requests, backed by Redis
- **RBAC** enforced by middleware on every protected route
- **Zod validation** on request bodies and query strings
- **Audit log** of sensitive mutations, storing before/after values
- **Forced password change** enforced as an HTTP `428` gate server-side, not merely a client redirect
- **Enumeration-safe** forgot-password responses
- `helmet` security headers, CORS restricted to `CORS_ORIGIN`, bcrypt at cost 12
- **Derived-not-supplied**: worked hours, overtime, day fraction, attendance status and payslip amounts are all computed server-side and never accepted from the client

---

## Seed data

`npm run seed` clears and rebuilds the database with ~100 employees across six
departments, and is **anchored to the day it runs** rather than fixed calendar
dates — so the current period always has data in it.

- Contracts spanning `ACTIVE` / `DRAFT` / `EXPIRED` / `CANCELLED`, a few expiring within two months so the dashboard's expiry alert has something real to report
- Attendance across the last three months plus the current month to date, generated through the **real** `deriveAttendanceFields` service — so seeded rows obey exactly the bands a live check-in would
- Three completed payruns (`SENT`, `PAID`, `COMPUTED`) for the previous three months, plus a `DRAFT` for the current month as the starting point for the compute → validate → pay → send walkthrough
- Payslips whose worked days and proration come from that seeded attendance via the same services the compute job uses, so a seeded payslip matches what recomputing the payrun would produce
- Time-off types in both `DAYS` and `HOURS`, allocations, and requests in every status including some awaiting HR cancellation
- CTC bands are **annual**, matching `Contract.ctc` — the rule engine derives the monthly breakdown

The seed uses a deterministic PRNG, so a reseed produces the same dataset rather
than reshuffling every chart between runs.

---

## Testing

```bash
cd backend
npm test          # vitest
```

10 suites, 70 tests, covering the parts where being wrong costs money:

| Suite | Covers |
| --- | --- |
| `attendance` | Day-fraction bands, status derivation, schedule fallbacks |
| `workedDays` | Day-equivalents, scheduled working days, ratio capping |
| `ruleEngine` | Ordered evaluation, reserved codes, proration |
| `formulaEvaluator` | Sandboxed expression evaluation |
| `contractResolution` | Which contract applies to a period |
| `payrunCompute` | Payrun → payslips end to end |
| `payrunValidation` | Pre-payment warnings |
| `payslipPdf` | PDF rendering |
| `dashboard` | Aggregates |
| `timeOffApproval.concurrency` | Two approvers cannot spend the same balance twice |

---

## Troubleshooting

**A payroll action hangs forever.** The worker isn't running. See
[the warning above](#the-worker-is-not-optional).

**Every page takes ~30 s and then errors.** Postgres or Redis is down — most
often Docker Desktop stopped. Every request sits on a connection timeout, which
reads as "the app is slow" rather than "the database is gone". Check
`http://localhost:4000/health`; it returns `503 degraded` when either is
unreachable.

**Port 5433 is already taken.** `docker-compose.yml` maps Postgres to host port
`5433`. If a native Postgres already owns it, create a
`docker-compose.override.yml` remapping it (e.g. `5434`) and point
`backend/.env`'s `DATABASE_URL` at the new port. That file is gitignored — it's
per-machine, not shared.

**"Too many attempts. Wait a few minutes."** The login rate limiter is keyed by
**IP, not account**, so heavy testing from one machine locks out that machine's
browser too. Clear it with:

```bash
docker exec peoplepay360-redis-1 redis-cli --scan --pattern 'rl:auth:*' | xargs -r -n1 docker exec peoplepay360-redis-1 redis-cli DEL
```

**Reseeding fails on unique constraints.** The seed clears its own tables first,
but if the database is in a partial state, reset it:

```bash
cd backend && npx prisma migrate reset --force
```

**First page load in dev takes ~1 s.** Next.js dev mode compiles each route on
first visit. It disappears on subsequent visits and doesn't exist in a production
build.
