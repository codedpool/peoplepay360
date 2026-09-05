export default function PageHeader({ title, description, action }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-[1.3rem] font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-[0.85rem] text-fade mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}
