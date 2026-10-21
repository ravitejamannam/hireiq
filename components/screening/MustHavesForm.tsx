"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { saveJobMustHaves } from "@/app/actions/screening-actions";

type MustHave = { requirement: string; question: string; expectedAnswer: "yes" | "no" };

const BLANK: MustHave = { requirement: "", question: "", expectedAnswer: "yes" };

export default function MustHavesForm({ jobId, initial }: { jobId: number; initial: MustHave[] }) {
  const router = useRouter();
  const [items, setItems] = useState<MustHave[]>(initial.length > 0 ? initial : [BLANK, BLANK, BLANK]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function change(index: number, patch: Partial<MustHave>) {
    setItems((current) => current.map((item, at) => (at === index ? { ...item, ...patch } : item)));
  }

  async function save(next: MustHave[]) {
    setPending(true);
    setMessage(null);
    const result = await saveJobMustHaves({ jobId, items: next });
    setPending(false);
    if (!result.ok) {
      setMessage({ ok: false, text: result.error });
      return;
    }
    setMessage({ ok: true, text: result.count === 0 ? "Must-haves cleared." : `${result.count} must-haves saved. New applicants see them on the application form.` });
    router.refresh();
  }

  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        void save(items);
      }}
    >
      {items.map((item, index) => (
        <fieldset key={index} className="grid gap-2 rounded-lg border border-zinc-200 p-3 sm:grid-cols-[1fr_2fr_auto_auto]">
          <legend className="px-1 text-xs text-zinc-500">Must-have {index + 1}</legend>
          <label>
            <span className="block text-xs text-zinc-600">Requirement</span>
            <input className="w-full rounded border px-2 py-1" value={item.requirement} maxLength={200} onChange={(event) => change(index, { requirement: event.target.value })} placeholder="Work authorisation" />
          </label>
          <label>
            <span className="block text-xs text-zinc-600">Yes/no question on the application form</span>
            <input className="w-full rounded border px-2 py-1" value={item.question} maxLength={300} onChange={(event) => change(index, { question: event.target.value })} placeholder="Are you authorised to work in India?" />
          </label>
          <label>
            <span className="block text-xs text-zinc-600">Meets it when</span>
            <select className="rounded border px-2 py-1" value={item.expectedAnswer} onChange={(event) => change(index, { expectedAnswer: event.target.value as "yes" | "no" })}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <button type="button" className="self-end rounded border px-2 py-1 text-xs" disabled={items.length <= 3} onClick={() => setItems((current) => current.filter((_, at) => at !== index))}>
            Remove
          </button>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="rounded border px-3 py-1" disabled={items.length >= 5} onClick={() => setItems((current) => [...current, BLANK])}>
          Add must-have
        </button>
        <button type="submit" className="rounded bg-zinc-900 px-3 py-1 text-white" disabled={pending}>
          {pending ? "Saving…" : "Save must-haves"}
        </button>
        {initial.length > 0 ? (
          <button type="button" className="rounded border px-3 py-1" disabled={pending} onClick={() => void save([])}>
            Remove all
          </button>
        ) : null}
        <span className="text-xs text-zinc-500">3 to 5. An answer that does not match puts the applicant under “Doesn&apos;t meet stated requirements” for a person to review. Nobody is rejected automatically.</span>
      </div>
      {message ? <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-emerald-800" : "text-red-800"}>{message.text}</p> : null}
    </form>
  );
}
