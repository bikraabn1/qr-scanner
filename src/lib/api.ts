import type { AppConfig, ColumnMapping, FieldDefinition, QRRecord } from './types';
import { buildRowPayload, columnLetterToIndex } from './utils';
import { appState } from './store.svelte';
import { requestGoogleAccessToken } from './google-auth';

export interface SubmitResult {
  success: boolean;
  message?: string;
  rowNumber?: number;
}

export interface SheetRowItem {
  rowNumber: number;
  cells: string[];
}

/**
 * Fetch against the Sheets API with the current token. A 401 is retried once with a freshly
 * renewed token so an expired token doesn't kick the user back to the login screen mid-session.
 */
async function googleFetch(url: string, init: RequestInit = {}, tokenOverride?: string): Promise<Response> {
  let token = tokenOverride !== undefined ? tokenOverride : appState.accessToken;
  if (!token) throw new Error('Belum login Google. Silakan klik "Sign in with Google" terlebih dahulu.');

  const send = (t: string) =>
    fetch(url, {
      ...init,
      headers: { ...((init.headers as Record<string, string>) || {}), Authorization: `Bearer ${t}` }
    });

  const response = await send(token);
  if (response.status !== 401 || tokenOverride) return response;

  token = await requestGoogleAccessToken(true);
  return send(token);
}

/**
 * Google answers 403 for unrelated causes (API disabled, scope missing, no share access).
 * Report the real one instead of always blaming spreadsheet permissions.
 */
async function throwSheetsError(response: Response, spreadsheetId?: string): Promise<never> {
  const body = typeof response.text === 'function' ? await response.text().catch(() => '') : '';
  const reason = body.match(/"reason"\s*:\s*"([^"]+)"/)?.[1] || '';
  const email = appState.user?.email;

  if (response.status === 401) {
    appState.signOut();
    throw new Error('Sesi login Google kedaluwarsa. Silakan Sign in with Google ulang.');
  }
  if (response.status === 403) {
    if (reason === 'SERVICE_DISABLED' || /has not been used in project|is disabled/.test(body)) {
      throw new Error(
        'Google Sheets API belum diaktifkan di Google Cloud project milik OAuth Client ID ini. Buka console.cloud.google.com -> APIs & Services -> Library -> "Google Sheets API" -> Enable, tunggu 1-2 menit, lalu coba lagi.'
      );
    }
    if (reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' || /insufficient (authentication )?scopes|insufficientPermissions/.test(body)) {
      appState.signOut();
      throw new Error(
        `Token Google untuk ${email || 'akun ini'} tidak punya izin Google Sheets. Sign in ulang dan centang akses Spreadsheet saat diminta.`
      );
    }
    throw new Error(
      `Akses Spreadsheet ditolak (403 Forbidden) untuk ${email || 'akun Google Anda'}. Pastikan akun tsb sudah di-share "Editor" di Spreadsheet ini. Detail: ${body.slice(0, 400)}`
    );
  }
  if (response.status === 404) {
    throw new Error(`Spreadsheet atau tab tidak ditemukan (404). Periksa Spreadsheet ID "${spreadsheetId || ''}" dan nama tab.`);
  }
  throw new Error(`Google Sheets API Error (${response.status}): ${body.slice(0, 400)}`);
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
 * Find the next available row (or existing row if updating) in a given column.
 * Skips row 1 (headers) and finds the first empty cell so template rows with default values in other columns
 * aren't skipped or appended past.
 */
