/**
 * Minimal PDF table writer — no dependency.
 *
 * PDF is a text-based container: a header, a list of numbered objects, a
 * cross-reference table of their byte offsets and a trailer. Producing the
 * subset needed for "a paginated table of text" is ~200 lines and avoids
 * adding pdfkit/jsPDF (and, for jsPDF, a browser-side bundle) for a report
 * that is two columns wide.
 *
 * Deliberate limits, all fine for the users export and all worth checking
 * before reusing this elsewhere:
 *   - Only the base-14 fonts Helvetica / Helvetica-Bold, so nothing is
 *     embedded and any reader can render the file.
 *   - Text is encoded as WinAnsi (CP1252), which covers Spanish accents and
 *     the Guaraní-adjacent Latin-1 range. Anything outside it becomes "?".
 *   - Column text is truncated by an *estimated* width (see AVG_CHAR_EM);
 *     there are no real font metrics here.
 *   - No compression, images, links or outlines.
 */

export interface PdfColumn {
  header: string;
  /** Column width in points, including the gutter to the next column. */
  width: number;
}

export interface PdfTable {
  title: string;
  /** Context line under the title. Pass '' to omit it. */
  subtitle: string;
  columns: PdfColumn[];
  /** One entry per data row. Rows shorter than `columns` render blank cells. */
  rows: string[][];
  /** Rendered bottom-right on every page, e.g. "Página 2 de 7". */
  pageLabel: (page: number, pageCount: number) => string;
}

/* --------------------------------------------------------------- layout */

/** A4 at 72 dpi. */
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;

const TITLE_SIZE = 16;
const SUBTITLE_SIZE = 9;
const HEADER_SIZE = 10;
const BODY_SIZE = 10;
const FOOTER_SIZE = 8;

const ROW_HEIGHT = 18;
/** Whitespace between a column's text and the next column's left edge. */
const GUTTER = 10;
/** Lowest baseline a data row may use, leaving room for the footer. */
const BODY_FLOOR = MARGIN + 28;
const FOOTER_BASELINE = 34;

const GRAY_TEXT_MUTED = '0.45';
const GRAY_RULE_HEADER = '0.55';
const GRAY_RULE_ROW = '0.85';
const GRAY_BLACK = '0';

export function buildPdfTable(table: PdfTable): Buffer {
  const geometry = pageGeometry(table.subtitle !== '');
  const pages = paginate(table.rows, geometry.rowsPerPage);
  const contents = pages.map((rows, i) => renderPage(table, geometry, rows, i, pages.length));

  // Object numbering, fixed up front so /Kids and /Contents can reference
  // objects that have not been built yet:
  //   1 catalog · 2 page tree · 3 Helvetica · 4 Helvetica-Bold
  //   then, per page i: 5 + 2i content stream, 6 + 2i page
  const objects: Buffer[] = [
    latin1(`<< /Type /Catalog /Pages 2 0 R >>`),
    latin1(
      `<< /Type /Pages /Kids [${pages
        .map((_, i) => `${6 + i * 2} 0 R`)
        .join(' ')}] /Count ${pages.length} >>`,
    ),
    latin1(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`),
    latin1(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`),
  ];
  contents.forEach((content, i) => {
    objects.push(
      // The end-of-line before `endstream` is not part of the stream data, so
      // /Length is exactly the content byte count.
      Buffer.concat([
        latin1(`<< /Length ${content.length} >>\nstream\n`),
        content,
        latin1(`\nendstream`),
      ]),
      latin1(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      ),
    );
  });

  return assemble(objects);
}

interface Geometry {
  titleBaseline: number;
  subtitleBaseline: number;
  headerBaseline: number;
  headerRuleY: number;
  firstRowBaseline: number;
  rowsPerPage: number;
}

