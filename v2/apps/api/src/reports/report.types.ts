/* ============================================================================
   Reports — the shape every report shares.

   A report is a table with a title: columns typed by what they hold (money,
   a count, a date), rows of plain values, a totals row, a few headline
   figures for the tiles, and the range and filters it was run for. One shape
   means one on-screen viewer, one PDF layout, one spreadsheet writer, one CSV
   — a new report is a query, never a screen.
   ========================================================================== */

export type ColType = 'text' | 'money' | 'int' | 'num' | 'date' | 'pct' | 'days';

export interface Col {
  key: string;
  label: string;
  type: ColType;
  /** Column width hint for the PDF, in relative units. Text columns default wider. */
  w?: number;
  /** Text columns that should stay narrow and never wrap (an id, a status). */
  tight?: boolean;
}

/** A cell is a plain value; `href` is where the row goes when clicked. */
export type Row = Record<string, string | number> & { href?: string };

export interface Stat { label: string; value: number; type: ColType }

/** What a report can be asked for besides the range. Options come with the
    catalogue so the viewer can draw a dropdown without a second request;
    a `client` filter is loaded on demand — a customer list can be long. */
export interface FilterSpec {
  key: string;
  label: string;
  kind: 'select' | 'client';
  options?: Array<{ key: string; label: string }>;
  /** The report cannot run without it (a statement needs a customer). */
  required?: boolean;
}

export type RangeKind =
  /** The rows are the events inside from..to (invoices raised, receipts taken). */
  | 'period'
  /** The rows are a position on a date: balances "as of" `to`. */
  | 'asOf';

export interface ReportMeta {
  key: string;
  title: string;
  section: string;
  /** One line for the index card and the top of the report. */
  description: string;
  range: RangeKind;
  filters?: FilterSpec[];
  /** Landscape when there are more columns than a portrait page holds. */
  landscape?: boolean;
}

export interface RunParams {
  from: string;
  to: string;
  /** The branch scope already clamped: null = everything. */
  scope: string[] | null;
  filters: Record<string, string>;
}

export interface ReportResult {
  key: string;
  title: string;
  section: string;
  description: string;
  range: { from: string; to: string; kind: RangeKind };
  branchName: string;
  /** Filters echoed back as labels, for the header line. */
  filterText: string[];
  columns: Col[];
  rows: Row[];
  totals?: Row;
  stats: Stat[];
  /** The same stats for the previous period of the same length, when asked. */
  prev?: Stat[];
  generatedAt: string;
  generatedBy: string;
  /** A note the report wants printed under the table (what is excluded, how a
      figure is derived). */
  note?: string;
}
