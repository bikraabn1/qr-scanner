import { describe, it, expect, vi } from 'vitest';
import { submitRecord, pingGoogleSheets, fetchSpreadsheetMetadata, buildSheetsRowArray } from './api';
import type { AppConfig, FieldDefinition, ColumnMapping, QRRecord } from './types';

describe('Google Sheets Direct API Integration Layer', () => {
  const config: AppConfig = {
    clientId: 'test-client-id.apps.googleusercontent.com',
    spreadsheetId: 'test-sheet-id-12345',
    sheetName: 'Sheet1',
    writeStrategy: 'append',
    updateKeyFieldId: 'qrContent',
    autoClearOnSubmit: true
  };

  const fields: FieldDefinition[] = [
    { id: 'pageNumber', label: 'Page', type: 'number', required: true, enabled: true, isBuiltIn: true },
    { id: 'qrContent', label: 'QR', type: 'url', required: true, enabled: true, isBuiltIn: true },
    { id: 'testStatus', label: 'Status', type: 'select', required: true, enabled: true, isBuiltIn: true }
  ];

  const mappings: ColumnMapping[] = [
    { fieldId: 'pageNumber', columnLetter: 'A' },
    { fieldId: 'qrContent', columnLetter: 'B' },
    { fieldId: 'testStatus', columnLetter: 'C' }
  ];

  const record: QRRecord = {
    recordId: 'rec-test-1',
    pageNumber: 15,
    qrContent: 'https://example.com/qr/15',
    testStatus: 'PASS',
    notes: 'Sample check note',
    scannedAt: '2026-10-28T12:00:00.000Z',
    customFields: {},
    submissionStatus: 'saving'
  };

  it('builds zero-indexed row array according to column mappings', () => {
    const row = buildSheetsRowArray(record, fields, mappings);
    expect(row).toEqual([15, 'https://example.com/qr/15', 'PASS']);
  });

  it('throws descriptive error if spreadsheetId is not set', async () => {
    const noSheetConfig: AppConfig = { ...config, spreadsheetId: '' };
    await expect(
      submitRecord(record, noSheetConfig, fields, mappings, 'fake-token')
    ).rejects.toThrow('Spreadsheet ID belum diisi');
  });

  it('throws descriptive error if access token is missing', async () => {
    await expect(
      submitRecord(record, config, fields, mappings, '')
    ).rejects.toThrow('Belum login Google');
  });

  it('calls Google Sheets API v4 values.append and parses updated row', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        updates: {
          updatedRange: 'Sheet1!A42:C42',
          updatedRows: 1
        }
      })
    });
    vi.stubGlobal('fetch', fakeFetch);

    const res = await submitRecord(record, config, fields, mappings, 'valid-test-bearer-token');
    expect(res.success).toBe(true);
    expect(res.rowNumber).toBe(42);

    expect(fakeFetch).toHaveBeenCalledWith(
      expect.stringContaining("values/'Sheet1'!A%3AZ:append"),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer valid-test-bearer-token'
        })
      })
    );

    vi.unstubAllGlobals();
  });

  it('handles 403 Forbidden with clear permission guidance', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'The caller does not have permission'
    });
    vi.stubGlobal('fetch', fakeFetch);

    await expect(
      submitRecord(record, config, fields, mappings, 'unauthorized-token')
    ).rejects.toThrow(/Akses Spreadsheet ditolak \(403 Forbidden\)/);

    vi.unstubAllGlobals();
  });

  it('fetches metadata and list of sheet tabs correctly', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        properties: { title: 'Book Quality Audit 2026' },
        sheets: [
          { properties: { title: 'Bab 1' } },
          { properties: { title: 'Bab 2' } },
          { properties: { title: 'Rekap' } }
        ]
      })
    });
    vi.stubGlobal('fetch', fakeFetch);

    const meta = await fetchSpreadsheetMetadata('test-sheet-id-12345', 'valid-token');
    expect(meta.title).toBe('Book Quality Audit 2026');
    expect(meta.sheetNames).toEqual(['Bab 1', 'Bab 2', 'Rekap']);

    vi.unstubAllGlobals();
  });
});
