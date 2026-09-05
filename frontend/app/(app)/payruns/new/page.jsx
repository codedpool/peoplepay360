"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../../../lib/api";
import PageHeader from "../../../../components/ui/PageHeader";
import ErrorNote from "../../../../components/ui/ErrorNote";
import EligibleEmployeesPicker from "../../../../components/payruns/EligibleEmployeesPicker";

async function pollCompute(payrunId, jobId) {
  for (let i = 0; i < 30; i++) {
    const res = await api.get(`/api/payruns/${payrunId}/compute/${jobId}`);
    if (res.state === "completed" || res.state === "failed") return res;
    await new Promise((r) => setTimeout(r, 800));
  }
  return { state: "timeout" };
}

export default function NewPayrunPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [structures, setStructures] = useState([]);
  const [name, setName] = useState("");
  const [salaryStructureId, setSalaryStructureId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [employeeIds, setEmployeeIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get("/api/salary-structures?pageSize=100&active=true")
      .then((res) => setStructures(res.data))
      .catch((err) => setError(err.message));
  }, []);

  function handleContinue(e) {
    e.preventDefault();
    setStep(2);
  }

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    try {
      setStatusMessage("Creating payrun…");
      const payrun = await api.post("/api/payruns", { name, salaryStructureId, periodStart, periodEnd, employeeIds });

      setStatusMessage("Computing payslips…");
      const job = await api.post(`/api/payruns/${payrun.id}/compute`, { employeeIds });
      const result = await pollCompute(payrun.id, job.jobId);

      if (result.state === "failed") {
        setError("Compute job failed. The payrun was created — open it to try computing again.");
        router.push(`/payruns/${payrun.id}`);
        return;
      }
      if (result.state === "timeout") {
        setError("Compute is taking longer than expected. Opening the payrun — refresh to check progress.");
      }
      router.push(`/payruns/${payrun.id}`);
    } catch (err) {
      setError(err.message);
      setStatusMessage(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="New payrun" description={`Step ${step} of 2 — ${step === 1 ? "payroll scope" : "select employees"}`} />

      {step === 1 && (
        <form onSubmit={handleContinue} className="flex flex-col gap-5">
          <div className="field-group">
            <label className="field-label">Payrun name</label>
            <input required className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field-group">
            <label className="field-label">Salary structure</label>
            <select required className="field" value={salaryStructureId} onChange={(e) => setSalaryStructureId(e.target.value)}>
              <option value="">Select structure</option>
              {structures.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-5">
            <div className="field-group">
              <label className="field-label">Period start</label>
              <input
                type="date"
                required
                className="field num"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="field-group">
              <label className="field-label">Period end</label>
              <input
                type="date"
                required
                className="field num"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
          <ErrorNote>{error}</ErrorNote>
          <div className="flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={() => router.push("/payruns")}>
              Discard
            </button>
            <button type="submit" className="btn-primary">
              Continue
            </button>
          </div>
        </form>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-5">
          <p className="text-[0.82rem] text-fade">
            {name} · {periodStart} – {periodEnd}. The payrun is created only once you select employees below.
          </p>
          <EligibleEmployeesPicker
            periodStart={periodStart}
            periodEnd={periodEnd}
            selected={employeeIds}
            onChange={setEmployeeIds}
          />
          <ErrorNote>{error}</ErrorNote>
          {statusMessage && <p className="text-[0.82rem] text-ledger">{statusMessage}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={() => setStep(1)} disabled={submitting}>
              Back
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={submitting || employeeIds.length === 0}
              onClick={handleCreate}
            >
              {submitting ? "Working…" : `Create payrun (${employeeIds.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
