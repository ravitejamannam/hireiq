import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { buildImportPreview } from "@/lib/imports/import-preview";
import { suggestMapping } from "@/lib/imports/import-mapping";
import {
  IMPORT_LIMITS,
  neutralizeSpreadsheetText,
  parseSpreadsheet,
  readZipEntries,
} from "@/lib/imports/spreadsheet";

function zip(files: Array<{ name: string; data: Buffer; uncompressedSize?: number }>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const compressed = deflateRawSync(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localBuf = Buffer.concat([local, name, compressed]);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.uncompressedSize ?? file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    locals.push(localBuf);
    offset += localBuf.length;
  }
  const directory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, eocd]);
}

const sheet = `<?xml version="1.0"?>
<worksheet><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Full name</t></is></c><c r="B1" t="inlineStr"><is><t>Email</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>Ada Lovelace</t></is></c><c r="B2" t="inlineStr"><is><t>ada@example.com</t></is></c></row>
</sheetData></worksheet>`;

describe("spreadsheet import parsing", () => {
  it("parses CSV rows and neutralizes formula text", () => {
    const parsed = parseSpreadsheet({
      filename: "people.csv",
      bytes: Buffer.from('Full name,Email\nAda Lovelace,ada@example.com\n"=cmd|calc",bad@example.com\n'),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.sheet.rows[1]?.[0]).toBe("'=cmd|calc");
    expect(neutralizeSpreadsheetText("=1+1")).toBe("'=1+1");
  });

  it("rejects an unclosed quote, a non-csv zip, and an oversized file", () => {
    expect(parseSpreadsheet({ filename: "people.csv", bytes: Buffer.from('Name,Email\n"Ada,ada@example.com\n') }).ok).toBe(false);
    expect(parseSpreadsheet({ filename: "people.csv", bytes: Buffer.from("PK\x03\x04fake") }).ok).toBe(false);
    expect(
      parseSpreadsheet({
        filename: "people.csv",
        bytes: Buffer.alloc(IMPORT_LIMITS.maxBytes + 1, 65),
      }).ok,
    ).toBe(false);
  });

  it("parses a minimal xlsx and rejects formulas and oversized archives", () => {
    const workbook = zip([
      { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheet) },
    ]);
    const parsed = parseSpreadsheet({ filename: "people.xlsx", bytes: workbook });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.sheet.rows[0]).toEqual(["Ada Lovelace", "ada@example.com"]);

    const formula = sheet.replace(
      "<c r=\"B2\" t=\"inlineStr\"><is><t>ada@example.com</t></is></c>",
      "<c r=\"B2\"><f>1+1</f><v>2</v></c>",
    );
    const rejected = parseSpreadsheet({
      filename: "formula.xlsx",
      bytes: zip([{ name: "xl/worksheets/sheet1.xml", data: Buffer.from(formula) }]),
    });
    expect(rejected.ok).toBe(false);

    expect(
      parseSpreadsheet({ filename: "broken.xlsx", bytes: Buffer.from("PK\x03\x04not-a-zip") }).ok,
    ).toBe(false);
    expect(
      parseSpreadsheet({
        filename: "link.xlsx",
        bytes: zip([{ name: "xl/externalLinks/externalLink1.xml", data: Buffer.from("<x/>") }]),
      }).ok,
    ).toBe(false);
    const injected = parseSpreadsheet({
      filename: "formula.csv",
      bytes: Buffer.from("Full name,Email\n+cmd|' /C calc'!A0,ada@example.com\n@SUM(1),bee@example.com\n"),
    });
    expect(injected.ok).toBe(true);
    if (injected.ok) {
      expect(injected.sheet.rows[0]?.[0].startsWith("'+")).toBe(true);
      expect(injected.sheet.rows[1]?.[0].startsWith("'@")).toBe(true);
    }

    const bomb = readZipEntries(
      zip([{ name: "xl/worksheets/sheet1.xml", data: Buffer.from("x"), uncompressedSize: IMPORT_LIMITS.maxUncompressed + 1 }]),
    );
    expect(bomb.ok).toBe(false);
  });
});

function csvRow(columns: number, cell: string) {
  return Array.from({ length: columns }, () => cell).join(",");
}

