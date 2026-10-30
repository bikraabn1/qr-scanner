import { appState } from './store.svelte';
import { fetchSheetHeaders, fetchSheetValidationRules } from './api';
import { syncFromRowHeaders } from './sheet-sync';
import { columnLetterToIndex } from './utils';
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

export const YES_RE = /^(ya|yes|true|1|v|✓|centang)$/i;

/**
 * A column whose choices live in its own data ("KONTEN INTERNAL TS?" holds Ya/Bukan) has no
 * data-validation rule to read, so its labels are inferred from the values already in it.
 * Without this a checkbox submits TRUE/FALSE into a text column that expects "Ya"/"Bukan".
 */
export function inferChoiceLabels(
  fields: FieldDefinition[],
  mappings: { fieldId: string; columnLetter: string }[],
  rows: { cells: string[] }[]
): FieldDefinition[] {
  let changed = false;
  const next = fields.map((field) => {
    if (field.options?.length) return field;
    if (field.type !== 'boolean' && field.type !== 'select') return field;

    const letter = mappings.find((m) => m.fieldId === field.id)?.columnLetter?.trim();
    if (!letter) return field;
    let idx: number;
    try {
      idx = columnLetterToIndex(letter) - 1;
    } catch {
      return field;
    }

    const seen = new Set<string>();
    for (const row of rows) {
      const v = (row.cells[idx] ?? '').trim();
      if (v) seen.add(v);
      if (seen.size > 20) break;
    }
    if (seen.size === 0 || seen.size > 20) return field;
    if (field.type === 'boolean' && seen.size !== 2) return field;

    // Checkbox labels: the affirmative one first, so options[0] means "checked".
    const values = [...seen].sort((a, b) => Number(YES_RE.test(b)) - Number(YES_RE.test(a)));
    changed = true;
    return { ...field, options: values };
  });

  return changed ? next : fields;
}
