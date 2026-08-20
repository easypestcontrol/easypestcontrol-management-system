/* Shared looks for the Expenses module — the category glyphs and the status
   chips, one source so the shelf and the folder always match. */

export const CATEGORY_GLYPH: Record<string, string> = {
  'Fuel / Petrol': '⛽',
  'Food & tea': '🍱',
  'Travel (bus / train / auto)': '🚌',
  'Materials & supplies': '🧰',
  'Vehicle repair': '🔧',
  'Mobile recharge': '📱',
  'Accommodation': '🏨',
  'Other': '🧾',
  'Trip allowance': '🛵',
};

export const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  open: { label: 'OPEN', cls: 'bg-wash text-muted border border-line' },
  submitted: { label: 'AWAITING APPROVAL', cls: 'bg-red-wash text-accent' },
  approved: { label: 'TO PAY', cls: 'bg-navy text-white' },
  rejected: { label: 'RETURNED', cls: 'bg-red-wash text-accent border border-red-line' },
  paid: { label: 'PAID', cls: 'bg-wash text-navy border border-navy' },
};
