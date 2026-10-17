export type TextSpan = {
  text: string;
  fontSize: number;
  contrast: number;
  offPage: boolean;
};

export function hiddenSpans(spans: TextSpan[]) {
  return spans.filter(
    (span) => span.fontSize < 6 || span.contrast < 0.2 || span.offPage,
  );
}

export function stripHiddenText(input: { visibleText: string; spans: TextSpan[] }) {
  const hidden = new Set(hiddenSpans(input.spans).map((span) => span.text));
  const extras = input.spans
    .map((span) => span.text)
    .filter((text) => text && !input.visibleText.includes(text));
  for (const extra of extras) hidden.add(extra);
  let promptText = input.visibleText;
  for (const text of hidden) {
    promptText = promptText.split(text).join("");
  }
  return { promptText, flagged: [...hidden] };
}

export function offsetsOf(source: string, quote: string) {
  const start = source.indexOf(quote);
  if (start < 0) return null;
  return { start, end: start + quote.length };
}
