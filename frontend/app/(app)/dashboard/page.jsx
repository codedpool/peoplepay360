"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { formatCompactCurrency } from "../../../lib/currency";
import EmptyState from "../../../components/ui/EmptyState";
import BarChart from "../../../components/dashboard/BarChart";
import StackedBar from "../../../components/dashboard/StackedBar";
import TrendChart from "../../../components/dashboard/TrendChart";
import StatCard from "../../../components/dashboard/StatCard";

const EMPLOYEE_TYPE_LABELS = { FULL_TIME: "Full-time", PART_TIME: "Part-time", SHIFT: "Shift" };

const DEPARTMENT_PALETTE = ["bg-ledger", "bg-sky-500", "bg-seal", "bg-rose-400", "bg-violet-500", "bg-approved", "bg-slate-400"];

const ATTENDANCE_TONE = {
  PRESENT: "bg-approved",
  HALF_DAY: "bg-seal",
  ABSENT: "bg-stamp",
  OVERTIME: "bg-violet-500",
  MISSING_CHECKOUT: "bg-slate-400",
};

const PAYSLIP_STATUS_TONE = {
  DRAFT: "bg-slate-300",
  COMPUTED: "bg-sky-400",
  VALIDATED: "bg-violet-400",
  PAID: "bg-approved",
  SENT: "bg-ledger",
};

const PAYSLIP_STATUS_LABEL = { DRAFT: "Draft", COMPUTED: "Computed", VALIDATED: "Validated", PAID: "Paid", SENT: "Sent" };

const ALERT_ICON = {
  missing_bank_account: { tone: "text-stamp bg-stamp-light", path: "M3 10h18M5 6h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" },
  duplicate_payslip: { tone: "text-seal bg-seal-light", path: "M9 9h9a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 18 20.5H9A1.5 1.5 0 0 1 7.5 19V10.5A1.5 1.5 0 0 1 9 9Z M4.5 3.5h9A1.5 1.5 0 0 1 15 5v1.5" },
  drafts_not_validated: { tone: "text-seal bg-seal-light", path: "M12 8v5m0 3.5h.01M10.3 3.9 2.6 17.5a1.7 1.7 0 0 0 1.5 2.5h15.8a1.7 1.7 0 0 0 1.5-2.5L13.7 3.9a1.7 1.7 0 0 0-3.4 0Z" },
  contracts_expiring: { tone: "text-ledger bg-ledger-light", path: "M12 8v5l3 2M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z" },
};

