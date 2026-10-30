import { appState } from './store.svelte';
import { fetchSheetHeaders, fetchSheetValidationRules } from './api';
import { syncFromRowHeaders } from './sheet-sync';
import type { FieldDefinition } from './types';

/** Shape that matters for the form: a stored field is stale if any of these drift. */
function shape(fields: FieldDefinition[]): string {
  return JSON.stringify(
    fields.map((f) => [f.id, f.label, f.type, f.readOnly ?? false, f.options ?? null])
  );
}

/**
 * Re-derive the form from the sheet's own row 1 + data validation (the green dropdowns).
 * Fields live in localStorage, so without this a previously synced sheet keeps yesterday's
 * column types — no dropdowns, no checkboxes, no read-only columns.
 *
 * Returns a short notice, or '' when nothing needed syncing.
 */
export async function syncColumnsFromSheet(): Promise<string> {
  const id = appState.config.spreadsheetId?.trim();
  const sheet = appState.config.sheetName?.trim();
  if (!id || !sheet || !appState.accessToken) return '';

  const [headers, rules] = await Promise.all([
    fetchSheetHeaders(id, sheet),
    fetchSheetValidationRules(id, sheet)
  ]);
  if (!headers?.length) return '';

  const result = syncFromRowHeaders(headers, appState.fields, appState.mappings, rules);
  if (shape(result.fields) === shape(appState.fields)) return '';

  appState.saveFields(result.fields);
  appState.saveMappings(result.mappings);
  const dropdowns = Object.values(rules).filter((r) => r.options?.length).length;
  return `Kolom disinkron dari tab "${sheet}" (${dropdowns} dropdown).`;
}
