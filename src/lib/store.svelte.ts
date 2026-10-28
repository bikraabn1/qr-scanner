import type { AppConfig, ColumnMapping, FieldDefinition, GoogleUser, QRRecord, TestStatus } from './types';
import { generateRecordId } from './utils';

const STORAGE_KEYS = {
  CONFIG: 'qr_book_tester_config_v2',
  FIELDS: 'qr_book_tester_fields_v1',
  MAPPINGS: 'qr_book_tester_mappings_v1',
  CURRENT_PAGE: 'qr_book_tester_current_page_v1',
  RECORDS: 'qr_book_tester_records_v1',
  THEME: 'qr_book_tester_theme_v1',
  AUTH_USER: 'qr_book_tester_auth_user_v1'
};

const DEFAULT_FIELDS: FieldDefinition[] = [
  { id: 'pageNumber', label: 'Page Number', type: 'number', required: true, enabled: true, isBuiltIn: true },
  { id: 'qrContent', label: 'Decoded QR / URL', type: 'url', required: true, enabled: true, isBuiltIn: true },
  {
    id: 'testStatus',
    label: 'Test Status',
    type: 'select',
    required: true,
    enabled: true,
    isBuiltIn: true,
    defaultValue: 'PASS',
    options: ['PASS', 'FAIL', 'BLOCKED', 'FLAGGED']
  },
  { id: 'notes', label: 'Notes', type: 'longtext', required: false, enabled: true, isBuiltIn: true },
  { id: 'scannedAt', label: 'Timestamp', type: 'datetime', required: true, enabled: true, isBuiltIn: true }
];

const DEFAULT_MAPPINGS: ColumnMapping[] = [
  { fieldId: 'pageNumber', columnLetter: 'C', headerName: 'Page Number' },
  { fieldId: 'qrContent', columnLetter: 'F', headerName: 'Decoded QR URL' },
  { fieldId: 'testStatus', columnLetter: 'H', headerName: 'Test Status' },
  { fieldId: 'notes', columnLetter: 'J', headerName: 'Notes' },
  { fieldId: 'scannedAt', columnLetter: 'K', headerName: 'Timestamp' }
];

const envClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID?.trim() || '';
const envSpreadsheetId = (import.meta as any).env?.VITE_SPREADSHEET_ID?.trim() || '';
const envSheetName = (import.meta as any).env?.VITE_SHEET_NAME?.trim() || '';

const DEFAULT_CONFIG: AppConfig = {
  clientId: envClientId,
  spreadsheetId: envSpreadsheetId,
  sheetName: envSheetName,
  writeStrategy: 'append',
  updateKeyFieldId: 'qrContent',
  autoClearOnSubmit: true,
  soundEnabled: true
};

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const item = window.localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Failed to save to localStorage (${key}):`, err);
  }
}

export class AppState {
  config = $state<AppConfig>(loadFromStorage(STORAGE_KEYS.CONFIG, DEFAULT_CONFIG));
  fields = $state<FieldDefinition[]>(loadFromStorage(STORAGE_KEYS.FIELDS, DEFAULT_FIELDS));
  mappings = $state<ColumnMapping[]>(loadFromStorage(STORAGE_KEYS.MAPPINGS, DEFAULT_MAPPINGS));
  currentPage = $state<number>(loadFromStorage(STORAGE_KEYS.CURRENT_PAGE, 1));
  records = $state<QRRecord[]>(loadFromStorage(STORAGE_KEYS.RECORDS, []));
  theme = $state<'dark' | 'light'>(loadFromStorage(STORAGE_KEYS.THEME, 'dark'));

  // OAuth Google Identity Session
  user = $state<GoogleUser | null>(loadFromStorage(STORAGE_KEYS.AUTH_USER, null));
  accessToken = $state<string | null>(null);

  constructor() {
    if (typeof window !== 'undefined') {
      this.applyTheme(this.theme);
    }
  }

  setAuth(user: GoogleUser | null, token: string | null) {
    this.user = user;
    this.accessToken = token;
    saveToStorage(STORAGE_KEYS.AUTH_USER, user);
  }

  signOut() {
    this.user = null;
    this.accessToken = null;
    saveToStorage(STORAGE_KEYS.AUTH_USER, null);
  }

  saveConfig(newConfig: Partial<AppConfig>) {
    this.config = { ...this.config, ...newConfig };
    saveToStorage(STORAGE_KEYS.CONFIG, this.config);
  }

  setPageNumber(page: number) {
    if (page > 0) {
      this.currentPage = Math.floor(page);
      saveToStorage(STORAGE_KEYS.CURRENT_PAGE, this.currentPage);
    }
  }

  saveFields(newFields: FieldDefinition[]) {
    this.fields = newFields;
    saveToStorage(STORAGE_KEYS.FIELDS, this.fields);
  }

  saveMappings(newMappings: ColumnMapping[]) {
    this.mappings = newMappings;
    saveToStorage(STORAGE_KEYS.MAPPINGS, this.mappings);
  }

  addRecord(record: QRRecord) {
    this.records = [record, ...this.records];
    saveToStorage(STORAGE_KEYS.RECORDS, this.records);
  }

  updateRecordStatus(recordId: string, status: QRRecord['submissionStatus'], error?: string) {
    this.records = this.records.map((r) =>
      r.recordId === recordId ? { ...r, submissionStatus: status, submissionError: error } : r
    );
    saveToStorage(STORAGE_KEYS.RECORDS, this.records);
  }

  deleteRecord(recordId: string) {
    this.records = this.records.filter((r) => r.recordId !== recordId);
    saveToStorage(STORAGE_KEYS.RECORDS, this.records);
  }

  clearHistory() {
    this.records = [];
    saveToStorage(STORAGE_KEYS.RECORDS, this.records);
  }

  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    saveToStorage(STORAGE_KEYS.THEME, this.theme);
    this.applyTheme(this.theme);
  }

  private applyTheme(t: 'dark' | 'light') {
    if (typeof document === 'undefined') return;
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  resetToDefaults() {
    this.config = { ...DEFAULT_CONFIG };
    this.fields = [...DEFAULT_FIELDS];
    this.mappings = [...DEFAULT_MAPPINGS];
    saveToStorage(STORAGE_KEYS.CONFIG, this.config);
    saveToStorage(STORAGE_KEYS.FIELDS, this.fields);
    saveToStorage(STORAGE_KEYS.MAPPINGS, this.mappings);
  }
}

export const appState = new AppState();

if (typeof window !== 'undefined') {
  (window as any).__appState = appState;
}
