type CandidateCardProps = {
  id: number;
  name: string;
  role: string;
  experience: string;
  status: string;
  onDelete: (id: number) => void;
};

export default function CandidateCard({
  id,
  name,
  role,
  experience,
  status,
  onDelete,
}: CandidateCardProps) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-6 transition hover:border-black">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-bold text-black">
            {name}
          </h3>

          <p className="mt-1 text-zinc-500">
            {role}
          </p>
        </div>

        <div className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-black">
          {status}
        </div>
      </div>

      <div className="mt-8 border-t border-zinc-200 pt-4">
        <p className="text-sm text-zinc-500">
          Experience
        </p>

        <p className="mt-1 text-2xl font-bold text-black">
          {experience}
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