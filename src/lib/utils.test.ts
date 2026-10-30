import { describe, it, expect } from 'vitest';
import {
  columnIndexToLetter,
  columnLetterToIndex,
  isValidColumnLetter,
  isValidUrl,
  generateRecordId,
  buildRowPayload,
  getFieldValue
} from './utils';
import type { FieldDefinition, ColumnMapping, QRRecord } from './types';

describe('Column Index & Letter Utilities', () => {
  it('converts 1-based index to letter correctly', () => {
    expect(columnIndexToLetter(1)).toBe('A');
    expect(columnIndexToLetter(26)).toBe('Z');
    expect(columnIndexToLetter(27)).toBe('AA');
    expect(columnIndexToLetter(28)).toBe('AB');
    expect(columnIndexToLetter(52)).toBe('AZ');
    expect(columnIndexToLetter(53)).toBe('BA');
    expect(columnIndexToLetter(702)).toBe('ZZ');
    expect(columnIndexToLetter(703)).toBe('AAA');
  });

  it('converts letter to 1-based index correctly', () => {
    expect(columnLetterToIndex('A')).toBe(1);
    expect(columnLetterToIndex('Z')).toBe(26);
    expect(columnLetterToIndex('AA')).toBe(27);
    expect(columnLetterToIndex('AB')).toBe(28);
    expect(columnLetterToIndex('ZZ')).toBe(702);
    expect(columnLetterToIndex('AAA')).toBe(703);
  });

  it('validates column letters properly', () => {
    expect(isValidColumnLetter('A')).toBe(true);
    expect(isValidColumnLetter('z')).toBe(true);
    expect(isValidColumnLetter('AA')).toBe(true);
    expect(isValidColumnLetter('AB')).toBe(true);
    expect(isValidColumnLetter('1')).toBe(false);
    expect(isValidColumnLetter('A1')).toBe(false);
    expect(isValidColumnLetter('AAAA')).toBe(false);
  });
});

describe('URL and ID utilities', () => {
  it('generates unique non-empty record IDs', () => {
    const id1 = generateRecordId();
    const id2 = generateRecordId();
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it('validates URLs correctly', () => {
    expect(isValidUrl('https://example.com/qr-1')).toBe(true);
    expect(isValidUrl('http://localhost:3000/test')).toBe(true);
    expect(isValidUrl('not-a-url')).toBe(false);
    expect(isValidUrl('ftp://ftp.example.com')).toBe(false);
  });
});

describe('Payload Mapper', () => {
  const fields: FieldDefinition[] = [
    { id: 'pageNumber', label: 'Page', type: 'number', required: true, enabled: true, isBuiltIn: true },
    { id: 'qrContent', label: 'QR URL', type: 'url', required: true, enabled: true, isBuiltIn: true },
    { id: 'testStatus', label: 'Status', type: 'select', required: true, enabled: true, isBuiltIn: true },
    { id: 'custom_section', label: 'Section', type: 'text', required: false, enabled: true },
    { id: 'notes', label: 'Notes', type: 'longtext', required: false, enabled: false, isBuiltIn: true } // disabled
  ];

  const mappings: ColumnMapping[] = [
    { fieldId: 'pageNumber', columnLetter: 'C' },
    { fieldId: 'qrContent', columnLetter: 'F' },
    { fieldId: 'testStatus', columnLetter: 'H' },
    { fieldId: 'custom_section', columnLetter: 'K' },
    { fieldId: 'notes', columnLetter: 'L' }
  ];

  const record: QRRecord = {
    recordId: 'rec-123',
    pageNumber: 42,
    qrContent: 'https://example.com/ch4',
    testStatus: 'PASS',
    notes: 'Should be ignored because disabled',
    scannedAt: '2026-10-28T10:00:00Z',
    customFields: {
      custom_section: 'Chapter 4 Header'
    },
    submissionStatus: 'ready'
  };

  it('builds mapped row correctly without unmapped or disabled fields', () => {
    const payload = buildRowPayload(record, fields, mappings);
    expect(payload).toEqual({
      C: 42,
      F: 'https://example.com/ch4',
      H: 'PASS',
      K: 'Chapter 4 Header'
    });
    expect(payload.L).toBeUndefined(); // disabled field excluded
  });

  it('handles field values lookup', () => {
    expect(getFieldValue(record, 'pageNumber')).toBe(42);
    expect(getFieldValue(record, 'qrContent')).toBe('https://example.com/ch4');
    expect(getFieldValue(record, 'custom_section')).toBe('Chapter 4 Header');
    expect(getFieldValue(record, 'non_existent')).toBe('');
  });

  it('handles boolean checkboxes with native boolean and custom values', () => {
    const boolField: FieldDefinition = {
      id: 'custom_check',
      label: 'Is TS Internal',
      type: 'boolean',
      required: false,
      enabled: true
    };
    const recChecked = { ...record, customFields: { custom_check: true } };
    const recUnchecked = { ...record, customFields: { custom_check: false } };

    // Standard checkbox without custom values -> native boolean
    expect(getFieldValue(recChecked, 'custom_check', boolField)).toBe(true);
    expect(getFieldValue(recUnchecked, 'custom_check', boolField)).toBe(false);

    // Checkbox with custom values (e.g. ['Ya', 'Bukan'])
    const customBoolField: FieldDefinition = {
      ...boolField,
      options: ['Ya', 'Bukan']
    };
    expect(getFieldValue(recChecked, 'custom_check', customBoolField)).toBe('Ya');
    expect(getFieldValue(recUnchecked, 'custom_check', customBoolField)).toBe('Bukan');
  });
});
