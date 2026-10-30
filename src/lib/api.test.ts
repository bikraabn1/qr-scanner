import { describe, it, expect, vi } from 'vitest';
import {
  submitRecord,
  pingGoogleSheets,
  fetchSpreadsheetMetadata,
  buildSheetsRowArray,
  findTargetRow,
  isRealRecord,
  updateSheetCell
} from './api';
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

  it('writes a single cell to the right A1 address', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      calls.push(`${init?.method || 'GET'} ${url} ${init?.body || ''}`);
      return new Response(JSON.stringify({}), { status: 200 });
    }));
    await updateSheetCell('sheet-1', 'Sheet1', 7, 1, 'Halaman 7', 'tok');
    const url = calls[0];
    expect(url).toContain("!B7");
    expect(url).toContain('valueInputOption=USER_ENTERED');
    expect(url).toContain('Halaman 7');

    // 26th column must roll over to AA
    await updateSheetCell('sheet-1', 'Sheet1', 3, 26, 'x', 'tok');
    expect(calls[1]).toContain('!AA3');

    vi.unstubAllGlobals();
  });

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

  it('finds the next available empty row slot even when other columns have template defaults', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        values: [
          ['LINK QR'],
          ['https://media.example.com/1'],
          ['https://media.example.com/2'],
          ['https://media.example.com/3'],
          ['https://media.example.com/4'],
          ['https://media.example.com/5'],
          // Row 7 has empty QR cell (even if column H has "Bukan")
          ['']
        ]
      })
    });
    vi.stubGlobal('fetch', fakeFetch);

    const targetRow = await findTargetRow('test-sheet-id-12345', 'Sheet1', 'B', 'fake-token');
    expect(targetRow).toBe(7);

    vi.unstubAllGlobals();
  });

  it('filters out boilerplate template-only rows in isRealRecord', () => {
    expect(isRealRecord([])).toBe(false);
    expect(isRealRecord(['', '', ''])).toBe(false);
    expect(isRealRecord(['', '', '', '', '', '', '', 'Bukan', ''])).toBe(false);
    expect(isRealRecord(['FALSE'])).toBe(false);

    // Real rows with scanned data
    expect(
      isRealRecord([
        '131304.81',
        'Eksplorasi Ilmu Pengetahuan Alam',
        'Platinum',
        '14',
        'https://media.tigaserangkai.com/512845160787409989',
        'Video',
        '',
        'Ya',
        'Sesuai'
      ])
    ).toBe(true);

    expect(isRealRecord(['', '', '30', 'https://media.tigaserangkai.com/420273509611150779'])).toBe(true);
  });

  it('calls Google Sheets API v4 values:batchUpdate targeted to the empty row slot', async () => {
    const fakeFetch = vi.fn()
      // First call: findTargetRow reads column B:B
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          values: [
            ['LINK QR'],
            ['https://media.example.com/1'],
            ['https://media.example.com/2']
          ]
        })
      })
      // Second call: batchUpdate to row 4
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalUpdatedRows: 1
        })
      });
    vi.stubGlobal('fetch', fakeFetch);

    const res = await submitRecord(record, config, fields, mappings, 'valid-test-bearer-token');
    expect(res.success).toBe(true);
    expect(res.rowNumber).toBe(4);

    expect(fakeFetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/values:batchUpdate'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer valid-test-bearer-token',
          'Content-Type': 'application/json'
        }),
        body: expect.stringContaining("'Sheet1'!B4")
      })
    );

    vi.unstubAllGlobals();
  });

  it('falls back to values.append when column inspection fails', async () => {
    const fakeFetch = vi.fn()
      // First call: findTargetRow fails
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'backend error'
      })
      // Second call: fallback to append
      .mockResolvedValueOnce({
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

    expect(fakeFetch).toHaveBeenLastCalledWith(
      expect.stringContaining("values/'Sheet1'!A%3AZ:append"),
      expect.objectContaining({
        method: 'POST'
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
