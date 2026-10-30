import type { ColumnMapping, FieldDefinition, FieldType } from './types';
import { columnIndexToLetter } from './utils';

export interface ColumnValidationRule {
  columnIndex: number; // 0-based
  options?: string[];
  type?: FieldType;
}

export interface SyncHeadersResult {
  fields: FieldDefinition[];
  mappings: ColumnMapping[];
  matchedCount: number;
  newFieldsCount: number;
}

/**
 * Columns a human fills in the sheet afterwards (verification verdict). Options/types still come
 * from the sheet's own data validation — only the read-only rule lives here.
 */
const READ_ONLY_HEADERS = [/hasil.*verifikasi/, /cross\s*check/];

/** Yes/no columns — a checkbox reads better than a text box even without sheet validation. */
const BOOLEAN_HEADERS = [/internal/, /\bts\b/, /boolean/];

function isReadOnlyHeader(header: string): boolean {
  const norm = header.toLowerCase().replace(/[^a-z0-9]/g, ' ');
  return READ_ONLY_HEADERS.some((re) => re.test(norm));
}

/**
 * Match a raw column header string to existing built-in or default fields
 */
export function identifyField(headerText: string): string | null {
  const norm = headerText.toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Page Number
  if (
    norm.includes('halaman') ||
    norm.includes('page') ||
    norm === 'hal' ||
    norm === 'pg' ||
    norm.includes('pagenum')
  ) {
    return 'pageNumber';
  }

  // 2. QR Content / Destination URL
  if (
    norm.includes('qr') ||
    norm.includes('url') ||
    norm.includes('link') ||
    norm.includes('destinasi') ||
    norm.includes('destination') ||
    norm.includes('barcode')
  ) {
    return 'qrContent';
  }

  // 3. Test Verdict / Status
  if (
    norm.includes('status') ||
    norm.includes('verdict') ||
    norm.includes('hasil') ||
    norm.includes('kondisi') ||
    norm.includes('result') ||
    norm.includes('kesimpulan')
  ) {
    return 'testStatus';
  }

  // 4. Notes / Remarks
  if (
    norm.includes('catatan') ||
    norm.includes('note') ||
    norm.includes('keterangan') ||
    norm.includes('remark') ||
    norm.includes('komentar') ||
    norm.includes('comment')
  ) {
    return 'notes';
  }

  // 5. Timestamp / Scan Time
  if (
    norm.includes('waktu') ||
    norm.includes('timestamp') ||
    norm.includes('tanggal') ||
    norm.includes('date') ||
    norm.includes('time') ||
    norm.includes('scanned')
  ) {
    return 'scannedAt';
  }

  return null;
}

/**
 * Synchronize field definitions and column mappings from an array of Row 1 headers
 * and optionally extracted column validation rules (dropdown options from Google Sheets)
 */
export function syncFromRowHeaders(
  rawHeaders: (string | null | undefined)[],
  currentFields: FieldDefinition[],
  defaultMappings: ColumnMapping[],
  validationRules?: Record<number, { options?: string[]; type?: FieldType }>
): SyncHeadersResult {
  const headers = rawHeaders.map((h) => (h ? String(h).trim() : ''));
  const hasContent = headers.some((h) => h.length > 0);

  // If row 1 is completely blank, keep existing or default mappings
  if (!hasContent) {
    return {
      fields: currentFields,
      mappings: defaultMappings,
      matchedCount: 0,
      newFieldsCount: 0
    };
  }

  const newMappings: ColumnMapping[] = [];
  const assignedFieldIds = new Set<string>();
  let matchedCount = 0;
  let newFieldsCount = 0;

  // When sheet has real header content, start with empty fields list (only keep matched built-ins or created custom fields)
  const fields: FieldDefinition[] = [];

  headers.forEach((header, index) => {
    if (!header) return; // skip completely empty column
    const colLetter = columnIndexToLetter(index + 1);
    const colRule = validationRules ? validationRules[index] : undefined;

    // A verification verdict column is filled by hand in the sheet, so it must stay a plain
    // custom read-only column — never the built-in "test status" field, which is submitted.
    const readOnly = isReadOnlyHeader(header);

    // Try matching to built-in field first (a read-only verdict column stays custom: it must
    // never collapse into the built-in "test status" field, which the operator does submit)
    const matchedBuiltInId = readOnly ? null : identifyField(header);
    const existingBuiltIn = currentFields.find((f) => f.id === matchedBuiltInId);

    if (existingBuiltIn && !assignedFieldIds.has(existingBuiltIn.id)) {
      assignedFieldIds.add(existingBuiltIn.id);

      // If Google Sheets has explicit dropdown or native type (date, number, boolean) for this column, adopt them
      const updatedOptions = colRule?.options && colRule.options.length > 0
        ? colRule.options
        : existingBuiltIn.options;

      const updatedType = colRule?.options && colRule.options.length > 0
        ? 'select'
        : (colRule?.type || existingBuiltIn.type);

      fields.push({
        ...existingBuiltIn,
        label: header, // use actual header label from spreadsheet
        type: updatedType,
        options: updatedOptions,
        defaultValue: updatedOptions && updatedOptions.length > 0 ? updatedOptions[0] : existingBuiltIn.defaultValue
      });
      newMappings.push({
        fieldId: existingBuiltIn.id,
        columnLetter: colLetter,
        headerName: header
      });
      matchedCount++;
    } else {
      // Create custom field specifically for this spreadsheet column
      const slug = 'custom_' + header.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const options = colRule?.options?.length ? colRule.options : undefined;
      const normHeader = header.toLowerCase().replace(/[^a-z0-9]/g, ' ');
      const rawType = colRule?.type || (BOOLEAN_HEADERS.some((re) => re.test(normHeader)) ? 'boolean' : 'text');
      const isBoolean = rawType === 'boolean';
      const hasDropdown = !isBoolean && !!options && options.length > 0;

      const newField: FieldDefinition = {
        id: slug + '_' + (index + 1),
        label: header,
        type: isBoolean ? 'boolean' : hasDropdown ? 'select' : rawType,
        options,
        defaultValue: isBoolean
          ? false
          : hasDropdown && options
            ? options[0]
            : undefined,
        required: false,
        enabled: true,
        isBuiltIn: false,
        readOnly
      };
      fields.push(newField);
      assignedFieldIds.add(newField.id);
      newMappings.push({
        fieldId: newField.id,
        columnLetter: colLetter,
        headerName: header
      });
      newFieldsCount++;
    }
  });

  return {
    fields,
    mappings: newMappings,
    matchedCount,
    newFieldsCount
  };
}
