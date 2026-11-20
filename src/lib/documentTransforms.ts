import { createZip } from "./photoCompressor";
import { asBlob, INVALID_FILE_MESSAGE, parseXml, readUtf8, readZipMember, xmlEscape } from "./fileFormats";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

export async function readWordText(file: Blob): Promise<string> {
  const bytes = await readZipMember(file, "word/document.xml");
  if (!bytes) throw new Error(INVALID_FILE_MESSAGE);
  const doc = parseXml(readUtf8(bytes));
  const paragraphs = Array.from(doc.getElementsByTagNameNS(W, "p"));
  if (!paragraphs.length) throw new Error("This Word file has no readable paragraphs.");
  const text = paragraphs.map((paragraph) =>
    Array.from(paragraph.getElementsByTagNameNS(W, "t"))
      .map((node) => node.textContent ?? "").join("")
  ).join("\n").trim();
  if (!text) throw new Error("This Word file has no readable text.");
  return text;
}

export async function writeWord(text: string): Promise<Blob> {
  if (text.length > 150_000) throw new Error("The text is too long to convert.");
  const paragraphs = text.replace(/\r\n?/g, "\n").split("\n")
    .map((line) => '<w:p><w:r><w:t xml:space="preserve">' +
      xmlEscape(line) + '</w:t></w:r></w:p>').join("");
  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="' + W + '"><w:body>' + paragraphs +
    '<w:sectPr/></w:body></w:document>';
  return createZip([
    { name: "[Content_Types].xml", blob: asBlob('<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>') },
    { name: "_rels/.rels", blob: asBlob('<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>') },
    { name: "word/document.xml", blob: asBlob(documentXml) },
  ]);
}

/** RFC 4180 CSV parser. Rejects non-text and overlarge tables. */
export function parseCsv(text: string): string[][] {
  if (text.length > 1_000_000) throw new Error("CSV is too large to convert.");
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else if (!quoted && value === "") quoted = true;
      else if (quoted) quoted = false;
      else throw new Error(INVALID_FILE_MESSAGE);
    } else if (quoted) {
      value += ch;
    } else if (ch === ",") {
      row.push(value); value = "";
    } else if (ch === "\n" || ch === "\r") {
      row.push(value); rows.push(row); row = []; value = "";
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (rows.length > 3000) throw new Error("Too many rows to convert.");
    } else {
      value += ch;
    }
  }
  if (quoted) throw new Error(INVALID_FILE_MESSAGE);
  if (value || row.length || !rows.length) { row.push(value); rows.push(row); }
  if (rows.some((r) => r.length > 80)) throw new Error("Too many columns to convert.");
  return rows;
}

function safeSpreadsheetText(value: string): string {
  // Exported CSV might be reopened in Excel/Sheets; never create formula cells.
  const trimmed = value.trimStart();
  const negativeNumber = /^-\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(trimmed);
  return /^[=+@]/.test(trimmed) || (trimmed.startsWith("-") && !negativeNumber)
    ? "'" + value : value;
}
export function rowsToCsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => {
    const safe = safeSpreadsheetText(cell);
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  }).join(",")).join("\r\n") + "\r\n";
}

