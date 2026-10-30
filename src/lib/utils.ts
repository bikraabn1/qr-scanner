import type { ColumnMapping, FieldDefinition, QRRecord } from './types';

/**
 * Generate a unique random ID for records (idempotency key)
 */
export function generateRecordId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'rec_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Convert 1-based column number to column letter (e.g. 1 -> A, 27 -> AA)
 */
export function columnIndexToLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

/**
 * Convert column letter to 1-based column number (e.g. A -> 1, AA -> 27)
 */
export function columnLetterToIndex(columnLetter: string): number {
  const cleaned = columnLetter.trim().toUpperCase();
  let result = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const charCode = cleaned.charCodeAt(i);
    if (charCode < 65 || charCode > 90) {
      throw new Error(`Invalid column character: ${cleaned[i]}`);
    }
    result = result * 26 + (charCode - 64);
  }
  return result;
}

/**
 * Validate that a column letter is well-formed (A-Z, AA-ZZ, etc.)
 */
export function isValidColumnLetter(col: string): boolean {
  return /^[A-Z]{1,3}$/i.test(col.trim());
}

/**
 * Normalize and clean URL input
 */
export function isValidUrl(input: string): boolean {
  try {
    const url = new URL(input.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Extract and format a field's value from a QRRecord based on FieldDefinition type
 */
export function getFieldValue(
  record: QRRecord,
  fieldId: string,
  fieldDef?: FieldDefinition
): string | number | boolean {
  let raw: any;
  switch (fieldId) {
    case 'pageNumber':
      raw = record.pageNumber;
      break;
    case 'qrContent':
      raw = record.qrContent;
      break;
    case 'testStatus':
      raw = record.testStatus;
      break;
    case 'notes':
      raw = record.notes;
      break;
    case 'scannedAt':
      raw = record.scannedAt;
      break;
    case 'recordId':
      raw = record.recordId;
      break;
    default:
      raw = record.customFields?.[fieldId] ?? '';
      break;
  }

  // Format specifically if column is 'date' (YYYY-MM-DD) vs 'datetime'
  if (fieldDef?.type === 'date' && typeof raw === 'string' && raw.includes('T')) {
    return raw.split('T')[0];
  }

  // Handle boolean / checkbox fields with custom cell values (e.g. ['Ya', 'Bukan'] or standard boolean)
  if (fieldDef?.type === 'boolean') {
    const isChecked = Boolean(raw === true || raw === 'true' || raw === 'TRUE' || raw === 1 || raw === '1');
    if (fieldDef.options && fieldDef.options.length >= 2) {
      return isChecked ? fieldDef.options[0] : fieldDef.options[1];
    } else if (fieldDef.options && fieldDef.options.length === 1) {
      return isChecked ? fieldDef.options[0] : '';
    }
    return isChecked; // native boolean for Google Sheets checkbox
  }

  return raw;
}

/**
 * Prepare mapped row payload for Google Sheets API
 * Returns a dictionary mapping column letters (e.g. "A", "C", "F") to cell values.
 */
export function buildRowPayload(
  record: QRRecord,
  fields: FieldDefinition[],
  mappings: ColumnMapping[]
): Record<string, string | number | boolean> {
  const payload: Record<string, string | number | boolean> = {};

  for (const mapping of mappings) {
    const col = mapping.columnLetter.trim().toUpperCase();
    if (!col) continue;

    const field = fields.find((f) => f.id === mapping.fieldId);
    if (!field || !field.enabled) continue;

    const val = getFieldValue(record, mapping.fieldId, field);
    payload[col] = val;
  }

  return payload;
}
