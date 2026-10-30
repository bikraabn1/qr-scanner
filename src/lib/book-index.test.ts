import { describe, it, expect } from 'vitest';
import { buildBookIndex, buildSheetIndex, findSkuField, findNameField } from './book-index';
import type { ColumnMapping, FieldDefinition } from './types';

const fields: FieldDefinition[] = [
  { id: 'pageNumber', label: 'HALAMAN', type: 'number', required: true, enabled: true, isBuiltIn: true },
  { id: 'custom_sku_1', label: 'SKU', type: 'text', required: true, enabled: true },
  { id: 'custom_judul_2', label: 'JUDUL', type: 'text', required: true, enabled: true }
];

const mappings: ColumnMapping[] = [
  { fieldId: 'pageNumber', columnLetter: 'D' },
  { fieldId: 'custom_sku_1', columnLetter: 'A' },
  { fieldId: 'custom_judul_2', columnLetter: 'B' }
];

describe('book index (SKU -> judul)', () => {
  it('finds the SKU and title fields by header label', () => {
    expect(findSkuField(fields)?.id).toBe('custom_sku_1');
    expect(findNameField(fields)?.id).toBe('custom_judul_2');
  });

  it('never picks the SKU field as the title', () => {
    const only: FieldDefinition[] = [
      { id: 'custom_kode_1', label: 'KODE BUKU', type: 'text', required: false, enabled: true }
    ];
    expect(findNameField(only)).toBeUndefined();
  });

  it('maps an existing SKU to its row and title, case-insensitively', () => {
    const rows = [
      { rowNumber: 2, cells: ['141202.393', 'English Grade X', '', '4'] },
      { rowNumber: 3, cells: ['141202.394', 'English Grade XI', '', '8'] }
    ];
    const index = buildBookIndex(rows, fields, mappings);

    expect(index.get('141202.393')?.name).toBe('English Grade X');
    expect(index.get('141202.393')?.rowNumber).toBe(2);
    expect(index.get('141202.394')?.name).toBe('English Grade XI');
    expect(index.get('999')).toBeUndefined();
  });

  it('skips blank SKUs and keeps the first row on duplicates', () => {
    const rows = [
      { rowNumber: 2, cells: ['', 'No SKU', '', '1'] },
      { rowNumber: 3, cells: ['DUP', 'Pertama', '', '2'] },
      { rowNumber: 4, cells: ['DUP', 'Kedua', '', '3'] }
    ];
    const index = buildBookIndex(rows, fields, mappings);

    expect(index.size).toBe(1);
    expect(index.get('dup')?.name).toBe('Pertama');
  });

  it('forward-fills blank SKU/JUDUL so every page of a book is found by page number', () => {
    // Real sheet shape: one SKU + title, then blank SKU/JUDUL rows for the next pages.
    const rows = [
      { rowNumber: 2, cells: ['131309.098', 'Terampil Menggambar', '', '3'] },
      { rowNumber: 3, cells: ['', '', '', '48'] },
      { rowNumber: 4, cells: ['', '', '', '89'] },
      { rowNumber: 5, cells: ['', '', '', '149'] }
    ];
    const { bySku, byPage } = buildSheetIndex(rows, fields, mappings);

    expect(bySku.get('131309.098')?.pages).toBe(4);
    expect(byPage.get('48')?.name).toBe('Terampil Menggambar');
    expect(byPage.get('149')?.sku).toBe('131309.098');
    expect(byPage.get('149')?.rowNumber).toBe(5);
  });

  it('returns an empty index when the SKU column is not mapped', () => {
    expect(buildBookIndex([{ rowNumber: 2, cells: ['x', 'y'] }], fields, []).size).toBe(0);
  });
});
