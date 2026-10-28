import type { AppConfig, ColumnMapping, FieldDefinition, QRRecord } from './types';
import { buildRowPayload } from './utils';

export interface SubmitResult {
  success: boolean;
  simulated?: boolean;
  message?: string;
  rowNumber?: number;
}

export async function submitRecord(
  record: QRRecord,
  config: AppConfig,
  fields: FieldDefinition[],
  mappings: ColumnMapping[]
): Promise<SubmitResult> {
  // Dummy mode fallback (FR-10)
  if (config.dummyMode) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return {
      success: true,
      simulated: true,
      message: 'Simulated submission successful (Dummy Mode)'
    };
  }

  if (!config.scriptUrl || !config.scriptUrl.trim()) {
    throw new Error('Google Apps Script Web App URL is not configured. Please set it in Settings.');
  }

  const rowPayload = buildRowPayload(record, fields, mappings);

  const requestBody = {
    action: 'writeRecord',
    strategy: config.writeStrategy || 'append',
    sheetName: config.sheetName || 'Sheet1',
    recordId: record.recordId,
    updateKey: config.updateKeyFieldId || 'qrContent',
    columns: rowPayload,
    metadata: {
      pageNumber: record.pageNumber,
      qrContent: record.qrContent,
      testStatus: record.testStatus,
      scannedAt: record.scannedAt
    }
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch(config.scriptUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8' // Text plain prevents CORS preflight issues with Google Apps Script
      },
      body: JSON.stringify(requestBody),
      redirect: 'follow',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Google Apps Script responded with HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.status === 'success' || data.success === true) {
      return {
        success: true,
        message: data.message || 'Row written successfully',
        rowNumber: data.row || data.rowNumber
      };
    } else {
      throw new Error(data.message || data.error || 'Google Apps Script reported an error');
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new Error('Request timed out after 15 seconds. Submission outcome is unknown.');
      }
      throw err;
    }
    throw new Error('Failed to connect to Google Apps Script endpoint');
  }
}

export const retryFailedRecord = submitRecord;

export async function pingGoogleSheets(scriptUrl: string, sheetName: string): Promise<SubmitResult> {
  if (!scriptUrl || !scriptUrl.trim()) {
    throw new Error('Google Apps Script URL is required');
  }

  const requestBody = {
    action: 'ping',
    sheetName: sheetName || 'Sheet1'
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(scriptUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(requestBody),
      redirect: 'follow',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    if (data.status === 'success' || data.success === true) {
      return {
        success: true,
        message: data.message || `Connected to sheet "${sheetName}"`
      };
    } else {
      throw new Error(data.message || 'Spreadsheet ping returned an error');
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('Could not reach Google Apps Script');
  }
}