function columnLetters(index: number) {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function sheetXml(columns: number, dataRows: number, cellText: string) {
  const header = Array.from({ length: columns }, (_, index) => {
    const ref = `${columnLetters(index)}1`;
    return `<c r="${ref}" t="inlineStr"><is><t>H${index + 1}</t></is></c>`;
  }).join("");
  const body = Array.from({ length: dataRows }, (_, rowIndex) => {
    const cells = Array.from({ length: columns }, (_, index) => {
      const ref = `${columnLetters(index)}${rowIndex + 2}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${cellText}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 2}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0"?><worksheet><sheetData><row r="1">${header}</row>${body}</sheetData></worksheet>`;
}

describe("spreadsheet boundary limits", () => {
  it("accepts 500 data rows and counts a blank line toward the 501st", () => {
    const header = "Name,Email";
    const data = Array.from({ length: 500 }, (_, index) => `Person ${index},p${index}@example.com`);
    const exact = parseSpreadsheet({
      filename: "rows.csv",
      bytes: Buffer.from([header, ...data].join("\n")),
    });
    expect(exact.ok).toBe(true);
    if (!exact.ok) return;
    expect(exact.sheet.headers).toEqual(["Name", "Email"]);
    expect(exact.sheet.rows).toHaveLength(500);

    const tooMany = parseSpreadsheet({
      filename: "rows.csv",
      bytes: Buffer.from([header, ...data, "Extra,extra@example.com"].join("\n")),
    });
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.error).toMatch(/500 data rows/);

    const blanks = Array.from({ length: 500 }, () => ",");
    const counted = parseSpreadsheet({
      filename: "rows.csv",
      bytes: Buffer.from([header, ...blanks, "Ada,ada@example.com"].join("\n")),
    });
    expect(counted.ok).toBe(false);
    if (!counted.ok) expect(counted.error).toMatch(/500 data rows/);

    const dropped = parseSpreadsheet({
      filename: "rows.csv",
      bytes: Buffer.from([header, ",", "Ada,ada@example.com"].join("\n")),
    });
    expect(dropped.ok).toBe(true);
    if (dropped.ok) expect(dropped.sheet.rows).toEqual([["Ada", "ada@example.com"]]);
  });

  it("accepts 40 columns and rejects a 41st column of otherwise valid csv and xlsx", () => {
    const header = Array.from({ length: 40 }, (_, index) => `H${index + 1}`).join(",");
    const values = csvRow(40, "v");
    const accepted = parseSpreadsheet({
      filename: "cols.csv",
      bytes: Buffer.from(`${header}\n${values}\n`),
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.sheet.headers).toHaveLength(40);

    const wide = parseSpreadsheet({
      filename: "cols.csv",
      bytes: Buffer.from(`${csvRow(41, "H")}\n${csvRow(41, "v")}\n`),
    });
    expect(wide.ok).toBe(false);
    if (!wide.ok) expect(wide.error).toMatch(/40 columns/);

    const workbook = parseSpreadsheet({
      filename: "cols.xlsx",
      bytes: zip([{ name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheetXml(40, 1, "v")) }]),
    });
    expect(workbook.ok).toBe(true);
    if (workbook.ok) expect(workbook.sheet.headers).toHaveLength(40);

    const wider = parseSpreadsheet({
      filename: "cols.xlsx",
      bytes: zip([{ name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheetXml(41, 1, "v")) }]),
    });
    expect(wider.ok).toBe(false);
    if (!wider.ok) expect(wider.error).toMatch(/40 columns/);
  });

  it("keeps a 2000 character cell and rejects 2001 in both a header and a data cell", () => {
    const okCell = "a".repeat(IMPORT_LIMITS.maxCellChars);
    const accepted = parseSpreadsheet({
      filename: "cell.csv",
      bytes: Buffer.from(`Name,${okCell}\nAda,${okCell}\n`),
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.sheet.headers[1]).toHaveLength(2000);
      expect(accepted.sheet.rows[0]?.[1]).toHaveLength(2000);
    }

    const long = "a".repeat(IMPORT_LIMITS.maxCellChars + 1);
    const header = parseSpreadsheet({
      filename: "cell.csv",
      bytes: Buffer.from(`Name,${long}\nAda,ok@example.com\n`),
    });
    const data = parseSpreadsheet({
      filename: "cell.csv",
      bytes: Buffer.from(`Name,Email\nAda,${long}\n`),
    });
    expect(header.ok).toBe(false);
    expect(data.ok).toBe(false);
    if (!header.ok) expect(header.error).toMatch(/2000 characters/);
    if (!data.ok) expect(data.error).toMatch(/2000 characters/);

    const xlsx = parseSpreadsheet({
      filename: "cell.xlsx",
      bytes: zip([{ name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheetXml(1, 1, long)) }]),
    });
    expect(xlsx.ok).toBe(false);
    if (!xlsx.ok) expect(xlsx.error).toMatch(/2000 characters/);
  });

  it("measures the 1000000 byte limit from the buffer length", () => {
    const line = `A,${"a".repeat(1997)}`;
    expect(Buffer.byteLength(`${line}\n`)).toBe(2000);
    const exact = Buffer.from(`${Array.from({ length: 500 }, () => line).join("\n")}\n`);
    expect(exact.length).toBe(IMPORT_LIMITS.maxBytes);
    const accepted = parseSpreadsheet({ filename: "exact.csv", bytes: exact });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.sheet.rows.length).toBe(499);

    const over = Buffer.concat([exact, Buffer.from("x")]);
    expect(over.length).toBe(IMPORT_LIMITS.maxBytes + 1);
    const rejected = parseSpreadsheet({ filename: "exact.csv", bytes: over });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error).toMatch(/1 MB/);
  });

  it("rejects a truncated workbook, an archive that declares an oversized expansion, a formula, and an external link", () => {
    const valid = zip([{ name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheet) }]);
    const central = valid.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    const truncated = Buffer.from(valid);
    truncated.writeUInt32LE(0xffffffff, central + 20);
    const broken = parseSpreadsheet({ filename: "cut.xlsx", bytes: truncated });
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.error).toMatch(/truncated/);

    const atLimit = readZipEntries(zip([{
      name: "xl/worksheets/sheet1.xml",
      data: Buffer.from(sheet),
      uncompressedSize: IMPORT_LIMITS.maxUncompressed,
    }]));
    expect(atLimit.ok).toBe(true);
    const bomb = readZipEntries(zip([{
      name: "xl/worksheets/sheet1.xml",
      data: Buffer.from(sheet),
      uncompressedSize: IMPORT_LIMITS.maxUncompressed + 1,
    }]));
    expect(bomb.ok).toBe(false);
    if (!bomb.ok) expect(bomb.error).toMatch(/expands beyond/);

    const formulaSheet = sheet.replace(
      "<c r=\"B2\" t=\"inlineStr\"><is><t>ada@example.com</t></is></c>",
      "<c r=\"B2\"><f>1+1</f><v>2</v></c>",
    );
    const formula = parseSpreadsheet({
      filename: "formula.xlsx",
      bytes: zip([{ name: "xl/worksheets/sheet1.xml", data: Buffer.from(formulaSheet) }]),
    });
    expect(formula.ok).toBe(false);
    if (!formula.ok) expect(formula.error).toMatch(/formulas/);

    const link = parseSpreadsheet({
      filename: "link.xlsx",
      bytes: zip([{ name: "xl/externalLinks/externalLink1.xml", data: Buffer.from("<externalLink/>") }]),
    });
    expect(link.ok).toBe(false);
    if (!link.ok) expect(link.error).toMatch(/external link/);
  });

  it("rejects an xlsx that inflates past the cap even when the zip header understates the size", () => {
    const expanded = Buffer.alloc(IMPORT_LIMITS.maxUncompressed + 1, 0x41);
    const workbook = zip([{
      name: "xl/worksheets/sheet1.xml",
      data: expanded,
      uncompressedSize: 64,
    }]);
    expect(expanded.length).toBeGreaterThan(IMPORT_LIMITS.maxUncompressed);
    expect(workbook.length).toBeLessThan(IMPORT_LIMITS.maxBytes);
    const listed = readZipEntries(workbook);
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.entries[0]?.uncompressedSize).toBe(64);
    const parsed = parseSpreadsheet({ filename: "expanded.xlsx", bytes: workbook });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/expands beyond the allowed size/);
  });

  it("rejects members that are each under the cap but together exceed the archive limit", () => {
    const half = Buffer.alloc(Math.floor(IMPORT_LIMITS.maxUncompressed / 2) + 1, 0x42);
    const workbook = zip([
      { name: "xl/worksheets/sheet1.xml", data: half, uncompressedSize: 32 },
      { name: "xl/sharedStrings.xml", data: half, uncompressedSize: 32 },
    ]);
    expect(workbook.length).toBeLessThan(IMPORT_LIMITS.maxBytes);
    const listed = readZipEntries(workbook);
    expect(listed.ok).toBe(true);
    const parsed = parseSpreadsheet({ filename: "combined.xlsx", bytes: workbook });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/expands beyond the allowed size/);
  });

  it("parses a workbook that uses both a worksheet and shared strings", () => {
    const sheetXml = `<?xml version="1.0"?><worksheet><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Full name</t></is></c><c r="B1" t="s"><v>0</v></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>Ada Lovelace</t></is></c><c r="B2" t="s"><v>1</v></c></row>
</sheetData></worksheet>`;
    const shared = `<?xml version="1.0"?><sst><si><t>Email</t></si><si><t>ada@example.com</t></si></sst>`;
    const parsed = parseSpreadsheet({
      filename: "shared.xlsx",
      bytes: zip([
        { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheetXml) },
        { name: "xl/sharedStrings.xml", data: Buffer.from(shared) },
      ]),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.sheet.headers).toEqual(["Full name", "Email"]);
    expect(parsed.sheet.rows[0]).toEqual(["Ada Lovelace", "ada@example.com"]);
  });

  it("escapes csv cells that start with formula characters and leaves ordinary text unchanged", () => {
    const parsed = parseSpreadsheet({
      filename: "formula.csv",
      bytes: Buffer.from("Name,Note\n=1+1,ok\n+cmd,ok\n-10,ok\n@SUM(1),ok\nAda Lovelace,10-20 years\n"),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.sheet.rows.map((row) => row[0])).toEqual([
      "'=1+1",
      "'+cmd",
      "'-10",
      "'@SUM(1)",
      "Ada Lovelace",
    ]);
    expect(parsed.sheet.rows[4]?.[1]).toBe("10-20 years");
  });
});