function columnName(index: number): string {
  let value = index + 1, result = "";
  while (value) { value--; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26); }
  return result;
}
function columnIndex(name: string): number {
  return name.split("").reduce((number, ch) => number * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

export async function writeExcel(rows: string[][]): Promise<Blob> {
  if (rows.length > 3000 || rows.some(row => row.length > 80)) {
    throw new Error("Spreadsheet is too large to convert.");
  }
  const cells = rows.map((row, index) =>
    '<row r="' + (index + 1) + '">' +
    row.map((value, col) =>
      '<c r="' + columnName(col) + (index + 1) + '" t="inlineStr">' +
      '<is><t xml:space="preserve">' + xmlEscape(value) + '</t></is></c>'
    ).join("") + "</row>").join("");
  const worksheet = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<worksheet xmlns="' + S + '"><sheetData>' + cells + '</sheetData></worksheet>';
  return createZip([
    { name: "[Content_Types].xml", blob: asBlob('<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>') },
    { name: "_rels/.rels", blob: asBlob('<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>') },
    { name: "xl/workbook.xml", blob: asBlob('<?xml version="1.0" encoding="UTF-8"?>' +
      '<workbook xmlns="' + S + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>') },
    { name: "xl/_rels/workbook.xml.rels", blob: asBlob('<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '</Relationships>') },
    { name: "xl/worksheets/sheet1.xml", blob: asBlob(worksheet) },
  ]);
}

export async function readExcelRows(file: Blob): Promise<string[][]> {
  const workbookBytes = await readZipMember(file, "xl/workbook.xml");
  if (!workbookBytes) throw new Error(INVALID_FILE_MESSAGE);
  const workbook = parseXml(readUtf8(workbookBytes));
  const sheet = workbook.getElementsByTagNameNS(S, "sheet")[0];
  if (!sheet) throw new Error(INVALID_FILE_MESSAGE);
  const rel = sheet.getAttribute("r:id") || sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  const relBytes = await readZipMember(file, "xl/_rels/workbook.xml.rels");
  let sheetName = "xl/worksheets/sheet1.xml";
  if (relBytes && rel) {
    const relDoc = parseXml(readUtf8(relBytes));
    const match = Array.from(relDoc.getElementsByTagName("Relationship"))
      .find((x) => x.getAttribute("Id") === rel);
    const target = match?.getAttribute("Target");
    if (target) {
      sheetName = target.startsWith("/xl/") ? target.slice(1) : "xl/" + target.replace(/^\//, "");
      if (!/^xl\/worksheets\/[a-zA-Z0-9_-]+\.xml$/.test(sheetName)) {
        throw new Error(INVALID_FILE_MESSAGE);
      }
    }
  }
  const bytes = await readZipMember(file, sheetName);
  if (!bytes) throw new Error(INVALID_FILE_MESSAGE);
  const xml = parseXml(readUtf8(bytes));
  const shared = await readZipMember(file, "xl/sharedStrings.xml");
  const sharedStrings = shared ? Array.from(parseXml(readUtf8(shared)).getElementsByTagNameNS(S, "si"))
    .map((si) => Array.from(si.getElementsByTagNameNS(S, "t")).map(t => t.textContent ?? "").join("")) : [];
  const xmlRows = Array.from(xml.getElementsByTagNameNS(S, "row"));
  if (xmlRows.length > 3000) throw new Error("Too many spreadsheet rows.");
  const result: string[][] = [];
  for (const xmlRow of xmlRows) {
    const index = Number(xmlRow.getAttribute("r") || String(result.length + 1)) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= 3000) throw new Error(INVALID_FILE_MESSAGE);
    while (result.length <= index) result.push([]);
    const row = result[index];
    for (const cell of Array.from(xmlRow.getElementsByTagNameNS(S, "c"))) {
      const ref = cell.getAttribute("r")?.match(/^([A-Z]+)\d+$/)?.[1] ?? "";
      const col = columnIndex(ref);
      if (col < 0 || col >= 80) throw new Error("Too many spreadsheet columns.");
      const kind = cell.getAttribute("t");
      const raw = cell.getElementsByTagNameNS(S, "v")[0]?.textContent ?? "";
      const inline = cell.getElementsByTagNameNS(S, "is")[0];
      const value = kind === "s" ? sharedStrings[Number(raw)] ?? "" :
        kind === "inlineStr" && inline
          ? Array.from(inline.getElementsByTagNameNS(S, "t")).map(x => x.textContent ?? "").join("")
          : kind === "b" ? (raw === "1" ? "TRUE" : "FALSE") : raw;
      row[col] = value;
    }
  }
  return result.map((row) => Array.from({ length: row.length }, (_, index) => row[index] ?? ""));
}
