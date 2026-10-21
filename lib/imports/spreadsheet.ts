import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

export const IMPORT_LIMITS = {
  maxBytes: 1_000_000,
  maxRows: 500,
  maxColumns: 40,
  maxCellChars: 2_000,
  maxZipEntries: 30,
  maxUncompressed: 2_000_000,
} as const;

export type ParsedSheet = {
  headers: string[];
  rows: string[][];
};

export type ParseResult =
  | { ok: true; sheet: ParsedSheet; sha256: string }
  | { ok: false; error: string };

const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);

export function fileSha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Prefix formula-like text so a later spreadsheet export cannot execute it. */
export function neutralizeSpreadsheetText(value: string) {
  const trimmed = value.replace(/^\uFEFF/, "");
  if (/^[=+\-@\t\r]/.test(trimmed)) return `'${trimmed}`;
  return trimmed;
}

export function parseSpreadsheet(input: {
  filename: string;
  bytes: Buffer;
}): ParseResult {
  if (input.bytes.length === 0) {
    return { ok: false, error: "The file is empty." };
  }
  if (input.bytes.length > IMPORT_LIMITS.maxBytes) {
    return {
      ok: false,
      error: `File is larger than ${IMPORT_LIMITS.maxBytes / 1_000_000} MB.`,
    };
  }

  const name = input.filename.toLowerCase();
  const isZip = input.bytes.subarray(0, 2).toString("binary") === "PK";
  const isOle = input.bytes.subarray(0, 4).equals(OLE_MAGIC);

  if (isOle || name.endsWith(".xls")) {
    return {
      ok: false,
      error: "Old Excel .xls files are not supported. Save the sheet as .xlsx or .csv.",
    };
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
    if (!isZip) {
      return { ok: false, error: "This file is not a valid .xlsx workbook." };
    }
    return parseXlsx(input.bytes);
  }

  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    if (isZip) {
      return {
        ok: false,
        error: "This file is a spreadsheet archive, not a CSV. Use the .xlsx extension.",
      };
    }
    return parseCsv(input.bytes);
  }

  if (isZip) {
    return parseXlsx(input.bytes);
  }
  return {
    ok: false,
    error: "Use a .csv or .xlsx file. The extension and the file contents did not match a supported format.",
  };
}

function finish(rows: string[][], sha256: string): ParseResult {
  if (rows.length === 0) return { ok: false, error: "The file has no header row." };
  for (const row of rows) {
    for (const cell of row) {
      if (cell.length > IMPORT_LIMITS.maxCellChars) {
        return { ok: false, error: `A cell is longer than ${IMPORT_LIMITS.maxCellChars} characters.` };
      }
    }
  }
  const width = Math.max(...rows.map((row) => row.length));
  if (width > IMPORT_LIMITS.maxColumns) {
    return { ok: false, error: `Use ${IMPORT_LIMITS.maxColumns} columns or fewer.` };
  }
  if (rows.length - 1 > IMPORT_LIMITS.maxRows) {
    return { ok: false, error: `Use ${IMPORT_LIMITS.maxRows} data rows or fewer.` };
  }
  const headers = rows[0]!.map((cell, index) => {
    const text = neutralizeSpreadsheetText(cell).trim();
    return text || `Column ${index + 1}`;
  });
  if (new Set(headers).size !== headers.length) {
    return { ok: false, error: "Column headers must be unique. Rename the duplicates and upload again." };
  }
  const data = rows.slice(1).filter((row) => row.some((cell) => cell.trim()));
  if (data.length === 0) return { ok: false, error: "The file has headers but no data rows." };
  return {
    ok: true,
    sha256,
    sheet: {
      headers,
      rows: data.map((row) =>
        headers.map((_, index) => neutralizeSpreadsheetText(row[index] ?? "").slice(0, IMPORT_LIMITS.maxCellChars)),
      ),
    },
  };
}

export function parseCsv(bytes: Buffer): ParseResult {
  const text = bytes.toString("utf8");
  if (text.includes("\0")) {
    return { ok: false, error: "This file is not plain CSV text." };
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      if (rows.length > IMPORT_LIMITS.maxRows + 1) {
        return { ok: false, error: `Use ${IMPORT_LIMITS.maxRows} data rows or fewer.` };
      }
      row = [];
      cell = "";
      continue;
    }
    cell += char;
    if (cell.length > IMPORT_LIMITS.maxCellChars + 1) {
      return { ok: false, error: `A cell is longer than ${IMPORT_LIMITS.maxCellChars} characters.` };
    }
  }
  if (quoted) return { ok: false, error: "A quoted CSV value was not closed." };
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return finish(rows, fileSha256(bytes));
}

type ZipEntry = { name: string; method: number; compressed: Buffer; uncompressedSize: number };

