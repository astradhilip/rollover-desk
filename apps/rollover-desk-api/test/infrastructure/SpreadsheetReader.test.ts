import ExcelJS from 'exceljs';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { UnreadableSpreadsheetError } from '../../src/domain/ports/ISpreadsheetReader';
import { assertSafeZip, parseCsv, SpreadsheetReader } from '../../src/infrastructure/excel/SpreadsheetReader';

const reader = new SpreadsheetReader();

async function book(fill: (s: ExcelJS.Worksheet) => void) {
  const w = new ExcelJS.Workbook();
  fill(w.addWorksheet('S'));
  return Buffer.from(await w.xlsx.writeBuffer());
}

describe('xlsx', () => {
  it('reads values, dates and rich text', async () => {
    const bytes = await book((s) => {
      s.addRow(['a', 1.5, new Date('2029-01-31T00:00:00Z')]);
      s.getCell('D1').value = { richText: [{ text: 'rich ' }, { text: 'text' }] };
    });
    const [sheet] = await reader.read(bytes, 'x.xlsx');
    expect(sheet!.rows[0]).toEqual(['a', 1.5, { date: '2029-01-31' }, 'rich text']);
  });
  it('reads stored formula results and never evaluates', async () => {
    const bytes = await book((s) => {
      s.getCell('A1').value = { formula: 'SUM(1,2)', result: 3 };
      s.getCell('B1').value = { formula: 'NOW()' } as ExcelJS.CellFormulaValue;
    });
    const [sheet] = await reader.read(bytes, 'x.xlsx');
    expect(sheet!.rows[0]).toEqual([3, '#NO_STORED_VALUE']);
  });
  it('repeats a merged value across its cells', async () => {
    const bytes = await book((s) => {
      s.getCell('A1').value = 'Acme';
      s.mergeCells('A1:A2');
    });
    const [sheet] = await reader.read(bytes, 'x.xlsx');
    expect(sheet!.rows.map((r) => r[0])).toEqual(['Acme', 'Acme']);
  });
  it('refuses a corrupt file, another type, and an oversized sheet', async () => {
    await expect(reader.read(Buffer.from('not a zip'), 'x.xlsx')).rejects.toThrow(UnreadableSpreadsheetError);
    await expect(reader.read(Buffer.from('x'), 'x.pdf')).rejects.toThrow(/xlsx or \.csv/);
    const big = await book((s) => {
      s.getCell(20_001, 1).value = 'x';
    });
    await expect(reader.read(big, 'x.xlsx')).rejects.toThrow(/limit/);
  });
});

describe('csv', () => {
  it('handles quotes, commas, CRLF, a BOM and empty cells', () => {
    expect(parseCsv('﻿a,"b, c","d ""e"""\r\n,2\n')).toEqual([
      ['a', 'b, c', 'd "e"'],
      [null, '2'],
    ]);
    expect(parseCsv('x')).toEqual([['x']]);
    expect(parseCsv('')).toEqual([]);
  });
  it('refuses an unclosed quote and binary content', async () => {
    expect(() => parseCsv('"a')).toThrow(UnreadableSpreadsheetError);
    await expect(reader.read(Buffer.from([1, 0, 2]), 'x.csv')).rejects.toThrow(UnreadableSpreadsheetError);
  });
});

describe('zip safety', () => {
  const small = () =>
    book((s) => {
      s.getCell('A1').value = 'x';
    });
  const directoryOf = (bytes: Buffer) =>
    bytes.readUInt32LE(bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) + 16);

  it('accepts an ordinary workbook', async () => {
    const bytes = await small();
    expect(() => assertSafeZip(bytes)).not.toThrow();
  });
  it('refuses something that is not a zip', () => {
    expect(() => assertSafeZip(Buffer.alloc(0))).toThrow(UnreadableSpreadsheetError);
  });
  it('refuses a falsified declared size', async () => {
    const bytes = await small();
    bytes.writeUInt32LE(1, directoryOf(bytes) + 24);
    await expect(reader.read(bytes, 'x.xlsx')).rejects.toThrow(UnreadableSpreadsheetError);
  });
  it('is not fooled by a declared entry count of zero', async () => {
    const bytes = await small();
    bytes.writeUInt32LE(1, directoryOf(bytes) + 24);
    const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    bytes.writeUInt16LE(0, end + 8);
    bytes.writeUInt16LE(0, end + 10);
    expect(() => assertSafeZip(bytes)).toThrow(UnreadableSpreadsheetError);
  });
  it('refuses a real bomb by what actually comes out, whatever it declares', () => {
    const data = deflateRawSync(Buffer.alloc(101 * 1024 * 1024));
    const name = Buffer.from('a');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(1, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(10, 24);
    dir.writeUInt16LE(1, 28);
    const dirAt = 30 + 1 + data.length;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(dirAt, 16);
    const zip = Buffer.concat([local, name, data, dir, name, end]);
    expect(() => assertSafeZip(zip)).toThrow(/too large/);
  });
  it('strips NUL from rich text and hyperlink text', async () => {
    const bytes = await book((s) => {
      s.getCell('A1').value = { richText: [{ text: 'a\u0000b' }] };
      s.getCell('B1').value = { text: 'c\u0000d', hyperlink: 'https://example.com' };
    });
    const [sheet] = await reader.read(bytes, 'x.xlsx');
    expect(sheet!.rows[0]).toEqual(['ab', 'cd']);
  });
});
