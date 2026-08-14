import { describe, it, expect } from 'vitest';
import { buildXlsx, columnName, crc32, escapeXml, safeSheetName } from './xlsx';

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

/**
 * A minimal reader for the subset of ZIP this module writes. Walking the
 * central directory and following each entry's offset back to its local header
 * is what actually proves the archive is well-formed — a reader that only
 * looked for the "PK" magic would pass on a file Excel refuses to open.
 */
function readZip(buf: Buffer): { name: string; text: string }[] {
  const eocd = buf.length - 22;
  expect(buf.readUInt32LE(eocd)).toBe(SIG_EOCD);
  const count = buf.readUInt16LE(eocd + 10);

  const entries: { name: string; text: string }[] = [];
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(SIG_CENTRAL);
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const size = buf.readUInt32LE(p + 24);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength);
    const localOffset = buf.readUInt32LE(p + 42);

    expect(buf.readUInt32LE(localOffset)).toBe(SIG_LOCAL);
    const localNameLength = buf.readUInt16LE(localOffset + 26);
    const localExtraLength = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    // Stored entries only: the CRC in the header must match the bytes it points at.
    expect(crc32(buf.subarray(start, start + size))).toBe(buf.readUInt32LE(p + 16));

    entries.push({ name, text: buf.toString('utf8', start, start + size) });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const TABLE = {
  sheetName: 'Usuarios',
  columns: [
    { header: 'Nombre', width: 34 },
    { header: 'Email', width: 42 },
  ],
  rows: [
    ['Ana Núñez', 'ana@example.com'],
    ['Ben & Co <test>', 'ben@example.com'],
  ],
};

describe('escapeXml', () => {
  it('escapes the five XML metacharacters', () => {
    expect(escapeXml('a & b < c > d " e \' f')).toBe(
      'a &amp; b &lt; c &gt; d &quot; e &apos; f',
    );
  });

  it('drops control characters XML 1.0 forbids but keeps tab/newline/return', () => {
    const control = String.fromCharCode(0) + String.fromCharCode(7) + String.fromCharCode(27);
    expect(escapeXml(`a${control}b`)).toBe('ab');
    const allowed = String.fromCharCode(9) + String.fromCharCode(10) + String.fromCharCode(13);
    expect(escapeXml(`a${allowed}b`)).toBe(`a${allowed}b`);
  });

  it('leaves accented characters untouched — they are valid UTF-8 XML', () => {
    expect(escapeXml('Núñez Ángel')).toBe('Núñez Ángel');
  });
});

describe('columnName', () => {
  it('maps indexes to spreadsheet column letters, including the rollover', () => {
    expect(columnName(0)).toBe('A');
    expect(columnName(25)).toBe('Z');
    expect(columnName(26)).toBe('AA');
    expect(columnName(27)).toBe('AB');
    expect(columnName(51)).toBe('AZ');
    expect(columnName(52)).toBe('BA');
  });
});

describe('safeSheetName', () => {
  it('replaces the characters Excel rejects and caps the length at 31', () => {
    expect(safeSheetName('a/b\\c?d*e[f]g')).toBe('a b c d e f g');
    expect(safeSheetName('x'.repeat(40))).toHaveLength(31);
    expect(safeSheetName('   ')).toBe('Hoja1');
  });
});

describe('crc32', () => {
  // The two canonical check values for CRC-32/ISO-HDLC.
  it('matches the published check values', () => {
    expect(crc32(Buffer.from(''))).toBe(0);
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    expect(crc32(Buffer.from('a'))).toBe(0xe8b7be43);
  });
});

describe('buildXlsx', () => {
  it('writes a readable archive holding exactly the six OOXML parts', () => {
    const entries = readZip(buildXlsx(TABLE));
    expect(entries.map((e) => e.name)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ]);
  });

  it('puts the column headers in row 1 and the data below', () => {
    const sheet = readZip(buildXlsx(TABLE)).find((e) => e.name.endsWith('sheet1.xml'))!.text;
    expect(sheet).toContain('<row r="1">');
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Nombre</t>');
    expect(sheet).toContain('<c r="B1" s="1" t="inlineStr"><is><t xml:space="preserve">Email</t>');
    expect(sheet).toContain(
      '<c r="A2" s="0" t="inlineStr"><is><t xml:space="preserve">Ana Núñez</t>',
    );
    expect(sheet).toContain('<row r="3">');
  });

  it('escapes cell values so a name with markup cannot break the part', () => {
    const sheet = readZip(buildXlsx(TABLE)).find((e) => e.name.endsWith('sheet1.xml'))!.text;
    expect(sheet).toContain('Ben &amp; Co &lt;test&gt;');
  });

  it('writes blank cells rather than empty strings for missing values', () => {
    const sheet = readZip(
      buildXlsx({ ...TABLE, rows: [['', 'solo@example.com']] }),
    ).find((e) => e.name.endsWith('sheet1.xml'))!.text;
    expect(sheet).toContain('<c r="A2" s="0"/>');
  });

  it('pads short rows out to the column count', () => {
    const sheet = readZip(buildXlsx({ ...TABLE, rows: [['Solo Nombre']] })).find((e) =>
      e.name.endsWith('sheet1.xml'),
    )!.text;
    expect(sheet).toContain('<c r="B2" s="0"/>');
  });

  it('still produces a valid workbook with no data rows', () => {
    const sheet = readZip(buildXlsx({ ...TABLE, rows: [] })).find((e) =>
      e.name.endsWith('sheet1.xml'),
    )!.text;
    expect(sheet).toContain('<row r="1">');
    expect(sheet).not.toContain('<row r="2">');
  });

  it('is deterministic — same rows in, byte-identical file out', () => {
    expect(buildXlsx(TABLE).equals(buildXlsx(TABLE))).toBe(true);
  });
});
