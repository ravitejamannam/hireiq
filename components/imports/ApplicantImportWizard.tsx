"use client";

import { useMemo, useState } from "react";

import {
  confirmImportAction,
  previewImportAction,
  saveImportTemplateAction,
} from "@/app/actions/applicant-import-actions";
import {
  BUILT_IN_TEMPLATES,
  IMPORT_FIELDS,
  suggestMapping,
  type ImportField,
  type ImportMapping,
} from "@/lib/imports/import-mapping";

type Preview = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  warnings: string[];
  unmappedHeaders: string[];
  rows: Array<{
    rowNumber: number;
    name: string;
    emailMasked: string | null;
    errors: string[];
    warnings: string[];
    proposal: "create" | "attach" | "review" | "skip";
    matchCandidateId: number | null;
    matchName: string | null;
    suggestions: Array<{ candidateId: number; name: string; reason: string }>;
  }>;
};

type Summary = {
  id: number;
  status: string;
  createdCount: number;
  attachedCount: number;
  skippedCount: number;
  failedCount: number;
  rows: Array<{
    rowNumber: number;
    status: string;
    code: string;
    name: string;
    emailMasked: string | null;
  }>;
};

const FIELD_LABELS: Record<ImportField, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  currentEmployer: "Current employer",
  currentTitle: "Current title",
  experience: "Experience years",
  externalCandidateId: "External candidate id",
  source: "Source",
  sourceJobId: "Source job id",
};

