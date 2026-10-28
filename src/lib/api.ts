import type { AppConfig, ColumnMapping, FieldDefinition, QRRecord } from './types';
import { buildRowPayload, columnLetterToIndex } from './utils';
import { appState } from './store.svelte';

export interface SubmitResult {
  success: boolean;
  message?: string;
  rowNumber?: number;
}

/**
 * Convert column-mapped dictionary into a 0-indexed row array for Google Sheets API values.append
 */
export function buildSheetsRowArray(
  record: QRRecord,
  fields: FieldDefinition[],
  mappings: ColumnMapping[]
): (string | number | boolean)[] {
  const columnMap = buildRowPayload(record, fields, mappings);
  let maxColIndex = 0;

  for (const colLetter of Object.keys(columnMap)) {
    try {
      const idx = columnLetterToIndex(colLetter);
      if (idx > maxColIndex) maxColIndex = idx;
    } catch {
      // skip invalid column
    }
  }

  if (maxColIndex === 0) return [];

  const row: (string | number | boolean)[] = new Array(maxColIndex).fill('');
  for (const [colLetter, val] of Object.entries(columnMap)) {
    try {
      const idx = columnLetterToIndex(colLetter) - 1; // 0-based
      row[idx] = val;
    } catch {
      // skip
    }
  }

  return row;
}

/**
 * Safely format an A1 notation range with sheet name quoting
 * E.g. sheet "AH SHIIIIT" with range "A:Z" -> "'AH SHIIIIT'!A:Z"
 */
export function formatA1Range(sheetName: string, subRange: string): string {
  const cleanSheet = sheetName.replace(/'/g, "''");
  return `'${cleanSheet}'!${subRange}`;
}

/**
 * Submit record directly to Google Sheets via official REST API v4
 */
export async function submitRecord(
  record: QRRecord,
  config: AppConfig,
  fields: FieldDefinition[],
  mappings: ColumnMapping[],
  tokenOverride?: string
): Promise<SubmitResult> {
  const spreadsheetId = config.spreadsheetId?.trim();
  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID belum diisi. Masukkan di tab Config atau file .env');
  }

  const token = tokenOverride || appState.accessToken;
  if (!token) {
    throw new Error('Belum login Google. Silakan klik "Sign in with Google" di pojok kanan atas.');
  }

  const sheetName = config.sheetName?.trim();
  if (!sheetName) {
    throw new Error('Tab Sheet belum dipilih. Silakan pilih tab di tab Config.');
  }
  const rowArray = buildSheetsRowArray(record, fields, mappings);

  // Use OVERWRITE insertDataOption so preexisting cell validations, conditional formats, and empty row styles aren't shifted/distorted
  const safeRange = formatA1Range(sheetName, 'A:Z');
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(safeRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=OVERWRITE`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [rowArray]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401) {
        appState.signOut();
        throw new Error('Sesi login Google telah kedaluwarsa. Silakan Sign in with Google ulang.');
      }
      if (response.status === 403) {
        throw new Error(
          `Akses Spreadsheet ditolak (403 Forbidden). Pastikan akun Google Anda (${appState.user?.email || 'tester'}) sudah di-share hak akses "Editor" pada Google Spreadsheet tersebut.`
        );
      }
      if (response.status === 404) {
        throw new Error(`Spreadsheet tidak ditemukan (404). Periksa kembali Spreadsheet ID: "${spreadsheetId}".`);
      }

      const errText = await response.text();
      throw new Error(`Google Sheets API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const updatedRange = data.updates?.updatedRange || '';
    const match = updatedRange.match(/!.*?([0-9]+):/);
    const rowNumber = match ? parseInt(match[1], 10) : undefined;

    return {
      success: true,
      message: `Tersimpan ke Google Sheets: ${updatedRange || 'berhasil'}`,
      rowNumber
    };
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new Error('Koneksi ke Google Sheets timed out (15s). Cek internet Anda.');
      }
      throw err;
    }
    throw new Error('Gagal menghubungi Google Sheets API.');
  }
}

export const retryFailedRecord = submitRecord;

export interface SpreadsheetMetadata {
  title: string;
  sheetNames: string[];
}

/**
 * Fetch spreadsheet title and all available sheet tabs
 */
export async function fetchSpreadsheetMetadata(
  spreadsheetId: string,
  tokenOverride?: string
): Promise<SpreadsheetMetadata> {
  const cleanId = spreadsheetId?.trim();
  if (!cleanId) {
    throw new Error('Spreadsheet ID wajib diisi');
  }

  const token = tokenOverride || appState.accessToken;
  if (!token) {
    throw new Error('Belum login. Silakan Sign in with Google terlebih dahulu.');
  }

  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cleanId)}?fields=properties.title,sheets.properties.title`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401) {
        appState.signOut();
        throw new Error('Sesi login Google kedaluwarsa. Sign in ulang.');
      }
      if (response.status === 403) {
        throw new Error(`Akses ditolak (403). Akun ${appState.user?.email || 'Google Anda'} belum diberi izin Editor di Spreadsheet ini.`);
      }
      if (response.status === 404) {
        throw new Error('Spreadsheet ID tidak ditemukan di Google Drive.');
      }
      const errText = await response.text();
      throw new Error(`Gagal akses spreadsheet (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const title = data.properties?.title || 'Spreadsheet';
    const sheetNames = (data.sheets || [])
      .map((s: any) => s.properties?.title)
      .filter(Boolean);

    return { title, sheetNames };
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new Error('Koneksi ke Google Sheets timed out (10s).');
      }
      throw err;
    }
    throw new Error('Gagal memeriksa Spreadsheet.');
  }
}

/**
 * Fetch Row 1 headers from the selected worksheet tab
 */
