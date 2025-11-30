import path from 'path';
import { type CSVRow, parseAndValidateCSV } from './utils';

declare var self: Worker;

export type WorkerInput = { type: 'process'; filePath: string };
export type WorkerOutput =
  | { type: 'result'; fileName: string; validRows: CSVRow[]; skippedCount: number; totalCount: number }
  | { type: 'ready' };

self.onmessage = async (event: MessageEvent<WorkerInput>) => {
  const { filePath } = event.data;
  const fileName = path.basename(filePath);

  const file = Bun.file(filePath);
  const fileString = await file.text();
  const { validRows, skippedCount } = parseAndValidateCSV(fileString);

  postMessage({
    type: 'result',
    fileName,
    validRows,
    skippedCount,
    totalCount: validRows.length + skippedCount,
  } satisfies WorkerOutput);
};

// Signal ready
postMessage({ type: 'ready' } satisfies WorkerOutput);
