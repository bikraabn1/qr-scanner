export type FieldType = 'text' | 'url' | 'number' | 'select' | 'boolean' | 'date' | 'datetime' | 'longtext';

export type SubmissionStatus = 
  | 'ready'
  | 'saving'
  | 'saved'
  | 'failed'
  | 'unknown';

export type TestStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'FLAGGED';

export interface FieldDefinition {
  id: string; // stable internal key (e.g. 'pageNumber', 'qrContent', 'custom_author')
  label: string; // display name (e.g. 'Book Page', 'QR Destination')
  type: FieldType;
  required: boolean;
  defaultValue?: string | number | boolean;
  options?: string[]; // for select type
  isBuiltIn?: boolean; // built-in fields cannot be deleted
  enabled: boolean;
  /** Filled in the sheet by a human afterwards (e.g. verification verdict) — greyed out, never written. */
  readOnly?: boolean;
}

export interface ColumnMapping {
  fieldId: string;
  columnLetter: string; // e.g. 'A', 'B', 'AA'
  headerName?: string; // e.g. 'Page Number'
}

export type WriteStrategy = 'append' | 'update';

export interface GoogleUser {
  email: string;
  name: string;
  picture?: string;
}

export interface AppConfig {
  clientId: string; // Google OAuth 2.0 Web Client ID
  spreadsheetId: string; // Google Spreadsheet ID
  sheetName: string; // Target worksheet/tab name
  writeStrategy: WriteStrategy;
  updateKeyFieldId: string; // composite/unique key if update mode
  autoClearOnSubmit: boolean;
  soundEnabled?: boolean;
}

export interface QRRecord {
  recordId: string; // uuid for idempotency
  pageNumber: number;
  qrContent: string;
  testStatus: TestStatus;
  notes: string;
  scannedAt: string; // ISO string
  customFields: Record<string, string | number | boolean>;
  submissionStatus: SubmissionStatus;
  submissionError?: string;
  isSimulated?: boolean;
}
