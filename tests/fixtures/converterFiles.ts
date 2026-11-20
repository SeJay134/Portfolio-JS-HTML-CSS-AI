/**
 * Deterministic actual-byte fixtures for browser conversion tests.
 * Office documents are generated as DEFLATE OOXML ZIPs, independently of app writers.
 */
import { deflateRawSync } from "node:zlib";
import { Buffer } from "node:buffer";

function checksum(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipFixture(members: Record<string, string>, corrupt = false): Buffer {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const [filename, text] of Object.entries(members)) {
    const name = Buffer.from(filename);
    const original = Buffer.from(text);
    const compressed = deflateRawSync(original);
    const crc = checksum(original);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(original.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(corrupt ? (crc ^ 0xffff) >>> 0 : crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(original.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(members).length, 8);
  end.writeUInt16LE(Object.keys(members).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

export const sampleDocx = () => zipFixture({
  "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  "word/document.xml": '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello Word fixture</w:t></w:r></w:p><w:p><w:r><w:t>Привет!</w:t></w:r></w:p></w:body></w:document>',
});
export const sampleXlsx = () => zipFixture({
  "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
  "xl/workbook.xml": '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
  "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  "xl/sharedStrings.xml": '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Name</t></si><si><t>Value</t></si><si><t>Apple</t></si><si><t>=HYPERLINK("https://bad.example")</t></si></sst>',
  "xl/worksheets/sheet1.xml": '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>23</v></c></row><row r="3"><c r="A3" t="s"><v>3</v></c></row></sheetData></worksheet>',
});
export const corruptedDocx = () => zipFixture({
  "word/document.xml": '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:t>broken</w:t></w:p></w:body></w:document>',
}, true);

export function samplePdf(): Buffer {
  const strings: string[] = [];
  const offsets: number[] = [0];
  let length = 0;
  const append = (value: string) => { strings.push(value); length += Buffer.byteLength(value); };
  const obj = (number: number, body: string) => {
    offsets[number] = length; append(number + " 0 obj\n" + body + "\nendobj\n");
  };
  append("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>");
  const stream = "BT /F1 12 Tf 40 700 Td (Hello PDF fixture) Tj ET";
  obj(4, "<< /Length " + Buffer.byteLength(stream) + " >>\nstream\n" + stream + "\nendstream");
  obj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const xref = length;
  append("xref\n0 6\n0000000000 65535 f \n");
  for (let n = 1; n <= 5; n++) append(String(offsets[n]).padStart(10, "0") + " 00000 n \n");
  append("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
  return Buffer.from(strings.join(""));
}
export const sampleCsv = () => Buffer.from('Name,Amount\r\n"Apple, green",25\r\n"Quote ""text""",10\r\n');
export const sampleTxt = () => Buffer.from("Hello test document.\nПривет, мир!\n");
export const fakePng = () => Buffer.from("not an image");
export const badPdf = () => Buffer.from("%PDF-1.5 garbage without EOF");
