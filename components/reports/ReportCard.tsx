import type { Recommendation } from "@prisma/client";

type ReportCardProps = {
  id: number;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  recommendation: Recommendation;
  notes: string | null;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
};

export default function ReportCard({
  id,
  candidateName,
  jobTitle,
  companyName,
  recommendation,
  notes,
  onEdit,
  onDelete,
}: ReportCardProps) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-6 transition hover:border-black">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-bold text-black">{candidateName}</h3>

          <p className="mt-1 text-zinc-500">{jobTitle}</p>
          <p className="mt-1 text-sm text-zinc-400">{companyName}</p>
        </div>

        <div className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-black">
          {recommendation}
        </div>
      </div>

      <div className="mt-8 space-y-2 border-t border-zinc-200 pt-4">
        {notes ? (
          <p className="text-sm text-zinc-600">
            <span className="font-semibold text-black">Notes:</span> {notes}
          </p>
        ) : (
          <p className="text-sm text-zinc-500">No notes provided.</p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={() => onEdit(id)}
            className="
              rounded-lg
              border
              border-zinc-300
              px-4
              py-2
              text-sm
              font-medium
              text-black
              transition
              hover:bg-zinc-100
            "
          >
            Edit
          </button>

          <button
            onClick={() => onDelete(id)}
            className="
              rounded-lg
              border
              border-red-200
              px-4
              py-2
              text-sm
              font-medium
              text-red-600
              transition
              hover:bg-red-50
            "
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}