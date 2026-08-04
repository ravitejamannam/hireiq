type ActivityItemProps = {
  title: string;
  time: string;
};

export default function ActivityItem({
  title,
  time,
}: ActivityItemProps) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-zinc-200 p-4">
      <div className="mt-1 h-3 w-3 rounded-full bg-black" />

      <div>
        <p className="font-medium text-black">
          {title}
        </p>

        <p className="mt-1 text-sm text-zinc-500">
          {time}
        </p>
      </div>
    </div>
  );
}