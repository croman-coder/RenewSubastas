import { describe, it, expect } from 'vitest';
import { buildPdfTable, estimateWidth, fitText, pdfLiteral, type PdfTable } from './pdf';

const TABLE: PdfTable = {
  title: 'Usuarios',
  subtitle: '2 usuarios  ·  Tipo: todos',
  columns: [
    { header: 'Nombre', width: 200 },
    { header: 'Email', width: 299 },
  ],
  rows: [
    ['Ana Núñez', 'ana@example.com'],
    ['Ben Ortiz', 'ben@example.com'],
  ],
  pageLabel: (page, pageCount) => `Página ${page} de ${pageCount}`,
};

function rows(count: number): string[][] {
  return Array.from({ length: count }, (_, i) => [`Usuario ${i}`, `user${i}@example.com`]);
}

/**
 * Decoded as latin1 so one byte is one character: the cross-reference table
 * stores byte offsets, and the whole point of checking it is that those
 * offsets land exactly on their objects.
 */
function readPdf(buf: Buffer): { text: string; objectCount: number } {
  const text = buf.toString('latin1');
  expect(text.startsWith('%PDF-1.4\n')).toBe(true);
  expect(text.endsWith('%%EOF\n')).toBe(true);

  const tail = /startxref\n(\d+)\n%%EOF\n$/.exec(text);
  expect(tail).not.toBeNull();
  const xrefOffset = Number(tail![1]);

  const header = /xref\n0 (\d+)\n/.exec(text.slice(xrefOffset));
  expect(header).not.toBeNull();
  expect(header!.index).toBe(0); // startxref points at the table itself
  const size = Number(header![1]);

  // Entry 0 is the free-list head; objects start at 1. Every entry is exactly
  // 20 bytes, which is what lets a reader index into the table arithmetically.
  const firstEntry = xrefOffset + header![0].length + 20;
  for (let i = 1; i < size; i++) {
    const entry = text.slice(firstEntry + (i - 1) * 20, firstEntry + i * 20);
    expect(entry).toMatch(/^\d{10} 00000 n \n$/);
    const offset = Number(entry.slice(0, 10));
    expect(text.slice(offset, offset + `${i} 0 obj`.length)).toBe(`${i} 0 obj`);
  }
  return { text, objectCount: size - 1 };
}

describe('pdfLiteral', () => {
  it('encodes Latin-1 accents as single WinAnsi bytes', () => {
    expect([...pdfLiteral('Núñez')]).toEqual([0x4e, 0xfa, 0xf1, 0x65, 0x7a]);
  });

  it('escapes the three bytes a PDF literal string reserves', () => {
    expect(pdfLiteral('(a)').toString('latin1')).toBe('\\(a\\)');
    expect(pdfLiteral('a\\b').toString('latin1')).toBe('a\\\\b');
  });

  it('maps the CP1252-only characters that survive a copy-paste', () => {
    expect([...pdfLiteral('…')]).toEqual([0x85]);
    expect([...pdfLiteral('–')]).toEqual([0x96]);
    expect([...pdfLiteral('€')]).toEqual([0x80]);
  });

  it('substitutes "?" for anything the base-14 encoding cannot represent', () => {
    expect(pdfLiteral('☺').toString('latin1')).toBe('?');
    // Astral plane: one "?" for the whole code point, not one per surrogate.
    expect(pdfLiteral('🙂').toString('latin1')).toBe('?');
  });
});

describe('fitText', () => {
  it('leaves text that fits alone', () => {
    expect(fitText('Ana', 200, 10)).toBe('Ana');
  });

  it('truncates with an ellipsis and never exceeds the budget', () => {
    const result = fitText('x'.repeat(200), 100, 10);
    expect(result.endsWith('…')).toBe(true);
    expect(estimateWidth(result, 10)).toBeLessThanOrEqual(100);
  });

  it('keeps at least one character even in an impossibly narrow column', () => {
    expect(fitText('Ana', 1, 10)).toHaveLength(1);
  });
});

describe('buildPdfTable', () => {
  it('produces a structurally valid document whose xref matches its objects', () => {
    const { text, objectCount } = readPdf(buildPdfTable(TABLE));
    // catalog + page tree + 2 fonts + (content, page) for the single page
    expect(objectCount).toBe(6);
    expect(text).toContain('/Type /Catalog');
    expect(text).toContain('/BaseFont /Helvetica /Encoding /WinAnsiEncoding');
  });

  it('renders the column headers and the row values', () => {
    const { text } = readPdf(buildPdfTable(TABLE));
    expect(text).toContain('(Nombre) Tj');
    expect(text).toContain('(Email) Tj');
    expect(text).toContain('(ana@example.com) Tj');
    expect(text).toContain('(Usuarios) Tj');
  });

  it('emits one page for a short table', () => {
    const { text } = readPdf(buildPdfTable(TABLE));
    expect(text).toContain('/Count 1');
    expect(countPages(text)).toBe(1);
  });

  it('still emits a page — headers and all — when there are no rows', () => {
    const { text } = readPdf(buildPdfTable({ ...TABLE, rows: [] }));
    expect(text).toContain('/Count 1');
    expect(text).toContain('(Nombre) Tj');
  });

  it('paginates long tables and repeats the header on every page', () => {
    const { text } = readPdf(buildPdfTable({ ...TABLE, rows: rows(200) }));
    const pages = countPages(text);
    expect(pages).toBeGreaterThan(1);
    expect(text).toContain(`/Count ${pages}`);
    // Header + footer label appear once per page.
    expect(occurrences(text, '(Nombre) Tj')).toBe(pages);
    expect(text).toContain(`(Página 1 de ${pages}) Tj`);
    expect(text).toContain(`(Página ${pages} de ${pages}) Tj`);
  });

  it('declares a /Length that matches each content stream', () => {
    const text = buildPdfTable(TABLE).toString('latin1');
    const match = /<< \/Length (\d+) >>\nstream\n/.exec(text);
    expect(match).not.toBeNull();
    const declared = Number(match![1]);
    const start = match!.index + match![0].length;
    expect(text.slice(start + declared, start + declared + '\nendstream'.length)).toBe(
      '\nendstream',
    );
  });
});

function countPages(text: string): number {
  // The trailing space keeps this from also matching "/Type /Pages".
  return occurrences(text, '/Type /Page ');
}

function occurrences(text: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at === -1) return count;
    count++;
    from = at + needle.length;
  }
}
