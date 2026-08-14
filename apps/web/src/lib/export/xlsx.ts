/**
 * Minimal `.xlsx` (OOXML SpreadsheetML) writer — no dependency.
 *
 * An `.xlsx` file is a ZIP container holding a handful of small XML parts.
 * Emitting them by hand is ~150 lines and keeps the export off the dependency
 * graph; the alternative (exceljs / SheetJS) is a several-hundred-KB library
 * for what this app actually exports: one sheet of plain text cells.
 *
 * Scope is deliberately that narrow — **text cells only**. No numbers, dates,
 * formulas, merged cells or multiple sheets. Every value is written as an
 * inline string (`t="inlineStr"`), which is why there is no `sharedStrings`
 * part. If an export ever needs typed cells, reach for a real library instead
 * of growing this file.
 *
 * Entries are stored uncompressed (ZIP method 0). That is valid per the spec
 * and accepted by Excel, LibreOffice and Google Sheets; it costs a few hundred
 * KB on a large export and saves pulling in a deflate step.
 */

export interface XlsxColumn {
  header: string;
  /** Width in Excel's "character" unit (roughly 7px each at 11pt Calibri). */
  width: number;
}

export interface XlsxTable {
  sheetName: string;
  columns: XlsxColumn[];
  /** One entry per data row. Rows shorter than `columns` are padded blank. */
  rows: string[][];
}

export function buildXlsx(table: XlsxTable): Buffer {
  return zip([
    { name: '[Content_Types].xml', data: utf8(CONTENT_TYPES_XML) },
    { name: '_rels/.rels', data: utf8(ROOT_RELS_XML) },
    { name: 'xl/workbook.xml', data: utf8(workbookXml(table.sheetName)) },
    { name: 'xl/_rels/workbook.xml.rels', data: utf8(WORKBOOK_RELS_XML) },
    { name: 'xl/styles.xml', data: utf8(STYLES_XML) },
    { name: 'xl/worksheets/sheet1.xml', data: utf8(sheetXml(table)) },
  ]);
}

/* ------------------------------------------------------------------ XML */

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

const TAB = 9;
const LINE_FEED = 10;
const CARRIAGE_RETURN = 13;
const FIRST_PRINTABLE = 32;

/**
 * XML 1.0 forbids almost every C0 control character outright (tab, newline and
 * carriage return are the only ones allowed), so a stray one arriving from a
 * Firestore string would make Excel declare the whole workbook corrupt. Drop
 * them rather than emit a file that cannot be opened.
 */
function stripControlChars(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= FIRST_PRINTABLE || code === TAB || code === LINE_FEED || code === CARRIAGE_RETURN) {
      out += value[i];
    }
  }
  return out;
}

