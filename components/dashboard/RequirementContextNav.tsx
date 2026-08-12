import Link from "next/link";

type RequirementContextNavProps = {
  requirementId?: number | null;
  requirementTitle?: string | null;
};

export default function RequirementContextNav({
  requirementId,
  requirementTitle,
}: RequirementContextNavProps) {
  if (!requirementId) {
    return (
      <div className="mb-6">
        <Link
          href="/dashboard/requirements"
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          ← Back to Requirements
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
      <Link
        href={`/dashboard/requirements/${requirementId}`}
        className="font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
      >
        ← Back to Requirement
        {requirementTitle ? `: ${requirementTitle}` : ""}
      </Link>
      <span className="text-zinc-300" aria-hidden>
        |
      </span>
      <Link
        href="/dashboard/requirements"
        className="font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
      >
        All Requirements
      </Link>
    </div>
  );
}
