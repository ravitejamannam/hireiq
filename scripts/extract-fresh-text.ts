/** pdf-parse only. No field model. Text for labelling the fresh held-out set. */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const setName = process.argv[2] ?? "fresh-heldout";
const pdfDir = path.join(process.cwd(), ".data/resumes", setName, "pdf");
const txtDir = path.join(process.cwd(), ".data/resumes", setName, "txt");
mkdirSync(txtDir, { recursive: true });

async function main() {
const { PDFParse } = (await import("pdf-parse")) as unknown as {
  PDFParse: new (options: { data: Uint8Array }) => {
    getText(): Promise<{ text: string }>;
    destroy(): Promise<void>;
  };
};

for (const name of readdirSync(pdfDir).filter((file) => file.endsWith(".pdf"))) {
  const bytes = readFileSync(path.join(pdfDir, name));
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  const result = await parser.getText();
  await parser.destroy();
  writeFileSync(path.join(txtDir, name.replace(/\.pdf$/, ".txt")), result.text ?? "");
  console.log(name, (result.text ?? "").length);
}
}

main();
