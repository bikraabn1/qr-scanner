import type { ColumnMapping, FieldDefinition } from './types';
import { columnLetterToIndex } from './utils';

const SKU_RE = /sku|kode|code|isbn|barcode/;
const NAME_RE = /nama|judul|title|buku|book|name/;
const PAGE_RE = /halaman|page|\bhal\b|\bpg\b/;

function text(f: FieldDefinition): string {
  return `${f.id} ${f.label}`.toLowerCase();
}

/** Field holding the book identifier (SKU / kode / ISBN). */
export function findSkuField(fields: FieldDefinition[]): FieldDefinition | undefined {
  return fields.find((f) => SKU_RE.test(text(f)));
}

/** Field holding the book title — never the same field as the SKU. */
export function findNameField(fields: FieldDefinition[]): FieldDefinition | undefined {
  const sku = findSkuField(fields);
  return fields.find((f) => f.id !== sku?.id && NAME_RE.test(text(f)));
}

function columnIndex(fieldId: string | undefined, mappings: ColumnMapping[]): number | null {
  if (!fieldId) return null;
  const letter = mappings.find((m) => m.fieldId === fieldId)?.columnLetter?.trim();
  if (!letter) return null;
  try {
    return columnLetterToIndex(letter) - 1;
  } catch {
    return null;
  }
}

export interface KnownBook {
  rowNumber: number;
  sku: string;
  name: string;
  /** How many rows in the sheet already carry this SKU (one book spans many pages). */
  pages: number;
  cells: string[];
}

export interface SheetIndex {
  /** SKU (lowercased) -> the first row carrying it. */
  bySku: Map<string, KnownBook>;
  /** Page number -> the row for that page, SKU/title forward-filled. */
  byPage: Map<string, KnownBook>;
}

/**
 * Index the rows already in the sheet so the operator never retypes what the sheet knows:
 * picking a known SKU fills the title, and typing a page number fills SKU + title.
 *
 * Sheets leave the SKU/title cells blank when one book spans many pages (only HALAMAN differs),
 * so both are forward-filled from the row above — without that, every page but the first of a
 * book looks like an unknown row.
 */
export function buildSheetIndex(
  rows: { rowNumber: number; cells: string[] }[],
  fields: FieldDefinition[],
  mappings: ColumnMapping[]
): SheetIndex {
  const empty: SheetIndex = { bySku: new Map(), byPage: new Map() };
  const skuIdx = columnIndex(findSkuField(fields)?.id, mappings);
  if (skuIdx === null) return empty;
  const nameIdx = columnIndex(findNameField(fields)?.id, mappings);
  const pageIdx = columnIndex(fields.find((f) => PAGE_RE.test(text(f)))?.id, mappings);

  const bySku = new Map<string, KnownBook>();
  const byPage = new Map<string, KnownBook>();
  let carriedSku = '';
  let carriedName = '';

  for (const row of rows) {
    const sku = (row.cells[skuIdx] || '').trim() || carriedSku;
    const name = (nameIdx === null ? '' : (row.cells[nameIdx] || '').trim()) || carriedName;
    if (sku) carriedSku = sku;
    if (name) carriedName = name;
    if (!sku) continue;

    const key = sku.toLowerCase();
    const known = bySku.get(key);
    if (known) {
      known.pages++; // same book, next page — not a duplicate error
    } else {
      bySku.set(key, { rowNumber: row.rowNumber, sku, name, pages: 1, cells: row.cells });
    }
    const book = bySku.get(key)!;

    if (pageIdx !== null) {
      const page = (row.cells[pageIdx] || '').trim();
      // Row-specific copy: the page entry must point at its own row, not the book's first row.
      if (page && !byPage.has(page)) byPage.set(page, { ...book, rowNumber: row.rowNumber });
    }
  }

  return { bySku, byPage };
}

/** SKU-only index (kept for callers that do not need the page lookup). */
export function buildBookIndex(
  rows: { rowNumber: number; cells: string[] }[],
  fields: FieldDefinition[],
  mappings: ColumnMapping[]
): Map<string, KnownBook> {
  return buildSheetIndex(rows, fields, mappings).bySku;
}
