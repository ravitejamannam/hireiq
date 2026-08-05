type InterviewCardProps = {
  id: number;
  candidate: string;
  company: string;
  interviewer: string;
  date: string;
  time: string;
  status: string;
  onDelete: (id: number) => void;
};

export default function InterviewCard({
  id,
  candidate,
  company,
  interviewer,
  date,
  time,
  status,
  onDelete,
}: InterviewCardProps) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-6 transition hover:border-black">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-bold text-black">{candidate}</h3>

          <p className="mt-1 text-zinc-500">{company}</p>
        </div>

        <div className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-black">
          {status}
        </div>
      </div>

      <div className="mt-8 border-t border-zinc-200 pt-4 space-y-2">
        <p className="text-sm text-zinc-600">
          <span className="font-semibold text-black">Interviewer:</span>{" "}
          {interviewer}
        </p>

        <p className="text-sm text-zinc-600">
          <span className="font-semibold text-black">Date:</span> {date}
        </p>

        <p className="text-sm text-zinc-600">
          <span className="font-semibold text-black">Time:</span> {time}
        </p>

        <div className="mt-6 flex justify-end">
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
