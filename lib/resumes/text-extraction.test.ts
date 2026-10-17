import { deflateRawSync, crc32 } from "node:zlib";
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";

import {
  extractResumeText,
  RESUME_TEXT_MAX,
  sniffResumeKind,
} from "@/lib/resumes/text-extraction";

function minimalPdf(text: string | null): Buffer {
  const stream = text
    ? `BT /F1 12 Tf 72 100 Td (${text.replace(/[()\\]/g, "")}) Tj ET`
    : "";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xref = body.length;
  let table = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    table += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += table;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, "latin1");
}

function emptyPdfPages(pageCount: number): Buffer {
  const kids = Array.from({ length: pageCount }, (_, index) => `${index + 3} 0 R`).join(" ");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`,
  ];
  for (let index = 0; index < pageCount; index++) {
    const pageId = index + 3;
    const contentId = pageCount + 3 + index;
    objects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R >>\nendobj\n`,
    );
  }
  for (let index = 0; index < pageCount; index++) {
    const contentId = pageCount + 3 + index;
    objects.push(`${contentId} 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n`);
  }
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xref = body.length;
  let table = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    table += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += table;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, "latin1");
}

function scannedPdf(label: string): Buffer {
  const width = 800;
  const height = 200;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#000000";
  context.font = "bold 72px sans-serif";
  context.fillText(label, 40, 130);
  const jpeg = canvas.toBuffer("image/jpeg");
  const draw = `q ${width} 0 0 ${height} 0 0 cm /Im1 Do Q`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 200] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${draw.length} >>\nstream\n${draw}\nendstream\nendobj\n`,
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  offsets.push(body.length);
  const imageHeader = `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`;
  const imageEnd = "\nendstream\nendobj\n";
  body += imageHeader;
  const prefix = Buffer.from(body, "latin1");
  const suffixStart = Buffer.concat([prefix, jpeg, Buffer.from(imageEnd, "latin1")]);
  const xref = suffixStart.length;
  let table = `xref\n0 6\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    table += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `${table}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.concat([suffixStart, Buffer.from(trailer, "latin1")]);
}

function zipStored(files: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const compressed = deflateRawSync(file.data);
    const checksum = crc32(file.data) >>> 0;
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    const chunk = Buffer.concat([local, compressed]);
    locals.push(chunk);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += chunk.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, end]);
}

function docxWith(text: string): Buffer {
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
</w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  return zipStored([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes) },
    { name: "_rels/.rels", data: Buffer.from(rels) },
    { name: "word/document.xml", data: Buffer.from(document) },
  ]);
}

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);

const legacyDoc = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00,
]);

describe("extractResumeText", () => {
  it("reads a text PDF", async () => {
    const result = await extractResumeText(minimalPdf("Hello Resume"), {
      fileName: "resume.pdf",
      contentType: "application/pdf",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain("Hello Resume");
  });

  it("reads a DOCX", async () => {
    const result = await extractResumeText(docxWith("Hello DOCX Resume"), {
      fileName: "resume.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain("Hello DOCX Resume");
  });

  it("reads plain text", async () => {
    const result = await extractResumeText(Buffer.from("Hello plain resume\n"), {
      fileName: "resume.txt",
      contentType: "text/plain",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toBe("Hello plain resume");
  });

  it("keeps a long resume under the cap", async () => {
    const body = `${"Senior engineer at Example Co. Built hiring systems.\n".repeat(400)}`;
    expect(body.length).toBeGreaterThan(8_000);
    expect(body.length).toBeLessThan(RESUME_TEXT_MAX);
    const result = await extractResumeText(Buffer.from(body), {
      fileName: "resume.txt",
      contentType: "text/plain",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toBe(body.trim());
  });

  it("truncates text past the cap", async () => {
    const body = "a".repeat(RESUME_TEXT_MAX + 500);
    const result = await extractResumeText(Buffer.from(body), { fileName: "resume.txt" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toHaveLength(RESUME_TEXT_MAX);
  });

  it("defers a text-free PDF instead of running OCR on the upload", async () => {
    const result = await extractResumeText(minimalPdf(null), {
      fileName: "scan.pdf",
      contentType: "application/pdf",
    });
    expect(result).toEqual({ ok: false, errorCode: "OCR_DEFERRED" });
  });

  it(
    "reads a scanned PDF with inline OCR",
    async () => {
      const result = await extractResumeText(scannedPdf("Experience"), {
        fileName: "scan.pdf",
        contentType: "application/pdf",
        ocr: "inline",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.extractor).toBe("tesseract");
        expect(result.text.toLowerCase()).toContain("experience");
      }
    },
    120_000,
  );

  it("logs when a scanned PDF is longer than the OCR page limit", async () => {
    const lines: string[] = [];
    const original = console.info;
    console.info = (message?: unknown) => {
      lines.push(String(message));
    };
    try {
      await extractResumeText(emptyPdfPages(4), {
        fileName: "long-scan.pdf",
        contentType: "application/pdf",
      });
    } finally {
      console.info = original;
    }
    expect(lines.some((line) => line.includes('"ocrPagesTruncated":true') && line.includes('"pageCount":4'))).toBe(
      true,
    );
  });

  it("rejects a ZIP that is not a Word document", async () => {
    const fake = zipStored([{ name: "readme.txt", data: Buffer.from("not a resume") }]);
    expect(sniffResumeKind(fake, { fileName: "resume.docx" })).toBe("unsupported");
    const result = await extractResumeText(fake, { fileName: "resume.docx" });
    expect(result).toEqual({ ok: false, errorCode: "UNSUPPORTED_FORMAT" });
  });

  it("rejects a PNG even when the name says txt", async () => {
    const result = await extractResumeText(png, {
      fileName: "resume.txt",
      contentType: "image/png",
    });
    expect(result).toEqual({ ok: false, errorCode: "UNSUPPORTED_FORMAT" });
  });

  it("rejects legacy .doc and asks for a newer file", async () => {
    const result = await extractResumeText(legacyDoc, {
      fileName: "resume.doc",
      contentType: "application/msword",
    });
    expect(result).toEqual({ ok: false, errorCode: "LEGACY_DOC_UNSUPPORTED" });
  });
});
