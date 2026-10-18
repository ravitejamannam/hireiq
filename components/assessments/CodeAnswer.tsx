"use client";

import Editor from "@monaco-editor/react";
import { useState } from "react";

export function CodeAnswer({ label }: { label: string }) {
  const [value, setValue] = useState("");
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="mt-2 overflow-hidden rounded border border-zinc-300">
      <Editor
        height="200px"
        defaultLanguage="javascript"
        theme="vs"
        value={value}
        onChange={(next) => setValue(next ?? "")}
        options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
        loading={<p className="p-2 text-sm text-zinc-600">Loading editor…</p>}
      />
      <div className="flex items-center gap-3 border-t border-zinc-200 px-2 py-2">
        <button
          type="button"
          className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white"
          onClick={() => {
            if (!value.trim()) {
              setNote("Write an answer first.");
              return;
            }
            try {
              new Function(value);
              setNote("Syntax check passed. Hidden tests score this when you submit. The check does not change your result.");
            } catch (error) {
              setNote(error instanceof Error ? error.message : "This does not parse.");
            }
          }}
        >
          Run tests
        </button>
        {note ? <p className="text-xs text-zinc-600">{note}</p> : null}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
