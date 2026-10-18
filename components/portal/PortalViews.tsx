import { LocalDateTime, RememberTimeZone } from "@/components/portal/LocalDateTime";
import { parseStatusLabel } from "@/lib/portal/candidate-portal";

const STAGE_LABELS: Record<string, string> = {
  CV_POOL: "Application received",
  EXPERT_REVIEW: "Under review",
  TECH_EVALUATION: "Technical evaluation",
  SHORTLISTED: "Shortlisted",
  SELECTED: "Selected",
  HIRED: "Hired",
  REJECTED: "Not progressing",
};

export function stageLabel(status: string, withdrawn: boolean) {
  if (withdrawn) return "Withdrawn";
  return STAGE_LABELS[status] ?? status;
}

const focus =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";

export function PortalHomeView(input: {
  email: string;
  cards: Array<{
    id: number;
    job: string;
    company: string;
    stage: string;
    nextAction: string | null;
    href: string;
  }>;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-white px-4 py-8 text-zinc-900">
      <h1 className="text-2xl font-bold">Your applications</h1>
      <p className="mt-2 text-sm text-zinc-800">Signed in as {input.email}</p>
      {input.cards.length === 0 ? (
        <p className="mt-8 text-zinc-800">No applications are linked to this email yet.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {input.cards.map((card) => (
            <li key={card.id} className="rounded-xl border border-zinc-300 p-4">
              <p className="text-sm font-semibold text-zinc-800">{card.company}</p>
              <h2 className="text-lg font-bold">
                <a className={`${focus} inline-flex border-0 px-0`} href={card.href}>
                  {card.job}
                </a>
              </h2>
              <p className="mt-1 text-sm">Current stage: {card.stage}</p>
              {card.nextAction ? <p className="mt-2 text-sm font-semibold">Next: {card.nextAction}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export function PortalApplicationView(input: {
  id: number;
  job: string;
  company: string;
  stage: string;
  notice: string;
  optedOut: boolean;
  humanReview: boolean;
  withdrawn: boolean;
  unsubscribed: boolean;
  deletionQueued: boolean;
  futureRoles: boolean;
  timeline: Array<{ at: string; label: string }>;
  nextAction: string | null;
  interviews: Array<{ id: number; at: string; type: string; meetUrl: string | null; past: boolean }>;
  assessments: Array<{ deadline: string; limit: string; submittedAt: string | null }>;
  documents: Array<{ fileName: string; kind: string; message: string }>;
  error: string | null;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-white px-4 py-8 text-zinc-900">
      <RememberTimeZone endpoint={`/portal/applications/${input.id}/timezone`} />
      <p className="text-sm">
        <a className={focus} href="/portal/home">
          All applications
        </a>
      </p>
      <p className="mt-4 text-sm font-semibold text-zinc-800">{input.company}</p>
      <h1 className="text-2xl font-bold">{input.job}</h1>
      <p className="mt-2 text-base">Current stage: {input.stage}</p>
      {input.nextAction ? <p className="mt-2 font-semibold">Next: {input.nextAction}</p> : null}
      {input.error ? (
        <p role="alert" className="mt-4 rounded-lg border border-zinc-900 p-3 text-sm">
          {input.error}
        </p>
      ) : null}

      <section className="mt-8" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="text-lg font-bold">
          Timeline
        </h2>
        <ol className="mt-3 space-y-2">
          {input.timeline.map((item) => (
            <li key={`${item.at}-${item.label}`}>
              <LocalDateTime iso={item.at} />
              {" — "}
              {item.label}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8" aria-labelledby="documents-heading">
        <h2 id="documents-heading" className="text-lg font-bold">
          Documents
        </h2>
        <ul className="mt-3 space-y-2">
          {input.documents.length === 0 ? <li>No documents yet.</li> : null}
          {input.documents.map((doc) => (
            <li key={`${doc.kind}-${doc.fileName}`}>
              {doc.kind}: {doc.fileName}. {doc.message || parseStatusLabel("PENDING")}
            </li>
          ))}
        </ul>
        <form className="mt-4 space-y-3" method="post" action="/portal/act" encType="multipart/form-data">
          <input type="hidden" name="intent" value="upload" />
          <input type="hidden" name="applicationId" value={String(input.id)} />
          <label className="block text-sm font-semibold" htmlFor="doc-kind">
            Document type
          </label>
          <select id="doc-kind" name="kind" className={focus}>
            <option value="RESUME">Resume</option>
            <option value="COVER_LETTER">Cover letter</option>
            <option value="CERTIFICATE">Certificate</option>
          </select>
          <label className="block text-sm font-semibold" htmlFor="doc-file">
            File
          </label>
          <input id="doc-file" name="file" type="file" required className={focus} />
          <button className={focus} type="submit">
            Upload document
          </button>
        </form>
      </section>

      <section className="mt-8" aria-labelledby="interviews-heading">
        <h2 id="interviews-heading" className="text-lg font-bold">
          Interviews
        </h2>
        <ul className="mt-3 space-y-3">
          {input.interviews.length === 0 ? <li>No interviews yet.</li> : null}
          {input.interviews.map((interview) => (
            <li key={interview.id} className="rounded-lg border border-zinc-300 p-3">
              <p>
                {interview.past ? "Past" : "Upcoming"} {interview.type}: <LocalDateTime iso={interview.at} />
              </p>
              {interview.meetUrl ? (
                <p>
                  <a className={focus} href={interview.meetUrl}>
                    Join meeting
                  </a>
                </p>
              ) : null}
              <p className="mt-2">
                <a className={focus} href={`/portal/interviews/${interview.id}/calendar`}>
                  Add to calendar
                </a>
              </p>
            </li>
          ))}
        </ul>
        <form className="mt-3" method="post" action="/portal/act">
          <input type="hidden" name="intent" value="reschedule" />
          <input type="hidden" name="applicationId" value={String(input.id)} />
          <button className={focus} type="submit">
            Reschedule interview
          </button>
        </form>
        <form className="mt-2" method="post" action="/portal/act">
          <input type="hidden" name="intent" value="cancel-interview" />
          <input type="hidden" name="applicationId" value={String(input.id)} />
          <button className={focus} type="submit">
            Cancel interview
          </button>
        </form>
      </section>

      <section className="mt-8" aria-labelledby="assessments-heading">
        <h2 id="assessments-heading" className="text-lg font-bold">
          Assessments
        </h2>
        <ul className="mt-3 space-y-2">
          {input.assessments.length === 0 ? <li>No assessment has been sent.</li> : null}
          {input.assessments.map((item) => (
            <li key={item.deadline}>
              {item.submittedAt ? (
                <p>Submitted on <LocalDateTime iso={item.submittedAt} />.</p>
              ) : (
                <div>
                  <p>
                    Due <LocalDateTime iso={item.deadline} />. Time limit {item.limit}. Nothing here is scored for you to see. You can request extra time on the assessment itself.
                  </p>
                  <form className="mt-2" method="post" action="/portal/act">
                    <input type="hidden" name="intent" value="assess" />
                    <input type="hidden" name="applicationId" value={String(input.id)} />
                    <button className={focus} type="submit">
                      Take assessment
                    </button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading" className="text-lg font-bold">
          Privacy and AI
        </h2>
        <p id="ai-notice" className="mt-2 text-sm text-zinc-800">
          {input.notice}
        </p>
        <form className="mt-3" method="post" action="/portal/act">
          <input type="hidden" name="intent" value="future-roles" />
          <input type="hidden" name="applicationId" value={String(input.id)} />
          <input type="hidden" name="allowed" value={input.futureRoles ? "no" : "yes"} />
          <button className={focus} type="submit">
            {input.futureRoles ? "Stop considering me for future roles" : "Consider me for future roles"}
          </button>
        </form>
        <form className="mt-3" method="post" action="/portal/act">
          <input type="hidden" name="applicationId" value={String(input.id)} />
          <input type="hidden" name="intent" value={input.optedOut ? "opt-in" : "opt-out"} />
          <button className={focus} type="submit">
            {input.optedOut ? "Opt back in to AI evaluation" : "Opt out of AI evaluation"}
          </button>
        </form>
        <form className="mt-2" method="post" action="/portal/act">
          <input type="hidden" name="intent" value="human-review" />
          <input type="hidden" name="applicationId" value={String(input.id)} />
          <button className={focus} type="submit" disabled={input.humanReview}>
            {input.humanReview ? "Human review requested" : "Request a human review"}
          </button>
        </form>
        <p className="mt-3">
          <a className={focus} href={`/portal/export?applicationId=${input.id}`}>
            Download my data
          </a>
        </p>
        <form className="mt-3" method="post" action="/portal/act">
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="applicationId" value={String(input.id)} />
          <button className={focus} type="submit" disabled={input.deletionQueued}>
            {input.deletionQueued ? "Deletion request queued" : "Request deletion"}
          </button>
        </form>
        <form className="mt-4 space-y-2" method="post" action="/portal/act">
          <input type="hidden" name="intent" value="withdraw" />
          <input type="hidden" name="applicationId" value={String(input.id)} />
          <label className="block text-sm font-semibold" htmlFor="withdraw-reason">
            Withdraw this application
          </label>
          <input id="withdraw-reason" name="reason" className={focus} placeholder="Optional reason" />
          <button className={focus} type="submit" disabled={input.withdrawn}>
            {input.withdrawn ? "Application withdrawn" : "Withdraw application"}
          </button>
        </form>
        <form className="mt-3" method="post" action="/portal/act">
          <input type="hidden" name="intent" value="unsubscribe" />
          <input type="hidden" name="applicationId" value={String(input.id)} />
          <button className={focus} type="submit" disabled={input.unsubscribed}>
            {input.unsubscribed ? "Unsubscribed from non-essential email" : "Unsubscribe from non-essential email"}
          </button>
        </form>
      </section>
    </main>
  );
}

export function PortalLoginView(input: { error: string | null; sent: boolean }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col bg-white px-4 py-10 text-zinc-900">
      <h1 className="text-2xl font-bold">Candidate portal</h1>
      <p className="mt-2 text-sm text-zinc-800">
        We’ll email a sign-in link. It expires in 30 minutes. You can request a fresh one if it expires.
      </p>
      {input.sent ? <p className="mt-4">Check your email for a sign-in link.</p> : null}
      {input.error ? (
        <p role="alert" className="mt-4 text-sm">
          {input.error}
        </p>
      ) : null}
      <form className="mt-6 space-y-3" method="post" action="/portal/act">
        <input type="hidden" name="intent" value="magic-link" />
        <label className="block text-sm font-semibold" htmlFor="portal-email">
          Email
        </label>
        <input id="portal-email" name="email" type="email" required autoComplete="email" className={`${focus} w-full`} />
        <button className={focus} type="submit">
          Email me a link
        </button>
      </form>
    </main>
  );
}
