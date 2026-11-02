import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { UnreadableSpreadsheetError } from '../../src/domain/ports/ISpreadsheetReader';
import { parseCsv, SpreadsheetReader } from '../../src/infrastructure/excel/SpreadsheetReader';

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