export async function findTargetRow(
  spreadsheetId: string,
  sheetName: string,
  keyColumnLetter: string,
  token: string,
  strategy: 'append' | 'update' = 'append',
  searchValue?: string
): Promise<number> {
  const cleanId = spreadsheetId?.trim();
  const cleanSheet = sheetName?.trim();
  const cleanCol = keyColumnLetter?.trim().toUpperCase();
  if (!cleanId || !cleanSheet || !cleanCol) return 2;

  const safeRange = formatA1Range(cleanSheet, `${cleanCol}:${cleanCol}`);
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cleanId)}/values/${encodeURIComponent(safeRange)}?majorDimension=ROWS`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await googleFetch(endpoint, { signal: controller.signal }, token);
  clearTimeout(timeoutId);

  if (!response.ok) await throwSheetsError(response, cleanId);

  const data = await response.json();
  const values: any[][] = data.values || [];

  // Update strategy: check if key value already exists in the sheet
  if (strategy === 'update' && searchValue && searchValue.trim()) {
    const cleanSearch = searchValue.trim();
    for (let i = 1; i < values.length; i++) {
      const cell = values[i]?.[0];
      if (cell !== undefined && cell !== null && String(cell).trim() === cleanSearch) {
        return i + 1;
      }
    }
  }

  // Find first empty cell from row 2 (index 1) onwards
  let i = 1;
  while (i < values.length) {
    const row = values[i];
    if (!row || row.length === 0 || row[0] === undefined || row[0] === null || String(row[0]).trim() === '') {
      return i + 1;
    }
    i++;
  }

  return i + 1;
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

  const columnMap = buildRowPayload(record, fields, mappings);
  if (Object.keys(columnMap).length === 0) {
    throw new Error('Tidak ada kolom yang aktif atau di-mapping ke Google Sheets.');
  }

  // Find key column to detect existing rows / empty template slots
  const keyMapping =
    mappings.find((m) => m.fieldId === 'qrContent' && m.columnLetter) ||
    mappings.find((m) => m.fieldId === 'pageNumber' && m.columnLetter) ||
    mappings.find((m) => m.columnLetter);

  const keyColumnLetter = keyMapping?.columnLetter?.trim().toUpperCase();

  let targetRow: number | null = null;
  if (keyColumnLetter) {
    try {
      targetRow = await findTargetRow(
        spreadsheetId,
        sheetName,
        keyColumnLetter,
        token,
        config.writeStrategy,
        record.qrContent
      );
    } catch (findErr) {
      console.warn('Gagal mencari baris target, fallback ke append:', findErr);
    }
  }

  // If a targeted row is found, write directly using values:batchUpdate to avoid wiping unmapped template cells
  if (targetRow && targetRow > 1) {
    const data = Object.entries(columnMap).map(([colLetter, val]) => ({
      range: formatA1Range(sheetName, `${colLetter}${targetRow}`),
      values: [[val]]
    }));

    const batchEndpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await googleFetch(
        batchEndpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
          signal: controller.signal
        },
        token
      );
      clearTimeout(timeoutId);

      if (!response.ok) await throwSheetsError(response, spreadsheetId);

      return {
        success: true,
        message: `Tersimpan ke Google Sheets: baris ${targetRow}`,
        rowNumber: targetRow
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Koneksi ke Google Sheets timed out (15s). Cek internet Anda.');
      }
      throw err;
    }
  }

  const rowArray = buildSheetsRowArray(record, fields, mappings);

  // Use OVERWRITE insertDataOption so preexisting cell validations, conditional formats, and empty row styles aren't shifted/distorted
  const safeRange = formatA1Range(sheetName, 'A:Z');
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(safeRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=OVERWRITE`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await googleFetch(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [rowArray] }),
        signal: controller.signal
      },
      token
    );

    clearTimeout(timeoutId);

    if (!response.ok) await throwSheetsError(response, spreadsheetId);

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

    const response = await googleFetch(endpoint, { signal: controller.signal }, token);

    clearTimeout(timeoutId);

    if (!response.ok) await throwSheetsError(response, cleanId);

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

    const response = await googleFetch(endpoint, { signal: controller.signal }, token);
    clearTimeout(timeoutId);

    // Read helpers are best-effort, but a permission/API error must be visible
    if (!response.ok) await throwSheetsError(response, cleanId);

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

    const response = await googleFetch(endpoint, { signal: controller.signal }, token);
    clearTimeout(timeoutId);

    if (!response.ok) await throwSheetsError(response, cleanId);

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
          // Check if custom checkbox values are configured (e.g. ['Ya', 'Bukan'])
          const customValues = Array.isArray(condition.values)
            ? condition.values
                .map((v: any) => v?.userEnteredValue)
                .filter((v: any) => v !== undefined && v !== null && String(v).trim().length > 0)
                .map((v: any) => String(v).trim())
            : [];
          rules[index] = {
            type: 'boolean',
            options: customValues.length > 0 ? customValues : undefined
          };
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
 * Detect whether a row has genuine scanned content or is merely an empty/boilerplate template row
 */
export function isRealRecord(cells: string[]): boolean {
  const filled = cells.filter((c) => c && c.trim() !== '');
  if (filled.length === 0) return false;
  // If only 1 cell filled, check if it's a template boilerplate default (e.g. "Bukan", "Ya", "FALSE")
  if (filled.length === 1) {
    const single = filled[0].trim().toLowerCase();
    if (['bukan', 'ya', 'false', 'true', '-', 'n/a', 'none', 'default', 'null'].includes(single)) {
      return false;
    }
  }
  return true;
}

/**
 * Fetch rows from the worksheet tab for live preview
 */
function indexToColumnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * Write a single cell back to the sheet (used by the live preview editor).
 */
export async function updateSheetCell(
  spreadsheetId: string,
  sheetName: string,
  rowNumber: number,
  columnIndex: number,
  value: string,
  tokenOverride?: string
): Promise<void> {
  const cleanId = spreadsheetId?.trim();
  const cleanSheet = sheetName?.trim();
  if (!cleanId || !cleanSheet) throw new Error('Spreadsheet ID atau nama tab kosong.');

  const a1 = formatA1Range(cleanSheet, `${indexToColumnLetter(columnIndex)}${rowNumber}`);
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cleanId)}/values/${encodeURIComponent(a1)}?valueInputOption=USER_ENTERED`;

  const response = await googleFetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[value]] })
  }, tokenOverride);
  if (!response.ok) await throwSheetsError(response, cleanId);
}

export async function fetchSheetRows(
  spreadsheetId: string,
  sheetName: string,
  maxRows: number = 500,
  tokenOverride?: string
): Promise<{ headers: string[]; rows: SheetRowItem[] }> {
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

    const response = await googleFetch(endpoint, { signal: controller.signal }, token);
    clearTimeout(timeoutId);

    if (!response.ok) await throwSheetsError(response, cleanId);

    const data = await response.json();
    const values: any[][] = data.values || [];
    if (values.length === 0) return { headers: [], rows: [] };

    const headers = (values[0] || []).map((v) => (v !== undefined && v !== null ? String(v).trim() : ''));
    const rows: SheetRowItem[] = [];

    for (let rIdx = 1; rIdx < values.length; rIdx++) {
      const r = values[rIdx] || [];
      const cells = headers.map((_, i) => (r[i] !== undefined && r[i] !== null ? String(r[i]).trim() : ''));
      if (isRealRecord(cells)) {
        rows.push({
          rowNumber: rIdx + 1,
          cells
        });
      }
    }

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
