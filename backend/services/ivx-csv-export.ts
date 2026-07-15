/**
 * IVX CSV export service — PHASE 2 (Real Deliverable System).
 *
 * Turns structured rows into a RFC-4180-correct CSV byte buffer that the
 * deliverable pipeline uploads to Supabase Storage. Pure + deterministic
 * (no I/O, no network) so it is fully unit-testable and can never throw into
 * the worker queue.
 */

export const IVX_CSV_EXPORT_MARKER = 'ivx-csv-export-2026-06-01';

export type CsvRow = Record<string, unknown>;

export type CsvBuildResult = {
  /** The full CSV document as a string (header + rows). */
  text: string;
  /** UTF-8 encoded bytes ready for upload. */
  bytes: Uint8Array;
  /** Byte length of the encoded document. */
  byteLength: number;
  /** Ordered column headers used. */
  columns: string[];
  /** Number of data rows (excludes the header). */
  rowCount: number;
};

/** Escape a single CSV field per RFC 4180 (quote when needed, double inner quotes). */
function escapeCsvField(value: unknown): string {
  let text: string;
  if (value === null || value === undefined) {
    text = '';
  } else if (typeof value === 'string') {
    text = value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    text = String(value);
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  // Quote if the field contains a comma, quote, CR or LF.
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Derive the column set from the rows (stable insertion order across all rows)
 * unless an explicit column list is supplied.
 */
function resolveColumns(rows: CsvRow[], explicit?: string[]): string[] {
  if (explicit && explicit.length > 0) return explicit;
  const seen = new Set<string>();
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  return columns;
}

/**
 * Build a CSV document from rows. Columns are inferred from the row keys
 * (in first-seen order) unless `columns` is provided. Uses CRLF line endings
 * per RFC 4180. Never throws — malformed values are stringified safely.
 */
export function buildCsv(rows: CsvRow[], columns?: string[]): CsvBuildResult {
  const safeRows = Array.isArray(rows) ? rows : [];
  const cols = resolveColumns(safeRows, columns);
  const lines: string[] = [];
  lines.push(cols.map((c) => escapeCsvField(c)).join(','));
  for (const row of safeRows) {
    lines.push(cols.map((c) => escapeCsvField(row?.[c])).join(','));
  }
  const text = lines.join('\r\n');
  const bytes = new TextEncoder().encode(text);
  return {
    text,
    bytes,
    byteLength: bytes.byteLength,
    columns: cols,
    rowCount: safeRows.length,
  };
}
