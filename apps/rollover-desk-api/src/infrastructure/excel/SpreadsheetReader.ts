import ExcelJS from 'exceljs';
import { inflateRawSync } from 'node:zlib';
import type { Cell } from '../../domain/entities/spreadsheetCells';
import {
  type ISpreadsheetReader,
  type ReadSheet,
  UnreadableSpreadsheetError,
} from '../../domain/ports/ISpreadsheetReader';

const MAX_ROWS = 20_000;
const MAX_COLUMNS = 200;

/** PostgreSQL text can't hold NUL, wherever in the cell it came from. */
function toCell(value: ExcelJS.CellValue): Cell {
  const cell = readCell(value);
  return typeof cell === 'string' ? cell.replaceAll('\0', '') : cell;
}

function readCell(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '#INVALID_DATE' : { date: value.toISOString().slice(0, 10) };
  }
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'boolean') return String(value);
  if ('richText' in value) return value.richText.map((p) => p.text).join('');
  if ('error' in value) return String(value.error);
  if ('formula' in value || 'sharedFormula' in value) {
    const result = (value as ExcelJS.CellFormulaValue).result;
    // Never evaluated. A formula with no stored value stays visible so intake refuses it.
    return result === undefined || result === null ? '#NO_STORED_VALUE' : toCell(result as ExcelJS.CellValue);
  }
  if ('text' in value)
    return typeof value.text === 'string' ? value.text : toCell(value.text as ExcelJS.CellValue);
  return null;
}

/** RFC 4180. Each value stays text, because the domain decides what it means. */
export function parseCsv(text: string): Cell[][] {
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = '';
  let quoted = false;
  const endField = () => {
    row.push(field === '' ? null : field);
    field = '';
  };
  const source = text.replace(/^﻿/, '');
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i]!;
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"' && field === '') {
      quoted = true;
    } else if (c === ',') {
      endField();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i += 1;
      endField();
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (quoted) throw new UnreadableSpreadsheetError('The CSV has an unclosed quote.');
  if (field !== '' || row.length > 0) {
    endField();
    rows.push(row);
  }
  return rows;
}

function assertSize(rows: number, columns: number) {
  if (rows > MAX_ROWS || columns > MAX_COLUMNS) {
    throw new UnreadableSpreadsheetError(
      `The file exceeds the limit of ${MAX_ROWS} rows and ${MAX_COLUMNS} columns.`,
    );
  }
}

const MAX_UNZIPPED_BYTES = 100 * 1024 * 1024;
const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;

const LOCAL_HEADER = 0x04034b50;
const STORED = 0;
const DEFLATED = 8;

/**
 * Unpacks every entry with a hard output limit before ExcelJS sees the file, because the zip library would
 * inflate whatever is there. Declared sizes and counts can lie, so what counts is what actually comes out.
 */
export function assertSafeZip(bytes: Buffer): void {
  const unreadable = () =>
    new UnreadableSpreadsheetError('This file could not be read as an Excel workbook.');
  const tooLarge = () => new UnreadableSpreadsheetError('This workbook is too large once unpacked.');
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i -= 1) {
    if (bytes.readUInt32LE(i) === END_OF_DIRECTORY) {
      end = i;
      break;
    }
  }
  if (end < 0) throw unreadable();
  let at = bytes.readUInt32LE(end + 16);
  let total = 0;
  // Walks to the end marker, ignoring the declared count, which the zip library ignores too.
  while (at !== end) {
    if (at + 46 > end || bytes.readUInt32LE(at) !== DIRECTORY_ENTRY) throw unreadable();
    const method = bytes.readUInt16LE(at + 10);
    const compressed = bytes.readUInt32LE(at + 20);
    const declared = bytes.readUInt32LE(at + 24);
    const local = bytes.readUInt32LE(at + 42);
    if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== LOCAL_HEADER) throw unreadable();
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    if (start + compressed > bytes.length) throw unreadable();
    const data = bytes.subarray(start, start + compressed);
    let size: number;
    if (method === STORED) {
      size = data.length;
    } else if (method === DEFLATED) {
      try {
        size = inflateRawSync(data, { maxOutputLength: MAX_UNZIPPED_BYTES - total }).length;
      } catch (error) {
        if ((error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') throw tooLarge();
        throw unreadable();
      }
    } else {
      throw unreadable();
    }
    if (size !== declared) throw unreadable();
    total += size;
    at += 46 + bytes.readUInt16LE(at + 28) + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32);
  }
}

export class SpreadsheetReader implements ISpreadsheetReader {
  async read(bytes: Buffer, filename: string): Promise<ReadSheet[]> {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.csv')) {
      if (bytes.includes(0)) throw new UnreadableSpreadsheetError('This is not a text CSV file.');
      const rows = parseCsv(bytes.toString('utf8'));
      assertSize(rows.length, Math.max(0, ...rows.map((r) => r.length)));
      return [{ name: filename, rows }];
    }
    if (!lower.endsWith('.xlsx')) throw new UnreadableSpreadsheetError('Upload an .xlsx or .csv file.');
    assertSafeZip(bytes);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
    } catch {
      throw new UnreadableSpreadsheetError('This file could not be read as an Excel workbook.');
    }
    return workbook.worksheets.map((sheet) => {
      assertSize(sheet.rowCount, sheet.columnCount);
      const rows: Cell[][] = [];
      for (let r = 1; r <= sheet.rowCount; r += 1) {
        const source = sheet.getRow(r);
        const row: Cell[] = [];
        for (let c = 1; c <= sheet.columnCount; c += 1) row.push(toCell(source.getCell(c).value));
        rows.push(row);
      }
      return { name: sheet.name, rows };
    });
  }
}
