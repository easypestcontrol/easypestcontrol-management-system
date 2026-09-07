/* ============================================================================
   Which terms go on which document.

   Settings keeps four separate lists — quotation, invoice, contract, service
   report — because they say different things. A quotation's terms are a sales
   offer; a contract's are the agreement being signed; an invoice's are payment
   conditions. Keeping them apart is the whole point of the section.

   That rule used to be written out three times, in the settings editor, in the
   public document renderer and in the contracts controller, and the three did
   not agree. The contracts controller read the legacy shared list for every
   document it touched, so a contract was created carrying the QUOTATION's
   terms, and the contract terms the company had actually written were never
   used anywhere. Live data shows exactly that: two contracts on the server
   store "Terms aplicable / 7 day credit period" while the company's contract
   list says something else entirely.

   One function, so the four lists stay four lists.
   ========================================================================== */

export type DocKind = 'quotation' | 'invoice' | 'contract' | 'service';

/** A company row, as much of it as this needs. */
export interface TermsSource {
  terms?: string[] | null;
  docTerms?: Partial<Record<DocKind, string[]>> | null | unknown;
}

/**
 * Built-ins for the two kinds that never shared the legacy list.
 *
 * Quotations and contracts fall back to `Company.terms` instead — that column
 * predates the per-document lists and holds what those two used to print, so
 * an account that has never opened the Terms section keeps the wording it
 * already had.
 */
const BUILT_IN: Record<DocKind, string[]> = {
  quotation: [],
  contract: [],
  invoice: [
    'Payment due within 15 days of invoice date.',
    'Interest at 18% p.a. applies on overdue amounts.',
    'Subject to Chennai jurisdiction.',
  ],
  service: [
    'Chemicals applied by licensed applicators as per CIB&RC guidelines.',
  ],
};

/**
 * The terms this kind of document should print.
 *
 * An EMPTY list that exists is a decision and is honoured: somebody deleted
 * the last line on purpose, and a default that grew back would be a setting
 * that will not stay set. Only a list that was never written at all falls
 * back — to `Company.terms` for quotations and contracts, to the built-ins
 * above for invoices and service reports.
 */
export function docTermsFor(co: TermsSource | null | undefined, kind: DocKind): string[] {
  const dt = (co?.docTerms || {}) as Partial<Record<DocKind, string[]>>;
  const set = dt[kind];
  if (Array.isArray(set)) return set.filter((t) => typeof t === 'string');
  if (kind === 'quotation' || kind === 'contract') return co?.terms || [];
  return BUILT_IN[kind];
}
