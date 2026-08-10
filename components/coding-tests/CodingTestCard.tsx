import type { CodingTestStatus } from "@prisma/client";

type CodingTestCardProps = {
  id: number;
  title: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  score: number;
  maxScore: number;
  status: CodingTestStatus;
  takenAt: Date;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
};

function formatDateTime(value: Date) {
  return new Date(value).toLocaleString();
}

export default function CodingTestCard({
  id,
  title,
  candidateName,
  jobTitle,
  companyName,
  score,
  maxScore,
  status,
  takenAt,
  onEdit,
  onDelete,
}: CodingTestCardProps) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-6 transition hover:border-black">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-bold text-black">{title}</h3>

          <p className="mt-1 text-zinc-500">{candidateName}</p>
          <p className="mt-1 text-sm text-zinc-400">{jobTitle}</p>
          <p className="mt-1 text-sm text-zinc-400">{companyName}</p>
        </div>

        <div className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-black">
          {status}
        </div>
      </div>

      <div className="mt-8 border-t border-zinc-200 pt-4 space-y-2">
        <p className="text-sm text-zinc-600">
          <span className="font-semibold text-black">Score:</span> {score} /{" "}
          {maxScore}
        </p>

        <p className="text-sm text-zinc-600">
          <span className="font-semibold text-black">Taken At:</span>{" "}
          {formatDateTime(takenAt)}
        </p>

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