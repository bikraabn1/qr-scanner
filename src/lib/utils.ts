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
 * Extract a field's value from a QRRecord
 */
export function getFieldValue(record: QRRecord, fieldId: string): string | number | boolean {
  switch (fieldId) {
    case 'pageNumber':
      return record.pageNumber;
    case 'qrContent':
      return record.qrContent;
    case 'testStatus':
      return record.testStatus;
    case 'notes':
      return record.notes;
    case 'scannedAt':
      return record.scannedAt;
    case 'recordId':
      return record.recordId;
    default:
      return record.customFields?.[fieldId] ?? '';
  }
}

/**
 * Prepare mapped row payload for Google Apps Script
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

    const val = getFieldValue(record, mapping.fieldId);
    payload[col] = val;
  }

  return payload;
}