function icon(path, viewBox = "0 0 24 24") {
  return (
    <svg width="18" height="18" viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function DashboardPage() {
  const { can } = useAuth();
  // Resolved on mount from the salary trend rather than defaulting to the
  // calendar month: landing on a month with no payrun would show a dashboard
  // of zeroes and read as broken, when it just means payroll hasn't run yet.
  const [month, setMonth] = useState(null);
  const [department, setDepartment] = useState("");
  const [employeeType, setEmployeeType] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [salaryCost, setSalaryCost] = useState([]);
  const [trend, setTrend] = useState([]);
  const [payslipStatus, setPayslipStatus] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [timeOff, setTimeOff] = useState([]);
  const [departments, setDepartments] = useState([]);

  // Pick the most recent month that actually has paid payroll, falling back to
  // the current month when there's none at all.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/api/dashboard/salary-trend?months=18");
        const withData = res.data.filter((t) => t.totalNet > 0);
        const latest = withData.length > 0 ? withData[withData.length - 1].month : currentMonth();
        if (!cancelled) setMonth(latest);
      } catch {
        if (!cancelled) setMonth(currentMonth());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    if (!month) return;
    setLoading(true);
    setLoadError(null);
    try {
      const { periodStart, periodEnd } = monthBounds(month);
      const qs = new URLSearchParams({ periodStart, periodEnd });
      if (department) qs.set("department", department);
      if (employeeType) qs.set("employeeType", employeeType);
      const q = qs.toString();

      const [kpisRes, costRes, trendRes, statusRes, attRes, toRes, deptRes] = await Promise.all([
        api.get(`/api/dashboard/kpis?${q}`),
        api.get(`/api/dashboard/salary-cost-by-department?${q}`),
        api.get(`/api/dashboard/salary-trend?${q}&months=9`),
        api.get(`/api/dashboard/payslip-status?${q}`),
        api.get(`/api/dashboard/attendance-overview?${q}`),
        api.get(`/api/dashboard/time-off-overview?${q}&pageSize=50`),
        api.get(`/api/dashboard/department-overview?pageSize=50${employeeType ? `&employeeType=${employeeType}` : ""}`),
      ]);
      setKpis(kpisRes);
      setSalaryCost(costRes.data);
      setTrend(trendRes.data);
      setPayslipStatus(statusRes);
      setAttendance(attRes);
      setTimeOff(toRes.data);
      setDepartments(deptRes.data);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [month, department, employeeType]);

  useEffect(() => {
    load();
  }, [load]);

  const departmentOptions = useMemo(() => departments.map((d) => d.department).sort(), [departments]);

  if (!can("dashboard:read")) {
    return <EmptyState message="You don't have access to this dashboard." />;
  }

  const attendanceBars = attendance
    ? Object.entries(attendance.statusCounts)
        .filter(([, v]) => v > 0)
        .map(([status, value]) => ({
          label: status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
          value,
          colorClass: ATTENDANCE_TONE[status] ?? "bg-slate-400",
        }))
    : [];

  const salaryCostBars = salaryCost.map((d, i) => ({
    label: d.department,
    value: d.totalNet,
    colorClass: DEPARTMENT_PALETTE[i % DEPARTMENT_PALETTE.length],
  }));

  const payslipStatusSegments = payslipStatus
    ? Object.entries(payslipStatus.statusCounts).map(([status, value]) => ({
        label: PAYSLIP_STATUS_LABEL[status] ?? status,
        value,
        colorClass: PAYSLIP_STATUS_TONE[status] ?? "bg-slate-300",
      }))
    : [];

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-[1.5rem] font-bold tracking-tight text-ink">Overview</h1>
          <p className="text-[0.85rem] text-fade mt-1">Here&apos;s what&apos;s happening across your workforce.</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <input
            type="month"
            className="field w-auto num"
            value={month ?? ""}
            onChange={(e) => setMonth(e.target.value)}
          />
          <select className="field w-auto max-w-[10rem]" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {departmentOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select className="field w-auto max-w-[9rem]" value={employeeType} onChange={(e) => setEmployeeType(e.target.value)}>
            <option value="">All types</option>
            {Object.entries(EMPLOYEE_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loadError && <EmptyState message={`Couldn't load the dashboard: ${loadError}`} />}
      {loading && !kpis && <p className="text-fade text-[0.85rem]">Loading…</p>}

      {kpis && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <StatCard
              icon={icon("M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6")}
              label="Total Net Salary Paid"
              value={formatCompactCurrency(kpis.totalNetSalaryPaid)}
              delta={kpis.netSalaryChangePercent}
              deltaLabel="vs previous month"
            />
            <StatCard
              icon={icon("M7 3.5h10v17l-2.3-1.5-2.2 1.5-2.2-1.5-2.2 1.5-1.1-1.5V3.5Z M9.3 8h5.4M9.3 11.3h5.4")}
              label="Payslips Generated"
              value={kpis.payslipsGenerated}
              caption={`${kpis.payslipsPaid} paid, ${kpis.payslipsPending} pending`}
            />
            <StatCard
              icon={icon("M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6")}
              label="Avg Salary / Employee"
              value={inr.format(kpis.avgSalaryPerEmployee)}
              caption="Based on paid payslips this period"
            />
            <StatCard
              icon={icon("M3.5 5h17v15h-17ZM3.5 9.5h17M8 3v3.2M16 3v3.2 M8.3 13.3l2 2 4.4-4.4")}
              label="Approved Time Off"
              value={`${kpis.approvedTimeOffDays}d`}
              caption="Across selected period"
            />
            <StatCard
              icon={icon("M3 12h4l2-7 4 14 2-7h6")}
              label="Attendance Health"
              value={kpis.attendanceHealthPercent != null ? `${kpis.attendanceHealthPercent}%` : "—"}
              caption={`${kpis.attendanceRecordsReviewed} records reviewed`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
            <div className="panel p-5">
              <h2 className="font-semibold text-[0.95rem]">Salary Cost by Department</h2>
              <p className="text-[0.72rem] text-fade mb-2">Source: payslips + employee department</p>
              {salaryCostBars.length > 0 ? (
                <BarChart bars={salaryCostBars} formatValue={formatCompactCurrency} />
              ) : (
                <p className="text-[0.82rem] text-fade py-8">No paid payslips in this period.</p>
              )}
            </div>
            <div className="panel p-5">
              <h2 className="font-semibold text-[0.95rem]">Monthly Net Salary Trend</h2>
              <p className="text-[0.72rem] text-fade mb-2">Source: historical payslips / payruns</p>
              <div className="text-ledger">
                <TrendChart
                  points={trend.map((t) => ({ label: t.month.slice(2), value: t.totalNet }))}
                  formatValue={formatCompactCurrency}
                />
              </div>
            </div>
            <div className="panel p-5">
              <h2 className="font-semibold text-[0.95rem]">Payslip Status &amp; Payroll Alerts</h2>
              <p className="text-[0.72rem] text-fade mb-3">Source: payrun + payslip validation</p>
              {payslipStatusSegments.some((s) => s.value > 0) && <StackedBar segments={payslipStatusSegments} />}
              {payslipStatus?.alerts?.length > 0 ? (
                <ul className="flex flex-col gap-2.5 mt-4 pt-4 border-t border-line">
                  {payslipStatus.alerts.map((a) => {
                    const cfg = ALERT_ICON[a.code] ?? ALERT_ICON.contracts_expiring;
                    return (
                      <li key={a.code} className="flex items-start gap-2.5">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${cfg.tone}`}>
                          {icon(cfg.path)}
                        </span>
                        <p className="text-[0.8rem] text-ink leading-snug pt-1">{a.message}</p>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[0.8rem] text-fade mt-4 pt-4 border-t border-line">Nothing needs attention this period.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
            <div className="panel p-5">
              <h2 className="font-semibold text-[0.95rem]">Attendance Overview</h2>
              <p className="text-[0.72rem] text-fade mb-2">Source: attendance</p>
              {attendanceBars.length > 0 ? (
                <>
                  <BarChart bars={attendanceBars} />
                  <dl className="grid grid-cols-1 gap-1.5 mt-4 pt-4 border-t border-line text-[0.78rem]">
                    <div className="flex justify-between">
                      <dt className="text-fade">Missing check-outs</dt>
                      <dd className="num font-medium">{attendance.missingCheckouts}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-fade">Manual attendance edits</dt>
                      <dd className="num font-medium">{attendance.manualCorrections}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-fade">Attendance coverage</dt>
                      <dd className="num font-medium">{attendance.coveragePercent != null ? `${attendance.coveragePercent}%` : "—"}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <p className="text-[0.82rem] text-fade py-8">No attendance records in this period.</p>
              )}
            </div>

            <div className="panel p-5">
              <h2 className="font-semibold text-[0.95rem]">Time Off Overview</h2>
              <p className="text-[0.72rem] text-fade mb-3">Source: time off requests + allocations</p>
              {timeOff.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th className="text-left">Type</th>
                        <th className="text-right">Approved</th>
                        <th className="text-right">Pending</th>
                        <th className="text-right">Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeOff.map((t) => (
                        <tr key={t.typeId}>
                          <td className="text-left">{t.name}</td>
                          <td className="num text-right">{t.approvedDays}</td>
                          <td className="num text-right">{t.pendingDays}</td>
                          <td className="num text-right">{t.remainingBalance ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[0.82rem] text-fade">No time off types configured.</p>
              )}
            </div>

            {departments.length > 0 && (
              <div className="panel p-5">
                <h2 className="font-semibold text-[0.95rem]">Department Overview</h2>
                <p className="text-[0.72rem] text-fade mb-3">Source: employee + contract + payslip totals</p>
                <div className="overflow-x-auto">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th className="text-left">Department</th>
                        <th className="text-right">Staff</th>
                        <th className="text-right">Salary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {departments.map((d) => (
                        <tr key={d.department}>
                          <td className="font-medium text-left">{d.department}</td>
                          <td className="num text-right">{d.headcount}</td>
                          <td className="num text-right">{formatCompactCurrency(d.monthlySalary)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
