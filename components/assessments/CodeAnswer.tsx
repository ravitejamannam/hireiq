"use client";

import Editor, { loader } from "@monaco-editor/react";
import { useEffect, useState } from "react";

/** The CSP allows only same-origin scripts, so Monaco must come from the bundle, not its default CDN. */
let monacoReady: Promise<void> | null = null;
function loadLocalMonaco() {
  monacoReady ??= import("monaco-editor").then((monaco) => {
    loader.config({ monaco });
  });
  return monacoReady;
}

export function CodeAnswer({
  label,
  value: controlled,
  onChange,
  language = "javascript",
}: {
  label: string;
  value?: string;
  onChange?: (value: string) => void;
  language?: string;
}) {
  const [local, setLocal] = useState("");
  const value = controlled ?? local;
  const setValue = (next: string) => {
    if (onChange) onChange(next);
    else setLocal(next);
  };
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void loadLocalMonaco().then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  // Seeded once: feeding every keystroke back through `value` lets a lagging re-render overwrite newer typing.
  const loading = <p className="p-2 text-sm text-zinc-600">Loading editor…</p>;
  return (
    <div className="mt-2 overflow-hidden rounded border border-zinc-300">
      {ready ? (
        <Editor
          height="200px"
          language={language}
          theme="vs"
          defaultValue={value}
          onChange={(next) => setValue(next ?? "")}
          options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
          loading={loading}
        />
      ) : (
        loading
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}