export function readZipEntries(bytes: Buffer): { ok: true; entries: ZipEntry[] } | { ok: false; error: string } {
  const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return { ok: false, error: "This workbook archive is incomplete." };
  const count = bytes.readUInt16LE(eocd + 10);
  const directoryOffset = bytes.readUInt32LE(eocd + 16);
  if (count > IMPORT_LIMITS.maxZipEntries) {
    return { ok: false, error: "This workbook has too many internal files." };
  }
  const entries: ZipEntry[] = [];
  let offset = directoryOffset;
  let uncompressedTotal = 0;
  for (let index = 0; index < count; index += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) {
      return { ok: false, error: "This workbook archive could not be read." };
    }
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (name.includes("..") || name.startsWith("/") || name.includes("externalLinks")) {
      return { ok: false, error: "This workbook contains an unsupported external link or path." };
    }
    uncompressedTotal += uncompressedSize;
    if (uncompressedTotal > IMPORT_LIMITS.maxUncompressed || uncompressedSize > IMPORT_LIMITS.maxUncompressed) {
      return { ok: false, error: "This workbook expands beyond the allowed size." };
    }
    if (method !== 0 && method !== 8) {
      return { ok: false, error: "This workbook uses an unsupported compression method." };
    }
    if (bytes.readUInt32LE(localOffset) !== 0x04034b50) {
      return { ok: false, error: "This workbook archive could not be read." };
    }
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    if (compressed.length !== compressedSize) {
      return { ok: false, error: "This workbook archive is truncated." };
    }
    entries.push({ name, method, compressed, uncompressedSize });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { ok: true, entries };
}

type MemberBytes =
  | { ok: true; bytes: Buffer }
  | { ok: false; reason: "too-large" | "invalid" };

/**
 * Inflate at most `maxBytes`. Node refuses to return a buffer larger than
 * maxOutputLength, so an oversized member does not come back as one allocation.
 */
function inflateLimited(compressed: Buffer, maxBytes: number): MemberBytes {
  if (maxBytes < 1) return { ok: false, reason: "too-large" };
  try {
    return { ok: true, bytes: inflateRawSync(compressed, { maxOutputLength: maxBytes }) };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "ERR_BUFFER_TOO_LARGE") return { ok: false, reason: "too-large" };
    return { ok: false, reason: "invalid" };
  }
}

function readMember(entry: ZipEntry, budget: number): MemberBytes {
  if (entry.method === 0) {
    if (entry.compressed.length > budget) return { ok: false, reason: "too-large" };
    if (entry.uncompressedSize !== entry.compressed.length) return { ok: false, reason: "invalid" };
    return { ok: true, bytes: entry.compressed };
  }
  return inflateLimited(entry.compressed, budget);
}

function parseXlsx(bytes: Buffer): ParseResult {
  const zip = readZipEntries(bytes);
  if (!zip.ok) return zip;
  const opened = new Map<string, Buffer>();
  let used = 0;
  for (const entry of zip.entries) {
    const member = readMember(entry, IMPORT_LIMITS.maxUncompressed - used);
    if (!member.ok) {
      if (member.reason === "too-large") {
        return { ok: false, error: "This workbook expands beyond the allowed size." };
      }
      if (entry.name === "xl/sharedStrings.xml") {
        return { ok: false, error: "The workbook strings could not be decompressed." };
      }
      return { ok: false, error: "The worksheet could not be decompressed." };
    }
    used += member.bytes.length;
    opened.set(entry.name, member.bytes);
  }
  const sheetXml = opened.get("xl/worksheets/sheet1.xml");
  if (!sheetXml) return { ok: false, error: "The workbook has no first worksheet." };
  const sharedXml = opened.get("xl/sharedStrings.xml");
  const strings = sharedXml ? readSharedStrings(sharedXml.toString("utf8")) : [];
  const grid = readSheetGrid(sheetXml.toString("utf8"), strings);
  if (!grid.ok) return grid;
  return finish(grid.rows, fileSha256(bytes));
}

function readSharedStrings(xml: string) {
  const values: string[] = [];
  const parts = xml.split(/<si[\s>]/).slice(1);
  for (const part of parts) {
    const texts = [...part.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1] ?? ""));
    values.push(texts.join(""));
  }
  return values;
}

type GridResult = { ok: true; rows: string[][] } | { ok: false; error: string };

function readSheetGrid(xml: string, strings: string[]): GridResult {
  const rows: string[][] = [];
  let formula = false;
  const rowParts = xml.split(/<row[\s>]/).slice(1);
  for (const part of rowParts) {
    if (rows.length > IMPORT_LIMITS.maxRows + 1) {
      return { ok: false, error: `Use ${IMPORT_LIMITS.maxRows} data rows or fewer.` };
    }
    const cells = [...part.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)];
    const row: string[] = [];
    for (const cell of cells) {
      const attrs = cell[1] ?? "";
      const body = cell[2] ?? "";
      const ref = /r="([A-Z]+)\d+"/i.exec(attrs);
      const column = ref ? columnIndex(ref[1]!) : row.length;
      if (column >= IMPORT_LIMITS.maxColumns) {
        return { ok: false, error: `Use ${IMPORT_LIMITS.maxColumns} columns or fewer.` };
      }
      if (/<f[\s>]/.test(body)) formula = true;
      while (row.length < column) row.push("");
      const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(body);
      const value = /<v[^>]*>([\s\S]*?)<\/v>/.exec(body);
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      let text = "";
      if (inline) text = decodeXml(inline[1] ?? "");
      else if (type === "s" && value) text = strings[Number(value[1])] ?? "";
      else if (value) text = decodeXml(value[1] ?? "");
      row[column] = text;
    }
    rows.push(row);
  }
  if (formula) {
    return {
      ok: false,
      error: "The workbook contains formulas. Paste values only, then upload again. HireIQ does not run spreadsheet formulas.",
    };
  }
  return { ok: true, rows };
}

function columnIndex(letters: string) {
  let index = 0;
  for (const char of letters.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

function decodeXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}
