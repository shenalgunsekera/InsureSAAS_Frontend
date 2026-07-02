// Shared CSV header mapping for client import/export.
//
// Two underwriting fields keep legacy storage keys whose names read awkwardly
// in an exported spreadsheet ("total_invoice", "commission_amount_paid").
// The data keys are NOT renamed (existing records depend on them), but every
// CSV the user sees — template, backup, generated import sheet — uses the
// friendly header instead, and the importer accepts BOTH spellings.

// internal storage key -> friendly header shown in exported CSVs
export const EXPORT_HEADER = {
  total_invoice: 'total_premium',
  commission_amount_paid: 'commission_amount_received',
};

// friendly header (as seen in a CSV) -> internal storage key, for import
export const IMPORT_ALIAS = {
  total_premium: 'total_invoice',
  commission_amount_received: 'commission_amount_paid',
};

// header shown in an exported CSV for a given storage key
export const exportHeader = (key) => EXPORT_HEADER[key] || key;

// Normalise a parsed CSV row in place: friendly headers -> storage keys.
// The raw legacy key still passes through untouched, so old backups import too.
export function normaliseImportRow(row) {
  for (const [alias, key] of Object.entries(IMPORT_ALIAS)) {
    if (alias in row) {
      if (row[alias] !== '' && row[alias] != null && (row[key] === undefined || row[key] === '')) {
        row[key] = row[alias];
      }
      delete row[alias];
    }
  }
  return row;
}