function pageGeometry(hasSubtitle: boolean): Geometry {
  const titleBaseline = PAGE_HEIGHT - MARGIN - TITLE_SIZE;
  const subtitleBaseline = titleBaseline - 14;
  const headerBaseline = (hasSubtitle ? subtitleBaseline : titleBaseline) - 26;
  const headerRuleY = headerBaseline - 7;
  const firstRowBaseline = headerRuleY - 14;
  return {
    titleBaseline,
    subtitleBaseline,
    headerBaseline,
    headerRuleY,
    firstRowBaseline,
    rowsPerPage: Math.floor((firstRowBaseline - BODY_FLOOR) / ROW_HEIGHT) + 1,
  };
}

/** Always at least one page, so an empty result still prints its header. */
function paginate(rows: string[][], perPage: number): string[][][] {
  if (rows.length === 0) return [[]];
  const pages: string[][][] = [];
  for (let i = 0; i < rows.length; i += perPage) pages.push(rows.slice(i, i + perPage));
  return pages;
}

function renderPage(
  table: PdfTable,
  geometry: Geometry,
  rows: string[][],
  pageIndex: number,
  pageCount: number,
): Buffer {
  const ops: Buffer[] = [];
  const right = PAGE_WIDTH - MARGIN;
  op(ops, `0.5 w\n`);

  // Title block, repeated on every page so each sheet stands on its own when
  // the export is printed and the pages get separated.
  drawText(ops, {
    x: MARGIN,
    y: geometry.titleBaseline,
    size: TITLE_SIZE,
    font: 'F2',
    value: table.title,
  });
  if (table.subtitle !== '') {
    op(ops, `${GRAY_TEXT_MUTED} g\n`);
    drawText(ops, {
      x: MARGIN,
      y: geometry.subtitleBaseline,
      size: SUBTITLE_SIZE,
      font: 'F1',
      value: table.subtitle,
    });
    op(ops, `${GRAY_BLACK} g\n`);
  }

  // Column headers + the rule under them.
  let x = MARGIN;
  for (const column of table.columns) {
    drawText(ops, {
      x,
      y: geometry.headerBaseline,
      size: HEADER_SIZE,
      font: 'F2',
      value: fitText(column.header, column.width - GUTTER, HEADER_SIZE),
    });
    x += column.width;
  }
  drawLine(ops, MARGIN, geometry.headerRuleY, right, GRAY_RULE_HEADER);

  rows.forEach((row, i) => {
    const y = geometry.firstRowBaseline - i * ROW_HEIGHT;
    let cellX = MARGIN;
    table.columns.forEach((column, col) => {
      const value = row[col] ?? '';
      if (value !== '') {
        drawText(ops, {
          x: cellX,
          y,
          size: BODY_SIZE,
          font: 'F1',
          value: fitText(value, column.width - GUTTER, BODY_SIZE),
        });
      }
      cellX += column.width;
    });
    drawLine(ops, MARGIN, y - 6, right, GRAY_RULE_ROW);
  });

  op(ops, `${GRAY_TEXT_MUTED} g\n`);
  const label = table.pageLabel(pageIndex + 1, pageCount);
  // Right-aligned by estimate — the same approximation fitText() relies on.
  drawText(ops, {
    x: right - estimateWidth(label, FOOTER_SIZE),
    y: FOOTER_BASELINE,
    size: FOOTER_SIZE,
    font: 'F1',
    value: label,
  });
  op(ops, `${GRAY_BLACK} g\n`);

  return Buffer.concat(ops);
}

/* ------------------------------------------------------------ operators */

function latin1(value: string): Buffer {
  return Buffer.from(value, 'latin1');
}

function op(ops: Buffer[], value: string): void {
  ops.push(latin1(value));
}

function drawText(
  ops: Buffer[],
  opts: { x: number; y: number; size: number; font: 'F1' | 'F2'; value: string },
): void {
  op(ops, `BT /${opts.font} ${opts.size} Tf 1 0 0 1 ${round(opts.x)} ${round(opts.y)} Tm (`);
  ops.push(pdfLiteral(opts.value));
  op(ops, `) Tj ET\n`);
}

