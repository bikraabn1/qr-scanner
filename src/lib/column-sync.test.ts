import { describe, it, expect } from 'vitest';
import { inferChoiceLabels } from './column-sync';
import type { FieldDefinition } from './types';

const mappings = [{ fieldId: 'custom_konten_internal_ts__8', columnLetter: 'H' }];

const field: FieldDefinition = {
  id: 'custom_konten_internal_ts__8',
  label: 'KONTEN INTERNAL TS?',
  type: 'boolean',
  required: false,
  enabled: true
};

const rows = [
  { cells: ['', '', '', '', '', '', '', 'Bukan'] },
  { cells: ['', '', '', '', '', '', '', 'Ya'] },
  { cells: ['', '', '', '', '', '', '', 'Bukan'] },
  { cells: ['', '', '', '', '', '', '', ''] }
];

describe('inferChoiceLabels', () => {
  it('labels a Ya/Bukan checkbox column from its own values, affirmative first', () => {
    const [out] = inferChoiceLabels([field], mappings, rows);
    expect(out.options).toEqual(['Ya', 'Bukan']);
  });

  it('leaves columns that already have validation options untouched', () => {
    const withOptions = { ...field, options: ['TRUE', 'FALSE'] };
    expect(inferChoiceLabels([withOptions], mappings, rows)[0].options).toEqual(['TRUE', 'FALSE']);
  });

  it('does not invent labels for a free-text column', () => {
    const text: FieldDefinition = { ...field, type: 'text' };
    const [out] = inferChoiceLabels([text], mappings, rows);
    expect(out.options).toBeUndefined();
  });
});