export async function fetchSheetHeaders(
  spreadsheetId: string,
  sheetName: string,
  tokenOverride?: string
): Promise<string[]> {
  const cleanId = spreadsheetId?.trim();
  const cleanSheet = sheetName?.trim();
  if (!cleanId || !cleanSheet) return [];

  const token = tokenOverride || appState.accessToken;
  if (!token) return [];

  const safeHeaderRange = formatA1Range(cleanSheet, '1:1');
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cleanId)}/values/${encodeURIComponent(safeHeaderRange)}?majorDimension=ROWS`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) return [];

    const data = await response.json();
    const rowValues = data.values?.[0] || [];
    return rowValues.map((v: any) => (v !== undefined && v !== null ? String(v).trim() : ''));
  } catch {
    return [];
  }
}

/**
 * Fetch column Data Validation rules and official NumberFormats (Date, Number, etc)
 * directly from Google Sheets grid metadata
 */
export async function fetchSheetValidationRules(
  spreadsheetId: string,
  sheetName: string,
  tokenOverride?: string
): Promise<Record<number, { options?: string[]; type?: import('./types').FieldType; numberPattern?: string }>> {
  const cleanId = spreadsheetId?.trim();
  const cleanSheet = sheetName?.trim();
  if (!cleanId || !cleanSheet) return {};

  const token = tokenOverride || appState.accessToken;
  if (!token) return {};

  // Inspect Row 2 dataValidation and userEnteredFormat (numberFormat)
  const safeRange = formatA1Range(cleanSheet, 'A2:Z2');
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cleanId)}?ranges=${encodeURIComponent(safeRange)}&fields=sheets(data(rowData(values(dataValidation,userEnteredFormat/numberFormat))))`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) return {};

    const data = await response.json();
    const rowData = data.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values || [];
    const rules: Record<number, { options?: string[]; type?: import('./types').FieldType; numberPattern?: string }> = {};

    rowData.forEach((col: any, index: number) => {
      const valRule = col?.dataValidation;
      const numFormat = col?.userEnteredFormat?.numberFormat;

      // 1. Check native NumberFormat from Google Sheets format
      if (numFormat?.type) {
        const nfType = String(numFormat.type).toUpperCase();
        if (nfType === 'DATE') {
          rules[index] = { type: 'date', numberPattern: numFormat.pattern };
        } else if (nfType === 'DATE_TIME' || nfType === 'TIME') {
          rules[index] = { type: 'datetime', numberPattern: numFormat.pattern };
        } else if (nfType === 'NUMBER' || nfType === 'CURRENCY' || nfType === 'PERCENT') {
          rules[index] = { type: 'number', numberPattern: numFormat.pattern };
        }
      }

      // 2. Check Data Validation (takes precedence for Dropdowns or Date validation)
      if (valRule?.condition) {
        const condition = valRule.condition;
        const condType = String(condition.type || '').toUpperCase();

        if (condType === 'ONE_OF_LIST' && Array.isArray(condition.values)) {
          const options = condition.values
            .map((v: any) => v?.userEnteredValue)
            .filter((v: any) => v !== undefined && v !== null && String(v).trim().length > 0)
            .map((v: any) => String(v).trim());

          if (options.length > 0) {
            rules[index] = { options, type: 'select' };
          }
        } else if (condType.startsWith('DATE_')) {
          rules[index] = { type: 'date' };
        } else if (condType === 'BOOLEAN') {
          rules[index] = { type: 'boolean' };
        } else if (condType.startsWith('NUMBER_')) {
          rules[index] = { type: 'number' };
        }
      }
    });

    return rules;
  } catch {
    return {};
  }
}

/**
 * Fetch rows from the worksheet tab for live preview
 */
export async function fetchSheetRows(
  spreadsheetId: string,
  sheetName: string,
  maxRows: number = 50,
  tokenOverride?: string
): Promise<{ headers: string[]; rows: string[][] }> {
  const cleanId = spreadsheetId?.trim();
  const cleanSheet = sheetName?.trim();
  if (!cleanId || !cleanSheet) return { headers: [], rows: [] };

  const token = tokenOverride || appState.accessToken;
  if (!token) return { headers: [], rows: [] };

  const safeRange = formatA1Range(cleanSheet, `A1:Z${maxRows}`);
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cleanId)}/values/${encodeURIComponent(safeRange)}?majorDimension=ROWS`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) return { headers: [], rows: [] };

    const data = await response.json();
    const values: any[][] = data.values || [];
    if (values.length === 0) return { headers: [], rows: [] };

    const headers = (values[0] || []).map((v) => (v !== undefined && v !== null ? String(v).trim() : ''));
    const rows = values.slice(1).map((r) =>
      headers.map((_, i) => (r[i] !== undefined && r[i] !== null ? String(r[i]) : ''))
    );

    return { headers, rows };
  } catch {
    return { headers: [], rows: [] };
  }
}

/**
 * Ping / Verify Google Spreadsheet reachability using OAuth token
 */
export async function pingGoogleSheets(spreadsheetId: string, sheetName?: string, tokenOverride?: string): Promise<SubmitResult> {
  const meta = await fetchSpreadsheetMetadata(spreadsheetId, tokenOverride);
  const targetSheet = sheetName?.trim();

  if (targetSheet && !meta.sheetNames.includes(targetSheet)) {
    return {
      success: true,
      message: `Terhubung ke "${meta.title}", tapi tab "${targetSheet}" belum ada.`
    };
  }

  return {
    success: true,
    message: `Terhubung ke "${meta.title}"${targetSheet ? ` (Tab: ${targetSheet})` : ` (${meta.sheetNames.length} tab)`}`
  };
}
