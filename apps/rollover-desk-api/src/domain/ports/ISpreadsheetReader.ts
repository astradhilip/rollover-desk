import type { Cell } from '../entities/spreadsheetCells';

export interface ReadSheet {
  name: string;
  rows: Cell[][];
}

export interface ISpreadsheetReader {
  /** Formulas arrive as their stored values. Throws `UnreadableSpreadsheetError` on a file it can't read. */
  read(bytes: Buffer, filename: string): Promise<ReadSheet[]>;
}

export class UnreadableSpreadsheetError extends Error {}
