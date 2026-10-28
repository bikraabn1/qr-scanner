import { describe, it, expect } from 'vitest';
import { identifyField, syncFromRowHeaders } from './sheet-sync';
import type { FieldDefinition, ColumnMapping } from './types';

describe('Sheet Header Synchronization', () => {
  const baseFields: FieldDefinition[] = [
    { id: 'pageNumber', label: 'Page Number', type: 'number', required: true, enabled: true, isBuiltIn: true },
    { id: 'qrContent', label: 'Decoded QR / URL', type: 'url', required: true, enabled: true, isBuiltIn: true },
    { id: 'testStatus', label: 'Test Status', type: 'select', required: true, enabled: true, isBuiltIn: true },
    { id: 'notes', label: 'Notes', type: 'longtext', required: false, enabled: true, isBuiltIn: true },
    { id: 'scannedAt', label: 'Timestamp', type: 'datetime', required: true, enabled: true, isBuiltIn: true }
  ];

  const defaultMappings: ColumnMapping[] = [
    { fieldId: 'pageNumber', columnLetter: 'A' },
    { fieldId: 'qrContent', columnLetter: 'B' }
  ];

  it('identifies Indonesian and English variations of built-in fields', () => {
    expect(identifyField('Nomor Halaman')).toBe('pageNumber');
    expect(identifyField('Page')).toBe('pageNumber');
    expect(identifyField('Hal')).toBe('pageNumber');
    expect(identifyField('QR Code Link')).toBe('qrContent');
    expect(identifyField('Destinasi URL')).toBe('qrContent');
    expect(identifyField('Status Hasil')).toBe('testStatus');
    expect(identifyField('Verdict')).toBe('testStatus');
    expect(identifyField('Catatan Tambahan')).toBe('notes');
    expect(identifyField('Waktu Uji')).toBe('scannedAt');
    expect(identifyField('Timestamp')).toBe('scannedAt');
  });

  it('keeps defaults if row 1 is empty', () => {
    const res = syncFromRowHeaders([], baseFields, defaultMappings);
    expect(res.mappings).toEqual(defaultMappings);
    expect(res.matchedCount).toBe(0);
  });

  it('maps custom spreadsheet header and adds unknown columns as custom fields', () => {
    const rowHeaders = ['No', 'Halaman Buku', 'Link QR', 'Status', 'Catatan', 'Nama Penguji'];
    const res = syncFromRowHeaders(rowHeaders, baseFields, defaultMappings);

    // Halaman Buku -> pageNumber (Col B)
    const pageMap = res.mappings.find((m) => m.fieldId === 'pageNumber');
    expect(pageMap?.columnLetter).toBe('B');

    // Link QR -> qrContent (Col C)
    const qrMap = res.mappings.find((m) => m.fieldId === 'qrContent');
    expect(qrMap?.columnLetter).toBe('C');

    // Status -> testStatus (Col D)
    const statusMap = res.mappings.find((m) => m.fieldId === 'testStatus');
    expect(statusMap?.columnLetter).toBe('D');

    // Nama Penguji -> new custom field (Col F)
    const pengujiMap = res.mappings.find((m) => m.headerName === 'Nama Penguji');
    expect(pengujiMap?.columnLetter).toBe('F');

    const pengujiField = res.fields.find((f) => f.label === 'Nama Penguji');
    expect(pengujiField).toBeDefined();
    expect(pengujiField?.isBuiltIn).toBe(false);
  });

  it('adopts fetched Google Sheets Data Validation dropdown options for matching columns', () => {
    const rowHeaders = ['Page', 'URL', 'Status Hasil'];
    const validationRules = {
      2: { options: ['Cocok', 'Tidak Cocok'], type: 'select' as const }
    };

    const res = syncFromRowHeaders(rowHeaders, baseFields, defaultMappings, validationRules);
    const statusField = res.fields.find((f) => f.id === 'testStatus');

    expect(statusField).toBeDefined();
    expect(statusField?.type).toBe('select');
    expect(statusField?.options).toEqual(['Cocok', 'Tidak Cocok']);
    expect(statusField?.defaultValue).toBe('Cocok');
  });
});
