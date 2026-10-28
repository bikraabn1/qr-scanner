import { describe, it, expect, vi } from 'vitest';
import { submitRecord, pingGoogleSheets } from './api';
import type { AppConfig, FieldDefinition, ColumnMapping, QRRecord } from './types';

describe('API Integration Layer', () => {
  const dummyConfig: AppConfig = {
    dummyMode: true,
    scriptUrl: '',
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

  it('submits successfully in Dummy Mode without network calls', async () => {
    const res = await submitRecord(record, dummyConfig, fields, mappings);
    expect(res.success).toBe(true);
    expect(res.simulated).toBe(true);
    expect(res.message).toContain('Dummy Mode');
  });

  it('throws descriptive error if live mode is active without scriptUrl', async () => {
    const liveConfigNoUrl: AppConfig = {
      ...dummyConfig,
      dummyMode: false,
      scriptUrl: ''
    };

    await expect(
      submitRecord(record, liveConfigNoUrl, fields, mappings)
    ).rejects.toThrow('Google Apps Script Web App URL is not configured');
  });

  it('handles live fetch and parses success payload', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', row: 42, message: 'Row 42 written' })
    });
    vi.stubGlobal('fetch', fakeFetch);

    const liveConfig: AppConfig = {
      ...dummyConfig,
      dummyMode: false,
      scriptUrl: 'https://script.google.com/macros/s/fake/exec'
    };

    const res = await submitRecord(record, liveConfig, fields, mappings);
    expect(res.success).toBe(true);
    expect(res.rowNumber).toBe(42);

    expect(fakeFetch).toHaveBeenCalledWith(
      'https://script.google.com/macros/s/fake/exec',
      expect.objectContaining({
        method: 'POST'
      })
    );

    vi.unstubAllGlobals();
  });
});