export default function ApplicantImportWizard({
  jobId,
  jobTitle,
  savedTemplates,
}: {
  jobId: number;
  jobTitle: string;
  savedTemplates: Array<{ id: number; name: string; mapping: unknown }>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, number | "new">>({});
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "confirm" | null>(null);
  const [templateName, setTemplateName] = useState("");

  const suggestion = useMemo(() => suggestMapping(headers), [headers]);

  async function runPreview(nextMapping: ImportMapping, nextFile = file) {
    if (!nextFile) return;
    setBusy("preview");
    setError(null);
    setSummary(null);
    const body = new FormData();
    body.set("jobId", String(jobId));
    body.set("file", nextFile);
    body.set("mapping", JSON.stringify(nextMapping));
    const result = await previewImportAction(body);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setHeaders(result.headers);
    setPreview(result.preview);
  }

  async function onFile(next: File | null) {
    setFile(next);
    setPreview(null);
    setSummary(null);
    setDecisions({});
    setError(null);
    if (!next) return;
    setBusy("preview");
    const body = new FormData();
    body.set("jobId", String(jobId));
    body.set("file", next);
    body.set("mapping", "{}");
    const result = await previewImportAction(body);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const suggested = suggestMapping(result.headers).suggestions;
    setHeaders(result.headers);
    setMapping(suggested);
    await runPreview(suggested, next);
  }

  async function onConfirm() {
    if (!file) return;
    setBusy("confirm");
    setError(null);
    const body = new FormData();
    body.set("jobId", String(jobId));
    body.set("file", file);
    body.set("mapping", JSON.stringify(mapping));
    body.set("decisions", JSON.stringify(decisions));
    const result = await confirmImportAction(body);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSummary(result.batch);
    setNotice(result.repeated ? "This file was already imported. No new applications were created." : "Import finished.");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">Upload applicants for {jobTitle}</h2>
        <p className="mt-1 text-sm text-zinc-600">
          CSV or XLSX, up to 1 MB and 500 rows. Preview does not create candidates or applications.
          Import starts only after you confirm. Imported people are not treated as having given consent.
        </p>
        <label className="mt-4 block text-sm font-semibold text-zinc-800">
          Spreadsheet file
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="mt-2 block w-full text-sm"
            onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <div
          className="mt-3 rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void onFile(event.dataTransfer.files[0] ?? null);
          }}
        >
          Or drop a .csv or .xlsx file here.
        </div>
      </section>

      {headers.length > 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-bold text-black">Column mapping</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Suggestions are exact header matches. Ambiguous columns stay unmapped.
            {suggestion.ambiguousHeaders.length > 0
              ? ` Review: ${suggestion.ambiguousHeaders.join(", ")}.`
              : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {BUILT_IN_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold"
                onClick={() => {
                  setMapping(template.mapping);
                  void runPreview(template.mapping);
                }}
              >
                {template.name}
              </button>
            ))}
            {savedTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold"
                onClick={() => {
                  const next = template.mapping as ImportMapping;
                  setMapping(next);
                  void runPreview(next);
                }}
              >
                {template.name}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {IMPORT_FIELDS.map((field) => (
              <label key={field} className="text-sm text-zinc-700">
                {FIELD_LABELS[field]}
                {field === "name" ? " (required)" : ""}
                <select
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                  value={mapping[field] ?? ""}
                  onChange={(event) => {
                    const next = { ...mapping, [field]: event.target.value || undefined };
                    if (!event.target.value) delete next[field];
                    setMapping(next);
                    void runPreview(next);
                  }}
                >
                  <option value="">Not mapped</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="text-sm text-zinc-700">
              Save this mapping
              <input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                className="mt-1 block rounded-lg border border-zinc-300 px-3 py-2"
              />
            </label>
            <button
              type="button"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold"
              onClick={() => {
                const body = new FormData();
                body.set("jobId", String(jobId));
                body.set("templateName", templateName);
                body.set("mapping", JSON.stringify(mapping));
                void saveImportTemplateAction(body).then((result) => {
                  setNotice(result.ok ? "Mapping saved for this company." : result.error);
                });
              }}
            >
              Save template
            </button>
          </div>
        </section>
      ) : null}

      {preview ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6" aria-live="polite">
          <h2 className="text-lg font-bold text-black">Preview</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {preview.totalRows} rows, {preview.validRows} ready, {preview.invalidRows} blocked,{" "}
            {preview.duplicateRows} duplicates in the file. Job {jobId}. Source channel is manual import.
          </p>
          {preview.warnings.map((warning) => (
            <p key={warning} className="mt-2 text-sm text-amber-800">
              {warning}
            </p>
          ))}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
                  <th className="py-2 pr-3">Row</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Result</th>
                  <th className="py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber} className="border-b border-zinc-100">
                    <td className="py-2 pr-3">{row.rowNumber}</td>
                    <td className="py-2 pr-3">{row.name || "—"}</td>
                    <td className="py-2 pr-3">{row.emailMasked || "—"}</td>
                    <td className="py-2 pr-3">{row.proposal}</td>
                    <td className="py-2">
                      {[...row.errors, ...row.warnings].join(" ")}
                      {row.proposal === "attach" && row.matchName
                        ? ` Will attach to ${row.matchName} unless you choose new.`
                        : ""}
                      {row.proposal === "review" || row.suggestions.length > 0 ? (
                        <select
                          className="mt-1 block rounded border border-zinc-300 px-2 py-1"
                          aria-label={`Match decision for row ${row.rowNumber}`}
                          value={
                            decisions[String(row.rowNumber)] == null
                              ? ""
                              : String(decisions[String(row.rowNumber)])
                          }
                          onChange={(event) => {
                            const value = event.target.value;
                            setDecisions((current) => {
                              const next = { ...current };
                              if (!value) delete next[String(row.rowNumber)];
                              else next[String(row.rowNumber)] = value === "new" ? "new" : Number(value);
                              return next;
                            });
                          }}
                        >
                          <option value="">{row.proposal === "review" ? "Choose a person" : "Keep suggestion"}</option>
                          {row.matchCandidateId ? (
                            <option value={row.matchCandidateId}>Use {row.matchName}</option>
                          ) : null}
                          {row.suggestions.map((suggestion) => (
                            <option key={suggestion.candidateId} value={suggestion.candidateId}>
                              {suggestion.name}: {suggestion.reason}
                            </option>
                          ))}
                          <option value="new">Create a new candidate</option>
                        </select>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="mt-4 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={busy !== null || !mapping.name}
            onClick={() => void onConfirm()}
          >
            {busy === "confirm" ? "Importing…" : "Confirm import"}
          </button>
        </section>
      ) : null}

      {busy === "preview" ? <p className="text-sm text-zinc-500">Reading the file…</p> : null}
      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-emerald-800">{notice}</p> : null}

      {summary ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6" aria-live="polite">
          <h2 className="text-lg font-bold text-black">Import {summary.status.toLowerCase()}</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Created {summary.createdCount}, attached {summary.attachedCount}, skipped {summary.skippedCount}, failed{" "}
            {summary.failedCount}. Batch {summary.id}.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {summary.rows.map((row) => (
              <li key={row.rowNumber}>
                Row {row.rowNumber}: {row.name} {row.emailMasked ? `(${row.emailMasked})` : ""} — {row.status}{" "}
                {row.code}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
