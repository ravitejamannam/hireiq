type InterviewItemProps = {
  time: string;
  candidate: string;
  status: string;
};

export default function InterviewItem({
  time,
  candidate,
  status,
}: InterviewItemProps) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-zinc-200 p-4">
      <div>
        <p className="font-semibold text-black">{candidate}</p>

        <p className="mt-1 text-sm text-zinc-500">{time}</p>
      </div>

      <span className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700">
        {status}
      </span>
    </div>
  );
}
