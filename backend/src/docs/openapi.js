// Hand-written OpenAPI 3.0 document, not generated from JSDoc comments in the
// route files — kept as one file so it can be reviewed/updated in one place
// as routes change, rather than scattered annotations across 13 route files.
// Served via swagger-ui-express at /api-docs (see src/index.js).

const ROLE_VALUES = ["EMPLOYEE", "HR_MANAGER", "HR_PAYROLL_USER", "HR_PAYROLL_MANAGER", "ADMIN"];

function err(description) {
  return { description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
}

function paginated(schemaName) {
  return {
    type: "object",
    properties: {
      data: { type: "array", items: { $ref: `#/components/schemas/${schemaName}` } },
      pagination: { $ref: "#/components/schemas/PaginationMeta" },
    },
  };
}

function jsonBody(schemaName) {
  return { content: { "application/json": { schema: { $ref: `#/components/schemas/${schemaName}` } } } };
}

const paginationParams = [
  { name: "page", in: "query", schema: { type: "integer", default: 1 } },
  { name: "pageSize", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
];

const idParam = { name: "id", in: "path", required: true, schema: { type: "integer" } };

// Shared by every /api/dashboard/* endpoint except department-overview (which
// groups BY department, so a department filter there would be self-defeating).
const dashboardFilterParams = [
  { name: "periodStart", in: "query", schema: { type: "string", format: "date" }, description: "Defaults to the start of the current month." },
  { name: "periodEnd", in: "query", schema: { type: "string", format: "date" }, description: "Defaults to the end of the current month." },
  { name: "department", in: "query", schema: { type: "string" } },
  { name: "employeeType", in: "query", schema: { type: "string", enum: ["FULL_TIME", "PART_TIME", "SHIFT"] }, description: "Maps to the employee's WorkingSchedule.type." },
  { name: "company", in: "query", schema: { type: "string" }, description: "Single-tenant system — matching the one real company (see GET /api/dashboard/company) returns real data; anything else returns zeroed/empty data." },
];

const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "PeoplePay360 API",
    version: "0.1.0",
    description:
      "HR & Payroll backend. Every mutating request goes through the same middleware chain: JWT auth → " +
      "role/ownership check → zod body validation → handler. See plan.md's Section 4/5 for the full " +
      "permission matrix this spec's `security` notes reference by resource:action string.",
  },
  servers: [{ url: "http://localhost:4000", description: "Local dev" }],
  tags: [
    { name: "Auth" },
    { name: "Users" },
    { name: "Employees" },
    { name: "Contracts" },
    { name: "Schedules" },
    { name: "Attendance" },
    { name: "Time Off Types" },
    { name: "Time Off Allocations" },
    { name: "Time Off Requests" },
    { name: "Salary Structures" },
    { name: "Salary Rules" },
    { name: "Payruns" },
    { name: "Payslips" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
          issues: { type: "array", items: { type: "object" }, nullable: true },
        },
      },
      PaginationMeta: {
        type: "object",
        properties: {
          page: { type: "integer" },
          pageSize: { type: "integer" },
          total: { type: "integer" },
          totalPages: { type: "integer" },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "integer" },
          email: { type: "string", format: "email" },
          roles: { type: "array", items: { type: "string", enum: ROLE_VALUES } },
          employeeId: { type: "integer", nullable: true },
          isActive: { type: "boolean" },
          lastLoginAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Employee: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          department: { type: "string" },
          managerId: { type: "integer", nullable: true },
          jobPosition: { type: "string" },
          scheduleId: { type: "integer", nullable: true },
          status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Contract: {
        type: "object",
        properties: {
          id: { type: "integer" },
          employeeId: { type: "integer" },
          startDate: { type: "string", format: "date" },
          endDate: { type: "string", format: "date", nullable: true },
          wage: { type: "string", description: "Decimal, serialized as string" },
          salaryStructureId: { type: "integer", nullable: true },
          status: { type: "string", enum: ["DRAFT", "ACTIVE", "EXPIRED", "CANCELLED"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      WorkingSchedule: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          type: { type: "string", enum: ["FULL_TIME", "PART_TIME", "SHIFT"] },
          weeklyHours: { type: "string", description: "Computed server-side from pattern, never accepted as input" },
          pattern: {
            type: "array",
            items: {
              type: "object",
              properties: {
                day: { type: "string", enum: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] },
                start: { type: "string", example: "09:00" },
                end: { type: "string", example: "17:00" },
                break: { type: "integer", description: "minutes" },
              },
            },
          },
        },
      },
      Attendance: {
        type: "object",
        properties: {
          id: { type: "integer" },
          employeeId: { type: "integer" },
          checkIn: { type: "string", format: "date-time" },
          checkOut: { type: "string", format: "date-time", nullable: true },
          workedHours: { type: "string", nullable: true, description: "Computed, never accepted as input" },
          overtimeHours: { type: "string", description: "Computed, never accepted as input" },
          dayFraction: {
            type: "string",
            description:
              "Day-equivalents earned: 1 full, 0.5 half, 0 below the half-day bar. Computed, never accepted as input; this is what payroll prorates against.",
          },
          status: {
            type: "string",
            enum: ["PRESENT", "HALF_DAY", "LATE", "ABSENT", "OVERTIME", "MISSING_CHECKOUT"],
          },
          isManualCorrection: { type: "boolean" },
        },
      },
      TimeOffType: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          unit: { type: "string", enum: ["DAYS", "HOURS"] },
          requiresAllocation: { type: "boolean" },
          payrollIntegrated: { type: "boolean" },
          approverRole: { type: "string", nullable: true },
          displayColor: { type: "string", nullable: true },
        },
      },
      TimeOffAllocation: {
        type: "object",
        properties: {
          id: { type: "integer" },
          employeeId: { type: "integer" },
          timeOffTypeId: { type: "integer" },
          allocated: { type: "string" },
          taken: { type: "string" },
          remaining: { type: "string" },
          validFrom: { type: "string", format: "date" },
          validTo: { type: "string", format: "date" },
          status: { type: "string", enum: ["PENDING", "ACTIVE", "REFUSED", "EXPIRED"] },
        },
      },
      TimeOffRequest: {
        type: "object",
        properties: {
          id: { type: "integer" },
          employeeId: { type: "integer" },
          timeOffTypeId: { type: "integer" },
          startDate: { type: "string", format: "date" },
          endDate: { type: "string", format: "date" },
          duration: { type: "string" },
          status: { type: "string", enum: ["PENDING", "APPROVED", "REFUSED", "CANCELLED"] },
        },
      },
      SalaryStructure: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          active: { type: "boolean" },
          ruleCount: { type: "integer", description: "List view only" },
          activeEmployeeCount: { type: "integer", description: "List view only, via Contract.groupBy" },
        },
      },
      SalaryRule: {
        type: "object",
        properties: {
          id: { type: "integer" },
          salaryStructureId: { type: "integer" },
          name: { type: "string" },
          code: { type: "string", description: "Bare identifier — referenced by later rules' formulas" },
          category: { type: "string", enum: ["BASIC", "ALLOWANCE", "GROSS", "DEDUCTION", "NET"] },
          sequence: { type: "integer" },
          computationMethod: { type: "string", enum: ["FIXED", "PERCENTAGE", "FORMULA"] },
          formulaOrValue: { type: "string", example: "0.10 * BASIC" },
        },
      },
      Payrun: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          salaryStructureId: { type: "integer" },
          periodStart: { type: "string", format: "date" },
          periodEnd: { type: "string", format: "date" },
          status: { type: "string", enum: ["DRAFT", "COMPUTING", "COMPUTED", "VALIDATED", "PAID", "SENT"] },
        },
      },
      Payslip: {
        type: "object",
        properties: {
          id: { type: "integer" },
          payrunId: { type: "integer" },
          employeeId: { type: "integer" },
          contractId: { type: "integer" },
          status: { type: "string", enum: ["DRAFT", "COMPUTED", "VALIDATED", "PAID", "SENT"] },
          workedDays: { type: "string" },
        },
      },
      EligibleEmployee: {
        type: "object",
        properties: {
          employeeId: { type: "integer" },
          name: { type: "string" },
          department: { type: "string" },
          weeklyHours: { type: "number", nullable: true },
          contractId: { type: "integer" },
          startDate: { type: "string", format: "date" },
          wage: { type: "string" },
        },
      },
      DashboardKpis: {
        type: "object",
        properties: {
          totalNetSalaryPaid: { type: "number" },
          netSalaryChangePercent: { type: "number", nullable: true, description: "vs. the immediately preceding period of equal length; null if that period had no paid salary to compare against." },
          payslipsGenerated: { type: "integer" },
          payslipsPaid: { type: "integer" },
          payslipsPending: { type: "integer" },
          avgSalaryPerEmployee: { type: "number" },
          approvedTimeOffDays: { type: "number" },
          attendanceHealthPercent: { type: "integer", nullable: true },
          attendanceRecordsReviewed: { type: "integer" },
        },
      },
      DashboardPayslipStatus: {
        type: "object",
        properties: {
          statusCounts: { type: "object", properties: { DRAFT: { type: "integer" }, COMPUTED: { type: "integer" }, VALIDATED: { type: "integer" }, PAID: { type: "integer" }, SENT: { type: "integer" } } },
          alerts: { type: "array", items: { type: "object", properties: { code: { type: "string" }, count: { type: "integer" }, message: { type: "string" } } } },
        },
      },
      DashboardTimeOffRow: {
        type: "object",
        properties: {
          typeId: { type: "integer" },
          name: { type: "string" },
          unit: { type: "string", enum: ["DAYS", "HOURS"] },
          approvedDays: { type: "number" },
          pendingDays: { type: "number" },
          remainingBalance: { type: "number", nullable: true, description: "null for types that don't requireAllocation — there's no balance to track." },
        },
      },
      DashboardDepartmentRow: {
        type: "object",
        properties: {
          department: { type: "string" },
          headcount: { type: "integer" },
          monthlySalary: { type: "number" },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in",
        description: "Rate-limited (10/15min, Redis-backed). Sets an httpOnly refresh-token cookie. Account locks after 5 consecutive failures for 15 minutes.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: { email: { type: "string", format: "email" }, password: { type: "string" } },
              },
            },
          },
        },
        responses: {
          200: { description: "Access token + user", content: { "application/json": { schema: { type: "object", properties: { accessToken: { type: "string" }, user: { $ref: "#/components/schemas/User" } } } } } },
          401: err("Invalid email or password"),
          423: err("Account locked"),
          429: err("Rate limited"),
        },
      },
    },
    "/api/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Rotate the refresh token cookie for a new access token",
        description: "Reuse of an already-rotated token revokes the whole token family (theft detection).",
        security: [],
        responses: { 200: { description: "New access token" }, 401: err("Missing, invalid, or reused refresh token") },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Revoke the current refresh token family",
        security: [],
        responses: { 200: { description: "OK" } },
      },
    },

    "/api/users": {
      get: {
        tags: ["Users"], summary: "List users", description: "Requires `user:manage` (Admin only).",
        parameters: paginationParams,
        responses: { 200: { description: "OK", content: { "application/json": { schema: paginated("User") } } }, 403: err("Not Admin") },
      },
      post: {
        tags: ["Users"], summary: "Create a user", description: "Requires `user:manage` (Admin only).",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email", "password", "roles"], properties: { email: { type: "string" }, password: { type: "string", minLength: 8 }, employeeId: { type: "integer", nullable: true }, roles: { type: "array", items: { type: "string", enum: ROLE_VALUES } } } } } } },
        responses: { 201: { description: "Created", ...jsonBody("User") }, 409: err("Email or employee already linked to a user") },
      },
    },
    "/api/users/{id}": {
      patch: {
        tags: ["Users"], summary: "Update a user's roles/status/employee link", description: "Requires `user:manage` (Admin only). Self-role-elevation is blocked: a request cannot change its own `roles`.",
        parameters: [idParam],
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { roles: { type: "array", items: { type: "string", enum: ROLE_VALUES } }, isActive: { type: "boolean" }, employeeId: { type: "integer", nullable: true } } } } } },
        responses: { 200: { description: "Updated", ...jsonBody("User") }, 403: err("Self-role-change attempt, or not Admin"), 404: err("Not found") },
      },
    },

    "/api/employees": {
      get: { tags: ["Employees"], summary: "List employees", description: "Requires `employee:read` (HR-tier+). An Employee role cannot list.", parameters: [...paginationParams, { name: "department", in: "query", schema: { type: "string" } }, { name: "status", in: "query", schema: { type: "string" } }], responses: { 200: { description: "OK", content: { "application/json": { schema: paginated("Employee") } } } } },
      post: { tags: ["Employees"], summary: "Create an employee", description: "Requires `employee:write`.", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "department", "jobPosition"], properties: { name: { type: "string" }, department: { type: "string" }, jobPosition: { type: "string" }, managerId: { type: "integer", nullable: true }, scheduleId: { type: "integer", nullable: true }, status: { type: "string", enum: ["ACTIVE", "INACTIVE"] } } } } } }, responses: { 201: { description: "Created", ...jsonBody("Employee") } } },
    },
    "/api/employees/{id}": {
      get: { tags: ["Employees"], summary: "Get an employee", description: "An Employee may only fetch their own record (object-level ownership check); HR-tier+ may fetch any.", parameters: [idParam], responses: { 200: { description: "OK", ...jsonBody("Employee") }, 403: err("Not own record and not elevated"), 404: err("Not found") } },
      patch: { tags: ["Employees"], summary: "Update an employee", description: "Requires `employee:write`.", parameters: [idParam], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Employee" } } } }, responses: { 200: { description: "Updated", ...jsonBody("Employee") } } },
    },

    "/api/contracts": {
      get: { tags: ["Contracts"], summary: "List contracts", description: "Requires `contract:read`.", parameters: [...paginationParams, { name: "employeeId", in: "query", schema: { type: "integer" } }, { name: "status", in: "query", schema: { type: "string" } }], responses: { 200: { description: "OK", content: { "application/json": { schema: paginated("Contract") } } } } },
      post: {
        tags: ["Contracts"], summary: "Create a contract", description: "Requires `contract:write`. Overlapping ACTIVE contracts for the same employee are rejected by a DB exclusion constraint, surfaced as 409.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["employeeId", "startDate", "wage"], properties: { employeeId: { type: "integer" }, startDate: { type: "string", format: "date" }, endDate: { type: "string", format: "date", nullable: true }, wage: { type: "number" }, salaryStructureId: { type: "integer", nullable: true }, status: { type: "string", enum: ["DRAFT", "ACTIVE", "EXPIRED", "CANCELLED"] } } } } } },
        responses: { 201: { description: "Created", ...jsonBody("Contract") }, 409: err("Overlapping active contract for this employee") },
      },
    },
    "/api/contracts/{id}": {
      get: { tags: ["Contracts"], summary: "Get a contract", parameters: [idParam], responses: { 200: { description: "OK", ...jsonBody("Contract") } } },
      patch: { tags: ["Contracts"], summary: "Update a contract", description: "Requires `contract:write`. Same overlap-conflict 409 applies.", parameters: [idParam], responses: { 200: { description: "Updated", ...jsonBody("Contract") }, 409: err("Overlapping active contract") } },
    },

    "/api/schedules": {
      get: { tags: ["Schedules"], summary: "List working schedules", description: "Requires `schedule:read`.", parameters: paginationParams, responses: { 200: { description: "OK", content: { "application/json": { schema: paginated("WorkingSchedule") } } } } },
      post: { tags: ["Schedules"], summary: "Create a working schedule", description: "Requires `schedule:write`. `weeklyHours` is computed server-side from `pattern` — cannot be set directly even if included in the request.", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "type", "pattern"], properties: { name: { type: "string" }, type: { type: "string", enum: ["FULL_TIME", "PART_TIME", "SHIFT"] }, pattern: { type: "array", items: { type: "object", properties: { day: { type: "string" }, start: { type: "string" }, end: { type: "string" }, break: { type: "integer" } } } } } } } } }, responses: { 201: { description: "Created", ...jsonBody("WorkingSchedule") } } },
    },
    "/api/schedules/{id}": {
      get: { tags: ["Schedules"], summary: "Get a working schedule", parameters: [idParam], responses: { 200: { description: "OK", ...jsonBody("WorkingSchedule") } } },
      patch: { tags: ["Schedules"], summary: "Update a working schedule", description: "Requires `schedule:write`. `weeklyHours` recomputed if `pattern` changes.", parameters: [idParam], responses: { 200: { description: "Updated", ...jsonBody("WorkingSchedule") } } },
    },

    "/api/attendance": {
      get: { tags: ["Attendance"], summary: "List attendance records", description: "An Employee sees only their own; HR-tier+ requires `attendance:read` and may filter by `employeeId`.", parameters: [...paginationParams, { name: "employeeId", in: "query", schema: { type: "integer" } }, { name: "status", in: "query", schema: { type: "string" } }], responses: { 200: { description: "OK", content: { "application/json": { schema: paginated("Attendance") } } } } },
      post: { tags: ["Attendance"], summary: "Check in", description: "An Employee may check themself in (`attendance:write:own`); HR-tier+ may check in anyone (`attendance:write`). `workedHours`/`overtimeHours`/`status` are always derived server-side against the employee's schedule.", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["employeeId", "checkIn"], properties: { employeeId: { type: "integer" }, checkIn: { type: "string", format: "date-time" }, checkOut: { type: "string", format: "date-time", nullable: true } } } } } }, responses: { 201: { description: "Created", ...jsonBody("Attendance") } } },
    },
    "/api/attendance/{id}": {
      get: { tags: ["Attendance"], summary: "Get an attendance record", parameters: [idParam], responses: { 200: { description: "OK", ...jsonBody("Attendance") } } },
    },
    "/api/attendance/{id}/checkout": {
      patch: { tags: ["Attendance"], summary: "Check out (fill in a missing checkout)", description: "Fails with 409 if the record already has a checkout — use /correct instead.", parameters: [idParam], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["checkOut"], properties: { checkOut: { type: "string", format: "date-time" } } } } } }, responses: { 200: { description: "Updated", ...jsonBody("Attendance") }, 409: err("Already has a checkout") } },
    },
    "/api/attendance/{id}/correct": {
      patch: { tags: ["Attendance"], summary: "Manually correct check-in/out", description: "Requires `attendance:correct` (HR-tier+). Always writes an AuditLog row with before/after inside the same transaction.", parameters: [idParam], requestBody: { content: { "application/json": { schema: { type: "object", properties: { checkIn: { type: "string", format: "date-time" }, checkOut: { type: "string", format: "date-time", nullable: true } } } } } }, responses: { 200: { description: "Corrected", ...jsonBody("Attendance") } } },
    },

    "/api/timeoff-types": {
      get: { tags: ["Time Off Types"], summary: "List time off types", description: "Open to any authenticated user — reference data for filing a request.", responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/TimeOffType" } } } } } } } } },
      post: { tags: ["Time Off Types"], summary: "Create a time off type", description: "Requires `timeoff:write` (HR-tier+).", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "unit"], properties: { name: { type: "string" }, unit: { type: "string", enum: ["DAYS", "HOURS"] }, requiresAllocation: { type: "boolean" }, payrollIntegrated: { type: "boolean" }, approverRole: { type: "string", nullable: true }, displayColor: { type: "string", nullable: true } } } } } }, responses: { 201: { description: "Created", ...jsonBody("TimeOffType") } } },
    },
    "/api/timeoff-types/{id}": {
      patch: { tags: ["Time Off Types"], summary: "Update a time off type", description: "Requires `timeoff:write`.", parameters: [idParam], responses: { 200: { description: "Updated", ...jsonBody("TimeOffType") } } },
    },

    "/api/timeoff-allocations": {
      get: { tags: ["Time Off Allocations"], summary: "List allocations", description: "An Employee sees only their own; HR-tier+ requires `timeoff:read`.", parameters: [...paginationParams, { name: "employeeId", in: "query", schema: { type: "integer" } }], responses: { 200: { description: "OK", content: { "application/json": { schema: paginated("TimeOffAllocation") } } } } },
      post: { tags: ["Time Off Allocations"], summary: "Grant an allocation", description: "Requires `timeoff:write`. Always created with status `PENDING` — not usable until approved.", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["employeeId", "timeOffTypeId", "allocated", "validFrom", "validTo"], properties: { employeeId: { type: "integer" }, timeOffTypeId: { type: "integer" }, allocated: { type: "number" }, validFrom: { type: "string", format: "date" }, validTo: { type: "string", format: "date" } } } } } }, responses: { 201: { description: "Created (PENDING)", ...jsonBody("TimeOffAllocation") } } },
    },
    "/api/timeoff-allocations/{id}": {
      get: { tags: ["Time Off Allocations"], summary: "Get an allocation", parameters: [idParam], responses: { 200: { description: "OK", ...jsonBody("TimeOffAllocation") } } },
      patch: { tags: ["Time Off Allocations"], summary: "Update an allocation", description: "Requires `timeoff:write`. `remaining`/`taken` are never directly settable; `status` here only accepts `EXPIRED` — approve/refuse are separate actions.", parameters: [idParam], requestBody: { content: { "application/json": { schema: { type: "object", properties: { allocated: { type: "number" }, validFrom: { type: "string", format: "date" }, validTo: { type: "string", format: "date" }, status: { type: "string", enum: ["EXPIRED"] } } } } } }, responses: { 200: { description: "Updated", ...jsonBody("TimeOffAllocation") } } },
    },
    "/api/timeoff-allocations/{id}/approve": {
      post: { tags: ["Time Off Allocations"], summary: "Approve a pending allocation", description: "Requires `timeoff:approve`. 409 if not currently PENDING.", parameters: [idParam], responses: { 200: { description: "Now ACTIVE", ...jsonBody("TimeOffAllocation") }, 409: err("Not PENDING") } },
    },
    "/api/timeoff-allocations/{id}/refuse": {
      post: { tags: ["Time Off Allocations"], summary: "Refuse a pending allocation", description: "Requires `timeoff:approve`. 409 if not currently PENDING.", parameters: [idParam], responses: { 200: { description: "Now REFUSED", ...jsonBody("TimeOffAllocation") }, 409: err("Not PENDING") } },
    },

    "/api/timeoff-requests": {
      get: { tags: ["Time Off Requests"], summary: "List time off requests", description: "An Employee sees only their own; HR-tier+ requires `timeoff:read`.", parameters: [...paginationParams, { name: "employeeId", in: "query", schema: { type: "integer" } }, { name: "status", in: "query", schema: { type: "string" } }], responses: { 200: { description: "OK", content: { "application/json": { schema: paginated("TimeOffRequest") } } } } },
      post: { tags: ["Time Off Requests"], summary: "Submit a time off request", description: "An Employee may only submit for themself. Filing never touches the Allocation — only approval does.", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["employeeId", "timeOffTypeId", "startDate", "endDate", "duration"], properties: { employeeId: { type: "integer" }, timeOffTypeId: { type: "integer" }, startDate: { type: "string", format: "date" }, endDate: { type: "string", format: "date" }, duration: { type: "number" } } } } } }, responses: { 201: { description: "Created (PENDING)", ...jsonBody("TimeOffRequest") } } },
    },
    "/api/timeoff-requests/{id}": {
      get: { tags: ["Time Off Requests"], summary: "Get a time off request", parameters: [idParam], responses: { 200: { description: "OK", ...jsonBody("TimeOffRequest") } } },
    },
    "/api/timeoff-requests/{id}/cancel": {
      post: { tags: ["Time Off Requests"], summary: "Cancel your own pending request", description: "Only legal while still PENDING.", parameters: [idParam], responses: { 200: { description: "Now CANCELLED", ...jsonBody("TimeOffRequest") }, 409: err("Not PENDING") } },
    },
    "/api/timeoff-requests/{id}/approve": {
      post: {
        tags: ["Time Off Requests"], summary: "Approve a pending request",
        description: "Requires `timeoff:approve`. Runs in a **Serializable** DB transaction: reloads the allocation, verifies balance covers the duration, atomically decrements `remaining`/increments `taken`. Two concurrent approvals racing the same allocation: exactly one succeeds, the other gets 409 (either a balance failure or a Prisma P2034 serialization failure).",
        parameters: [idParam],
        responses: { 200: { description: "Now APPROVED, balance deducted", ...jsonBody("TimeOffRequest") }, 409: err("Not PENDING, no covering allocation, insufficient balance, or a concurrent conflict — ask the client to retry") },
      },
    },
    "/api/timeoff-requests/{id}/refuse": {
      post: { tags: ["Time Off Requests"], summary: "Refuse a pending request", description: "Requires `timeoff:approve`.", parameters: [idParam], responses: { 200: { description: "Now REFUSED", ...jsonBody("TimeOffRequest") }, 409: err("Not PENDING") } },
    },

    "/api/salary-structures": {
      get: { tags: ["Salary Structures"], summary: "List salary structures", description: "Requires `salarystructure:read` (HR Payroll User = read-only, HR Payroll Manager = full CRUD). List view includes a live `ruleCount` and `activeEmployeeCount`.", parameters: [...paginationParams, { name: "active", in: "query", schema: { type: "boolean" } }], responses: { 200: { description: "OK", content: { "application/json": { schema: paginated("SalaryStructure") } } } } },
      post: { tags: ["Salary Structures"], summary: "Create a salary structure", description: "Requires `salarystructure:write`.", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, active: { type: "boolean" } } } } } }, responses: { 201: { description: "Created", ...jsonBody("SalaryStructure") } } },
    },
    "/api/salary-structures/{id}": {
      get: { tags: ["Salary Structures"], summary: "Get a structure with its ordered rules", parameters: [idParam], responses: { 200: { description: "OK", ...jsonBody("SalaryStructure") } } },
      patch: { tags: ["Salary Structures"], summary: "Update a salary structure", description: "Requires `salarystructure:write`.", parameters: [idParam], responses: { 200: { description: "Updated", ...jsonBody("SalaryStructure") } } },
    },

    "/api/salary-structures/{structureId}/rules": {
      get: { tags: ["Salary Rules"], summary: "List a structure's rules, in sequence order", description: "Requires `salaryrule:read`.", parameters: [{ name: "structureId", in: "path", required: true, schema: { type: "integer" } }], responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/SalaryRule" } } } } } } } } },
      post: {
        tags: ["Salary Rules"], summary: "Add a rule to a structure",
        description: "Requires `salaryrule:write`. `formulaOrValue` is syntax/reference-checked against a sample context at write time (400 if malformed). `code` must be unique within the structure (409 if taken). The formula grammar is a restricted arithmetic parser — no eval, no function calls, no property access.",
        parameters: [{ name: "structureId", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "code", "category", "sequence", "computationMethod", "formulaOrValue"], properties: { name: { type: "string" }, code: { type: "string" }, category: { type: "string", enum: ["BASIC", "ALLOWANCE", "GROSS", "DEDUCTION", "NET"] }, sequence: { type: "integer" }, computationMethod: { type: "string", enum: ["FIXED", "PERCENTAGE", "FORMULA"] }, formulaOrValue: { type: "string", example: "0.10 * BASIC" } } } } } },
        responses: { 201: { description: "Created", ...jsonBody("SalaryRule") }, 400: err("Malformed formula"), 409: err("Duplicate code in this structure") },
      },
    },
    "/api/salary-structures/{structureId}/rules/{ruleId}": {
      patch: { tags: ["Salary Rules"], summary: "Update a rule", description: "Requires `salaryrule:write`. Same formula/code validation as create.", parameters: [{ name: "structureId", in: "path", required: true, schema: { type: "integer" } }, { name: "ruleId", in: "path", required: true, schema: { type: "integer" } }], responses: { 200: { description: "Updated", ...jsonBody("SalaryRule") } } },
      delete: { tags: ["Salary Rules"], summary: "Delete a rule", description: "Requires `salaryrule:write`.", parameters: [{ name: "structureId", in: "path", required: true, schema: { type: "integer" } }, { name: "ruleId", in: "path", required: true, schema: { type: "integer" } }], responses: { 204: { description: "Deleted" } } },
    },

    "/api/payruns": {
      get: { tags: ["Payruns"], summary: "List payruns", description: "Requires `payrun:read`.", parameters: [...paginationParams, { name: "status", in: "query", schema: { type: "string" } }], responses: { 200: { description: "OK", content: { "application/json": { schema: paginated("Payrun") } } } } },
      post: { tags: ["Payruns"], summary: "Create a Payrun (Stage 5.1)", description: "Requires `payrun:write`. Creates a DRAFT Payrun; employee selection normally comes from GET /eligible-employees first.", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "salaryStructureId", "periodStart", "periodEnd", "employeeIds"], properties: { name: { type: "string" }, salaryStructureId: { type: "integer" }, periodStart: { type: "string", format: "date" }, periodEnd: { type: "string", format: "date" }, employeeIds: { type: "array", items: { type: "integer" } } } } } } }, responses: { 201: { description: "Created (DRAFT)", ...jsonBody("Payrun") } } },
    },
    "/api/payruns/eligible-employees": {
      get: {
        tags: ["Payruns"], summary: "Employees eligible for a period (wizard Step 2)",
        description: "Requires `payrun:write`. Mirrors resolveContractForPeriod's exact where-clause as a paginated Contract→Employee join — only employees with a resolvable ACTIVE contract for the period appear, not a filtered full employee list.",
        parameters: [
          { name: "periodStart", in: "query", required: true, schema: { type: "string", format: "date" } },
          { name: "periodEnd", in: "query", required: true, schema: { type: "string", format: "date" } },
          { name: "search", in: "query", schema: { type: "string" }, description: "Filter by employee name, case-insensitive" },
          ...paginationParams,
        ],
        responses: { 200: { description: "OK", content: { "application/json": { schema: paginated("EligibleEmployee") } } }, 400: err("Missing/invalid periodStart or periodEnd") },
      },
    },
    "/api/payruns/{id}": {
      get: { tags: ["Payruns"], summary: "Get a Payrun with its payslips", parameters: [idParam], responses: { 200: { description: "OK", ...jsonBody("Payrun") } } },
    },
    "/api/payruns/{id}/compute": {
      post: {
        tags: ["Payruns"], summary: "Compute payslips (Stage 5.2, async)",
        description: "Requires `payrun:write`. Rate limited (5/min). Enqueues a BullMQ job and returns 202 immediately — actual computation (resolveContractForPeriod → rule engine → worked days) runs in the separate worker process (`npm run worker`), never inline. Poll .../compute/:jobId for status. 409 if the Payrun isn't DRAFT or COMPUTED.",
        parameters: [idParam],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["employeeIds"], properties: { employeeIds: { type: "array", items: { type: "integer" } } } } } } },
        responses: { 202: { description: "Job enqueued", content: { "application/json": { schema: { type: "object", properties: { jobId: { type: "string" }, payrunId: { type: "string" }, status: { type: "string" } } } } } }, 409: err("Wrong status for compute"), 429: err("Rate limited") },
      },
    },
    "/api/payruns/{id}/compute/{jobId}": {
      get: { tags: ["Payruns"], summary: "Poll a compute job's status/progress", parameters: [idParam, { name: "jobId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Job state, progress {done,total}, and return value once completed" }, 404: err("Job not found") } },
    },
    "/api/payruns/{id}/validate": {
      post: {
        tags: ["Payruns"], summary: "Validate a computed Payrun",
        description: "Requires `payrun:write`. Real data-driven findings: no_applicable_contract, duplicate_payslip (cross-Payrun period overlap), negative_net. Note: missing_bank_details is NOT implemented — Employee has no bank-detail field yet. Moves to VALIDATED only if no blocking findings; writes an AuditLog entry either way.",
        parameters: [idParam],
        responses: { 200: { description: "New status + findings array", content: { "application/json": { schema: { type: "object", properties: { payrunId: { type: "string" }, status: { type: "string" }, findings: { type: "array", items: { type: "object", properties: { code: { type: "string" }, blocking: { type: "boolean" }, employeeId: { type: "string" }, message: { type: "string" } } } } } } } } }, 409: err("Not COMPUTED/VALIDATED") },
      },
    },
    "/api/payruns/{id}/mark-paid": {
      post: { tags: ["Payruns"], summary: "Mark a validated Payrun (and its payslips) paid", description: "Requires `payrun:write`. 409 unless currently VALIDATED. Writes an AuditLog entry.", parameters: [idParam], responses: { 200: { description: "Now PAID" }, 409: err("Not VALIDATED") } },
    },
    "/api/payruns/{id}/send-payslips": {
      post: { tags: ["Payruns"], summary: "Bulk-send payslip emails (Stage 5.3, async)", description: "Requires `payrun:write`. Enqueues one payslip-email job per payslip (never sends inline in a loop). SMTP is mocked — every send writes a real `mail.sent` AuditLog row. 409 unless currently PAID.", parameters: [idParam], responses: { 202: { description: "Jobs enqueued", content: { "application/json": { schema: { type: "object", properties: { payrunId: { type: "string" }, status: { type: "string" }, jobIds: { type: "array", items: { type: "string" } } } } } } }, 409: err("Not PAID") } },
    },

    "/api/payslips": {
      get: { tags: ["Payslips"], summary: "List payslips", description: "An Employee sees only their own; HR-tier+ may filter by employeeId/payrunId/status.", parameters: [...paginationParams, { name: "employeeId", in: "query", schema: { type: "integer" } }, { name: "payrunId", in: "query", schema: { type: "integer" } }, { name: "status", in: "query", schema: { type: "string" } }], responses: { 200: { description: "OK", content: { "application/json": { schema: paginated("Payslip") } } } } },
    },
    "/api/payslips/{id}": {
      get: { tags: ["Payslips"], summary: "Get a payslip with its computed lines", description: "An Employee may only fetch their own.", parameters: [idParam], responses: { 200: { description: "OK", ...jsonBody("Payslip") }, 403: err("Not own record") } },
    },
    "/api/payslips/{id}/print": {
      post: { tags: ["Payslips"], summary: "Render this payslip to PDF (async)", description: "Enqueues a payslip-pdf job, returns 202 with a job id — same async pattern as Payrun compute, never renders inline.", parameters: [idParam], responses: { 202: { description: "Job enqueued", content: { "application/json": { schema: { type: "object", properties: { jobId: { type: "string" }, payslipId: { type: "string" } } } } } } } },
    },
    "/api/payslips/{id}/print/{jobId}": {
      get: { tags: ["Payslips"], summary: "Poll/download the rendered PDF", description: "Returns job state while pending; once completed, streams `application/pdf` bytes directly.", parameters: [idParam, { name: "jobId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "PDF bytes (once completed) or job state JSON (while pending)" } } },
    },

    "/api/dashboard/company": {
      get: { tags: ["Dashboard"], summary: "Get the single company name", description: "Single-tenant system — there is no Company model. This just backs the mockup's Company display; the `company` filter on every other dashboard endpoint is a no-op unless it doesn't match this value, in which case that endpoint honestly returns zeroed/empty data.", responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" } } } } } } } },
    },
    "/api/dashboard/kpis": {
      get: { tags: ["Dashboard"], summary: "Payroll Dashboard KPI row", description: "Requires `dashboard:read` (HR_PAYROLL_USER, HR_PAYROLL_MANAGER, ADMIN). Redis-cached for 60s, invalidated on any Payrun/Payslip/Attendance/TimeOff mutation. `periodStart`/`periodEnd` default to the current calendar month.", parameters: dashboardFilterParams, responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/DashboardKpis" } } } } } },
    },
    "/api/dashboard/salary-cost-by-department": {
      get: { tags: ["Dashboard"], summary: "Salary Cost by Department chart data", description: "Requires `dashboard:read`. Sums PAID/SENT payslip NET lines grouped by the employee's department.", parameters: dashboardFilterParams, responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { type: "object", properties: { department: { type: "string" }, totalNet: { type: "number" } } } } } } } } } } },
    },
    "/api/dashboard/salary-trend": {
      get: { tags: ["Dashboard"], summary: "Monthly Net Salary Trend chart data", description: "Requires `dashboard:read`. `months` (default 6, max 24) controls how many calendar months back from now to include.", parameters: [...dashboardFilterParams, { name: "months", in: "query", schema: { type: "integer", default: 6, maximum: 24 } }], responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { type: "object", properties: { month: { type: "string", example: "2026-08" }, totalNet: { type: "number" } } } } } } } } } } },
    },
    "/api/dashboard/payslip-status": {
      get: { tags: ["Dashboard"], summary: "Payslip status split + real payroll alerts", description: "Requires `dashboard:read`. Alerts are all computed from real data, never placeholders: missing bank account (`Employee.bankAccountOnFile`), duplicate payslips (reuses payrunValidation's own finding), payruns still not validated, and contracts expiring within the period.", parameters: dashboardFilterParams, responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/DashboardPayslipStatus" } } } } } },
    },
    "/api/dashboard/attendance-overview": {
      get: { tags: ["Dashboard"], summary: "Attendance Overview chart + stats", description: "Requires `dashboard:read`.", parameters: dashboardFilterParams, responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "object", properties: { statusCounts: { type: "object" }, manualCorrections: { type: "integer" }, missingCheckouts: { type: "integer" }, coveragePercent: { type: "integer", nullable: true }, totalRecords: { type: "integer" } } } } } } } },
    },
    "/api/dashboard/time-off-overview": {
      get: { tags: ["Dashboard"], summary: "Time Off Overview table", description: "Requires `dashboard:read`. Paginated per plan.md's scalability requirement, even though the row count is naturally small (one row per TimeOffType).", parameters: [...dashboardFilterParams, ...paginationParams], responses: { 200: { description: "OK", content: { "application/json": { schema: paginated("DashboardTimeOffRow") } } } } },
    },
    "/api/dashboard/department-overview": {
      get: { tags: ["Dashboard"], summary: "Department Overview table", description: "Requires `dashboard:read`. Headcount and monthly salary (sum of ACTIVE contract wages) per department. Not scoped by `department` — this endpoint IS the group-by-department view.", parameters: [{ name: "employeeType", in: "query", schema: { type: "string", enum: ["FULL_TIME", "PART_TIME", "SHIFT"] } }, { name: "company", in: "query", schema: { type: "string" } }, ...paginationParams], responses: { 200: { description: "OK", content: { "application/json": { schema: paginated("DashboardDepartmentRow") } } } } },
    },
  },
};

module.exports = { openapiSpec };
