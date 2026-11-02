import type { WorkbookModel } from '../entities/workbook';

export interface IWorkbookWriter {
  write(model: WorkbookModel): Promise<Buffer>;
}