function drawLine(ops: Buffer[], x1: number, y: number, x2: number, gray: string): void {
  op(ops, `${gray} G ${round(x1)} ${round(y)} m ${round(x2)} ${round(y)} l S\n`);
}

function round(value: number): string {
  return String(Math.round(value));
}

/* -------------------------------------------------------------- text */

const CHAR_QUESTION_MARK = 0x3f;
const CHAR_BACKSLASH = 0x5c;
const CHAR_PAREN_OPEN = 0x28;
const CHAR_PAREN_CLOSE = 0x29;

/**
 * The characters WinAnsiEncoding places in 0x80-0x9F, where CP1252 and
 * Latin-1 diverge. Only the ones plausible in a pasted name or an email —
 * curly quotes, dashes, the ellipsis fitText() appends — plus the currency
 * symbols, since a name field occasionally collects one.
 */
const WIN_ANSI_HIGH: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  'ƒ': 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  'ˆ': 0x88,
  '‰': 0x89,
  'Š': 0x8a,
  '‹': 0x8b,
  'Œ': 0x8c,
  'Ž': 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  'š': 0x9a,
  '›': 0x9b,
  'œ': 0x9c,
  'ž': 0x9e,
  'Ÿ': 0x9f,
};

/** Encodes to WinAnsi and escapes the three bytes a PDF literal string reserves. */
export function pdfLiteral(value: string): Buffer {
  const bytes: number[] = [];
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    let byte: number;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      byte = code;
    } else {
      // Unmapped: an emoji, a CJK character, a stray control code. A visible
      // "?" beats a reader-specific rendering failure over the whole string.
      byte = WIN_ANSI_HIGH[ch] ?? CHAR_QUESTION_MARK;
    }
    if (byte === CHAR_PAREN_OPEN || byte === CHAR_PAREN_CLOSE || byte === CHAR_BACKSLASH) {
      bytes.push(CHAR_BACKSLASH);
    }
    bytes.push(byte);
  }
  return Buffer.from(bytes);
}

/**
 * Helvetica is proportional and no metrics are embedded here, so widths are
 * estimated at 0.55em per character. That is slightly wider than the real
 * average for mixed-case Latin text, which biases {@link fitText} toward
 * cutting a hair early rather than letting a long value collide with the next
 * column — the failure mode that actually looks broken.
 */
const AVG_CHAR_EM = 0.55;

export function estimateWidth(value: string, size: number): number {
  return value.length * size * AVG_CHAR_EM;
}

export function fitText(value: string, maxWidth: number, size: number): string {
  const maxChars = Math.max(1, Math.floor(maxWidth / (size * AVG_CHAR_EM)));
  if (value.length <= maxChars) return value;
  // With room for a single character there is none for both a letter and the
  // ellipsis, and the letter is the more useful of the two.
  if (maxChars === 1) return value.slice(0, 1);
  return `${value.slice(0, maxChars - 1)}…`;
}

/* ---------------------------------------------------------- file layout */

function assemble(objects: Buffer[]): Buffer {
  const chunks: Buffer[] = [];
  let size = 0;
  const push = (chunk: Buffer): void => {
    chunks.push(chunk);
    size += chunk.length;
  };

  push(latin1(`%PDF-1.4\n`));
  // A comment of bytes >127 marks the file as binary, so tools that transfer
  // it do not "helpfully" translate line endings.
  push(Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(size);
    push(latin1(`${i + 1} 0 obj\n`));
    push(object);
    push(latin1(`\nendobj\n`));
  });

  // Cross-reference table. Every entry is exactly 20 bytes — readers index
  // into it arithmetically, so the padding and the trailing space matter.
  const xrefOffset = size;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  push(latin1(xref));
  push(
    latin1(
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    ),
  );

  return Buffer.concat(chunks);
}
