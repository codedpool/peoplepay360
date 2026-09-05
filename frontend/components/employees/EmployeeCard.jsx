import Link from "next/link";
import Avatar from "../ui/Avatar";

export default function EmployeeCard({ employee }) {
  const active = employee.status === "ACTIVE";
  return (
    <Link
      href={`/employees/${employee.id}`}
      className="block panel px-4 py-4 hover:border-ink transition-colors"
    >
      <div className="flex items-start gap-3">
        <Avatar name={employee.name} />
        <div className="min-w-0">
          <p className="font-medium text-[0.9rem] truncate">{employee.name}</p>
          <p className="text-[0.78rem] text-fade truncate">{employee.jobPosition}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-3.5 text-[0.78rem] text-fade">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${active ? "bg-approved" : "bg-fade"}`} />
        <span>{employee.department}</span>
        <span>·</span>
        <span>{active ? "Active" : "Inactive"}</span>
      </div>
    </Link>
  );
}
