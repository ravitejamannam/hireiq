import type { ReactNode } from "react";
import type { JobPostingView } from "@/lib/jobs/job-posting-view";

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50/60 p-5">
      <h3 className="text-sm font-semibold text-black">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-700">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function employmentTypeBadgeClass(type: JobPostingView["employmentType"]) {
  switch (type) {
    case "CONTRACT":
      return "bg-orange-50 text-orange-800";
    case "PART_TIME":
      return "bg-sky-50 text-sky-800";
    case "INTERNSHIP":
      return "bg-violet-50 text-violet-800";
    default:
      return "bg-emerald-50 text-emerald-800";
  }
}

type JobPostingDetailProps = {
  view: JobPostingView;
  headerRight?: ReactNode;
  showHeader?: boolean;
};

export default function JobPostingDetail({
  view,
  headerRight,
  showHeader = true,
}: JobPostingDetailProps) {
  const overview: Array<{ field: string; value: ReactNode }> = [
    { field: "Location", value: view.location || "Not set" },
    {
      field: "Type",
      value: (
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${employmentTypeBadgeClass(view.employmentType)}`}
        >
          {view.employmentTypeLabel}
        </span>
      ),
    },
    { field: "Level", value: view.seniorityLevelLabel },
    { field: "Openings", value: view.openings },
    { field: "Salary", value: view.salary },
    { field: "Posted", value: view.postedLabel },
  ];

  return (
    <article>
      {showHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-black">
              {view.title}
            </h2>
            <p className="mt-1 text-sm text-zinc-600">{view.companyName}</p>
          </div>
          {headerRight}
        </div>
      ) : headerRight ? (
        <div className="flex justify-end">{headerRight}</div>
      ) : null}

      <section className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-black">Overview</h3>
        <div className="overflow-hidden rounded-xl border border-zinc-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
              <th className="w-28 px-4 py-2">Field</th>
              <th className="px-4 py-2">Value</th>
            </tr>
          </thead>
          <tbody>
            {overview.map((row) => (
              <tr key={row.field} className="border-t border-zinc-100">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-widest text-zinc-400">
                  {row.field}
                </th>
                <td className="px-4 py-2.5 text-zinc-800">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <Section title="About the role">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
          {view.aboutRole}
        </p>
      </Section>

      <Section title="Responsibilities">
        <BulletList items={view.responsibilities} />
      </Section>

      <Section title="Requirements">
        <BulletList items={view.requirements} />
        {view.skills.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Required skills
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {view.skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-800"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {view.niceToHave.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Nice to have
            </p>
            <div className="mt-2">
              <BulletList items={view.niceToHave} />
            </div>
          </div>
        ) : null}
      </Section>

      <Section title="Benefits">
        <BulletList items={view.benefits} />
      </Section>

      <Section title={`About ${view.companyName}`}>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
          {view.aboutCompany}
        </p>
      </Section>

      {view.industry || view.companySize ? (
        <div className="mt-5 flex flex-wrap gap-1.5">
          {view.industry ? (
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-800">
              {view.industry}
            </span>
          ) : null}
          {view.companySize ? (
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-800">
              {view.companySize}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