export function escapeXml(value: string): string {
  return stripControlChars(value).replace(/[&<>"']/g, (c) => XML_ESCAPES[c]!);
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function columnName(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const rest = (n - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/**
 * Excel rejects a workbook whose sheet name is empty, longer than 31
 * characters or contains any of `: \ / ? * [ ]` — it opens the file in
 * "repair" mode instead. Callers pass a constant today, but guaranteeing it
 * here costs one line.
 */
export function safeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, ' ').trim();
  return cleaned.length === 0 ? 'Hoja1' : cleaned.slice(0, 31);
}

function xlsxRow(rowNumber: number, values: string[], styleId: number): string {
  const cells = values
    .map((value, i) => {
      const ref = `${columnName(i)}${rowNumber}`;
      // A value-less cell is blank to Excel; an empty `<t/>` would instead be a
      // zero-length string, which behaves differently in filters and COUNTA().
      // Blank is what a missing name should look like.
      if (value === '') return `<c r="${ref}" s="${styleId}"/>`;
      return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
        value,
      )}</t></is></c>`;
    })
    .join('');
  return `<row r="${rowNumber}">${cells}</row>`;
}

function sheetXml(table: XlsxTable): string {
  const width = table.columns.length;
  // `<cols>` must not be emitted empty — the schema requires at least one
  // `<col>` child.
  const cols =
    width === 0
      ? ''
      : `<cols>${table.columns
          .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`)
          .join('')}</cols>`;
  const header = xlsxRow(
    1,
    table.columns.map((c) => c.header),
    STYLE_HEADER,
  );
  const body = table.rows
    .map((row, i) =>
      xlsxRow(
        i + 2,
        Array.from({ length: width }, (_, col) => row[col] ?? ''),
        STYLE_BODY,
      ),
    )
    .join('');
  // Element order inside `<worksheet>` is fixed by the schema:
  // sheetViews -> cols -> sheetData. The frozen pane keeps the header row
  // visible while scrolling a few thousand users.
  return `${XML_DECL}<worksheet xmlns="${NS_MAIN}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${header}${body}</sheetData></worksheet>`;
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Indexes into `cellXfs` in {@link STYLES_XML}. */
const STYLE_BODY = 0;
const STYLE_HEADER = 1;

const CONTENT_TYPES_XML = `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const ROOT_RELS_XML = `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELS_XML = `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`;

// `bookViews` is what the sheet's `workbookViewId="0"` refers to. Excel is
// lenient about a missing one, but writing it costs nothing and keeps the
// frozen header row from being the reason a workbook opens in repair mode.
// Schema order inside `<workbook>` puts bookViews before sheets.
function workbookXml(sheetName: string): string {
  return `${XML_DECL}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="20000" windowHeight="12000"/></bookViews><sheets><sheet name="${escapeXml(
    safeSheetName(sheetName),
  )}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

// Two fonts (regular + bold) and two matching cellXfs, so the header row can be
// bold. `fills` must declare at least the two conventional entries (none +
// gray125) — Excel repairs the file when the second one is missing, even
// though nothing references it.
const STYLES_XML = `${XML_DECL}<styleSheet xmlns="${NS_MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;

/* ------------------------------------------------------------------ ZIP */

interface ZipEntry {
  name: string;
  data: Buffer;
}

function utf8(value: string): Buffer {
  return Buffer.from(value, 'utf8');
}

// 1980-01-01 00:00 in DOS date/time — the ZIP epoch. Fixed rather than "now"
// so the same rows always produce a byte-identical file, which keeps the
// output diffable and the tests deterministic.
const DOS_DATE = 0x0021;
const DOS_TIME = 0x0000;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
/** General-purpose bit 11: file names are UTF-8. */
const FLAG_UTF8 = 0x0800;
const METHOD_STORE = 0;
const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const EOCD_SIZE = 22;

let crcTable: Uint32Array | null = null;

export function crc32(data: Buffer): number {
  if (!crcTable) {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    crcTable = table;
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = utf8(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = Buffer.alloc(LOCAL_HEADER_SIZE);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(METHOD_STORE, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18); // compressed == uncompressed when stored
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // no extra field
    locals.push(local, name, entry.data);

    // Every field left unwritten below (extra/comment lengths, disk number,
    // attributes) must be zero, which Buffer.alloc already guarantees.
    const dir = Buffer.alloc(CENTRAL_HEADER_SIZE);
    dir.writeUInt32LE(SIG_CENTRAL, 0);
    dir.writeUInt16LE(20, 4); // version made by
    dir.writeUInt16LE(20, 6); // version needed
    dir.writeUInt16LE(FLAG_UTF8, 8);
    dir.writeUInt16LE(METHOD_STORE, 10);
    dir.writeUInt16LE(DOS_TIME, 12);
    dir.writeUInt16LE(DOS_DATE, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(size, 20);
    dir.writeUInt32LE(size, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42); // offset of this entry's local header
    central.push(dir, name);

    offset += LOCAL_HEADER_SIZE + name.length + size;
  }

  const centralBytes = Buffer.concat(central);
  const eocd = Buffer.alloc(EOCD_SIZE);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16); // the central directory starts where locals end

  return Buffer.concat([...locals, centralBytes, eocd]);
}
