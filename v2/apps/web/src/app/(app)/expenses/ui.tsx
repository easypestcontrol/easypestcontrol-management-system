/* Shared looks for the Expenses module — category icons and the expense-level
   status chips, one source so every screen matches. Brand palette only:
   navy / red / amber, no green. */

import type { IconName } from '@/components/icons';

export const CATEGORIES = [
  'Trip / Travel', 'Petrol / Fuel', 'Materials', 'Parking', 'Toll',
  'Vehicle Maintenance', 'Food', 'Tools / Equipment', 'Office', 'Miscellaneous',
];

const ICON: Record<string, IconName> = {
  'Trip / Travel': 'road',
  'Petrol / Fuel': 'fuel',
  'Materials': 'tools',
  'Parking': 'receipt',
  'Toll': 'road',
  'Vehicle Maintenance': 'wrench',
  'Food': 'food',
  'Tools / Equipment': 'tools',
  'Office': 'report',
  'Miscellaneous': 'receipt',
};
export const catIcon = (name: string): IconName => ICON[name] || 'receipt';

export const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  pending:        { label: 'PENDING',        cls: 'bg-amber text-amber-ink' },
  approved:       { label: 'APPROVED',       cls: 'bg-wash text-navy border border-navy' },
  rejected:       { label: 'REJECTED',       cls: 'bg-red-wash text-accent border border-red-line' },
  processing:     { label: 'PROCESSING',     cls: 'bg-amber text-amber-ink' },
  reimbursed:     { label: 'REIMBURSED',     cls: 'bg-navy text-white' },
  payment_failed: { label: 'PAYMENT FAILED', cls: 'bg-red-wash text-accent border border-red-line' },
};
export const chip = (s: string) => STATUS_CHIP[s] || STATUS_CHIP.pending;