describe("column mapping and preview", () => {
  it("suggests exact headers and leaves ambiguous headers unmapped", () => {
    const result = suggestMapping(["Full name", "Email", "Company"]);
    expect(result.suggestions.name).toBe("Full name");
    expect(result.suggestions.email).toBe("Email");
    expect(result.suggestions.currentEmployer).toBeUndefined();
  });

  it("blocks duplicate emails and does not auto-attach a name suggestion", () => {
    const preview = buildImportPreview({
      companyId: 1,
      jobId: 9,
      mapping: { name: "Full name", email: "Email", currentEmployer: "Employer" },
      sheet: {
        headers: ["Full name", "Email", "Employer"],
        rows: [
          ["Ada Lovelace", "ada@example.com", "Analytical"],
          ["Ada Lovelace", "ada@example.com", "Analytical"],
          ["Grace Hopper", "grace@example.com", "Navy"],
        ],
      },
      known: [
        {
          candidateId: 4,
          companyId: 1,
          name: "Grace Hopper",
          email: null,
          phoneDigits: null,
          currentEmployer: "Navy",
          erased: false,
        },
        {
          candidateId: 8,
          companyId: 2,
          name: "Ada Lovelace",
          email: "ada@example.com",
          phoneDigits: null,
          currentEmployer: "Analytical",
          erased: false,
        },
      ],
    });
    expect(preview.duplicateRows).toBe(1);
    expect(preview.rows[0]?.proposal).toBe("create");
    expect(preview.rows[1]?.proposal).toBe("skip");
    expect(preview.rows[2]?.proposal).toBe("create");
    expect(preview.rows[2]?.suggestions[0]?.candidateId).toBe(4);
    expect(preview.rows[0]?.matchCandidateId).toBeNull();
  });

  it("attaches one email match inside the company and asks when several match", () => {
    const preview = buildImportPreview({
      companyId: 1,
      jobId: 9,
      mapping: { name: "Full name", email: "Email" },
      sheet: {
        headers: ["Full name", "Email"],
        rows: [
          ["Ada Lovelace", "ada@example.com"],
          ["Shared", "shared@example.com"],
        ],
      },
      known: [
        {
          candidateId: 4,
          companyId: 1,
          name: "Ada Lovelace",
          email: "ada@example.com",
          phoneDigits: null,
          currentEmployer: null,
          erased: false,
        },
        {
          candidateId: 5,
          companyId: 1,
          name: "One",
          email: "shared@example.com",
          phoneDigits: null,
          currentEmployer: null,
          erased: false,
        },
        {
          candidateId: 6,
          companyId: 1,
          name: "Two",
          email: "shared@example.com",
          phoneDigits: null,
          currentEmployer: null,
          erased: false,
        },
      ],
    });
    expect(preview.rows[0]).toMatchObject({ proposal: "attach", matchCandidateId: 4 });
    expect(preview.rows[1]?.proposal).toBe("review");
  });
});
