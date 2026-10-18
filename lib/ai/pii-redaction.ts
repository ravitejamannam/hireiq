const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/g;

export function redactEvaluationPii(input: {
  text: string;
  name?: string | null;
}) {
  let text = input.text.replace(EMAIL, "[email]").replace(PHONE, "[phone]");
  const name = input.name?.trim();
  if (name && name.length >= 2) {
    const pattern = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    text = text.replace(pattern, "[name]");
  }
  return text;
}
